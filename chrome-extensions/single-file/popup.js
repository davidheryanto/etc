// Orchestrates one capture. Opening the popup starts it, so the wait happens
// while you are deciding which format you want; the buttons enable when the
// canonical document is ready.
//
// Image fetching happens here rather than in the page: an extension page holds
// host_permissions, so it can read cross-origin images that a content script
// would be refused by CORS. It is also the only context in this extension with
// both a DOM and URL.createObjectURL — an MV3 service worker has neither.

// A single image past this is a video poster or a print-resolution photo;
// inlining it would cost more than the page is worth.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// Total inlined payload. Past it, images degrade to links in document order,
// so what survives is what you would read first.
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
// Bounds what is held in memory at once, which the per-image ceiling does not.
// Higher than the output budget because the budget is charged in base64 and
// spent in document order, so some of what is fetched is legitimately unused.
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const CONCURRENCY = 6;

// Generous next to a capture's ~2s, because it is a last resort rather than a
// budget: whatever is still running at 30 seconds is stuck, not slow.
const CAPTURE_TIMEOUT = 30000;
const FETCH_TIMEOUT = 10000;

// The same rule capture.js applies to link targets, enforced again wherever a
// page-supplied string could become an href in the saved file.
const SAFE_LINK = /^(https?:|mailto:|#)/i;

// Under both of these, the capture is probably a login wall, an empty SPA, or
// a strip rule that ate the page.
const MIN_WORDS = 200;
const MIN_IMAGES = 3;

const status = document.getElementById("status");
const warning = document.getElementById("warning");
const buttons = {
	html: document.getElementById("html"),
	markdown: document.getElementById("markdown"),
	pdf: document.getElementById("pdf"),
};

const readFile = (path) => fetch(chrome.runtime.getURL(path)).then((r) => r.text());

const toDataUri = (blob) =>
	new Promise((done, fail) => {
		const reader = new FileReader();
		reader.onload = () => done(reader.result);
		reader.onerror = fail;
		reader.readAsDataURL(blob);
	});

async function fetchAssets(urls) {
	const blobs = new Array(urls.length).fill(null);
	// A page that uses one hero image in six places should pay for it once.
	// The *promise* is cached, not the blob: with six workers running, the
	// duplicates are usually all in flight before the first one resolves, and
	// caching only finished results would still fetch each of them.
	const byUrl = new Map();
	// Everything fetched is held in memory at once, so the per-image ceiling
	// alone does not bound the total. Downloading stops here; images past it
	// degrade to links exactly as if they had failed.
	let downloaded = 0;

	// The popup fetches with the extension's privileges, which reach places the
	// page cannot: a hostile public page naming http://127.0.0.1:8080/… or an
	// RFC1918 address would otherwise have this issue the request on its behalf
	// and inline the answer. Allowed only when the captured page is itself on
	// that host, which is what makes a localhost dev page still capturable.
	let pageHost = "";
	try {
		pageHost = new URL(page.url).hostname;
	} catch {}
	// Deliberately broad, and matched against the bracket-stripped host: the
	// forms that look exotic — foo.localhost, an IPv4-mapped ::ffff:7f00:1, an
	// fd00::/8 unique-local address — resolve to the same places as the
	// obvious ones. Anything unparseable is treated as private, since a host
	// this cannot classify is not one to fetch with the extension's
	// privileges.
	const isPrivate = (raw) => {
		const host = raw.replace(/^\[|\]$/g, "").toLowerCase();
		if (!host) return true;
		if (host === "localhost" || host.endsWith(".localhost")) return true;
		if (host.endsWith(".local") || host.endsWith(".internal")) return true;
		if (host === "::1" || host === "::" || host === "0.0.0.0") return true;
		// IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
		if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return true;
		// IPv4-mapped and IPv4-compatible IPv6, which carry a v4 address in
		// their tail — classify on that rather than on the prefix.
		const mapped = /^(?:::ffff:|::)([0-9a-f.:]+)$/.exec(host);
		if (mapped) {
			if (/^\d+\.\d+\.\d+\.\d+$/.test(mapped[1])) return isPrivate(mapped[1]);
			// ::ffff:7f00:1 — hex form of the same thing.
			const hex = mapped[1].replace(/:/g, "");
			if (/^[0-9a-f]{8}$/.test(hex) && hex.startsWith("7f")) return true;
			return true;
		}
		if (/^127\./.test(host)) return true;
		if (/^10\./.test(host)) return true;
		if (/^192\.168\./.test(host)) return true;
		if (/^169\.254\./.test(host)) return true;
		if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
		return false;
	};

	const fetchOne = async (url) => {
		if (downloaded > MAX_DOWNLOAD_BYTES) return null;
		if (!url.startsWith("data:")) {
			let host = "";
			try {
				host = new URL(url).hostname;
			} catch {
				return null;
			}
			if (isPrivate(host) && host !== pageHost) return null;
		}
		// Without a deadline one hanging request leaves the popup on
		// "Fetching…" with the buttons disabled and nothing to do.
		const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
		if (!response.ok) return null;
		// A redirect can land somewhere the first check passed on: a public URL
		// that 302s to loopback. fetch cannot be asked to validate each hop —
		// redirect: "manual" yields an opaque response with no Location to
		// read — so the final URL is checked here, before any of the body is
		// read or anything is inlined.
		if (response.redirected && !response.url.startsWith("data:")) {
			let finalHost = "";
			try {
				finalHost = new URL(response.url).hostname;
			} catch {
				return null;
			}
			if (isPrivate(finalHost) && finalHost !== pageHost) return null;
		}
		// An <img> pointing at an HTML or text endpoint returns 200 with a body
		// that is not an image. Embedding it would produce a broken image and
		// could archive a private page or a localhost response as a data URI.
		//
		// The value is matched in full, not merely prefixed: a header reading
		// `image/png><img src=x onerror=…>` starts with image/ and would ride
		// into the Blob, out through FileReader as part of the data: URI, and
		// into the Markdown output as live HTML.
		const type = (response.headers.get("content-type") || "").split(";")[0].trim();
		if (type && !/^image\/[a-z0-9!#$&^_.+-]+$/i.test(type)) return null;
		// Checked before the body is read where the server declares it, so an
		// oversized image costs a header rather than its full payload.
		const declared = Number(response.headers.get("content-length") || 0);
		if (declared > MAX_IMAGE_BYTES) return null;
		// Read in chunks rather than response.blob(): a server that omits or
		// understates Content-Length would otherwise have the whole body
		// buffered before the size check could reject it.
		const chunks = [];
		let size = 0;
		const reader = response.body && response.body.getReader();
		if (!reader) return null;
		for (;;) {
			const { done: finished, value } = await reader.read();
			if (finished) break;
			size += value.byteLength;
			if (size > MAX_IMAGE_BYTES) {
				await reader.cancel();
				return null;
			}
			chunks.push(value);
		}
		downloaded += size;
		return new Blob(chunks, { type });
	};

	let next = 0;
	const worker = async () => {
		while (next < urls.length) {
			const index = next++;
			const url = urls[index];
			if (!byUrl.has(url)) {
				// A failed fetch is not an error worth stopping for: that image
				// degrades to a link and the rest of the page is unaffected.
				byUrl.set(url, fetchOne(url).catch(() => null));
			}
			blobs[index] = await byUrl.get(url);
		}
	};
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	return blobs;
}

// Replaces the asset:N placeholders capture.js left behind. Walks in document
// order so the budget is spent on what comes first.
async function inlineAssets(root, urls, blobs) {
	// The budget is charged in the size the *document* pays, not the size the
	// network paid: base64 is 4 bytes of markup for every 3 bytes of image.
	const encoded = (bytes) => Math.ceil(bytes / 3) * 4;
	// Identical URLs share one data: URI string rather than being re-encoded.
	const inlined = new Map();
	let spent = 0;
	for (const img of [...root.querySelectorAll("img")]) {
		const source = img.getAttribute("src") || "";
		const index = /^asset:(\d+)$/.exec(source);
		if (!index) continue;
		const original = urls[Number(index[1])];
		const blob = blobs[Number(index[1])];
		// Every occurrence is charged, not only the first. The same image used
		// ten times is ten data URIs in the file, and a budget that counted it
		// once would let a 5MB capture serialize to fifty.
		if (blob && spent + encoded(blob.size) <= MAX_TOTAL_BYTES) {
			spent += encoded(blob.size);
			let uri = inlined.get(original);
			if (!uri) {
				uri = await toDataUri(blob);
				inlined.set(original, uri);
			}
			img.setAttribute("src", uri);
			continue;
		}
		// A rasterized canvas has no address to fall back to: its "URL" is the
		// data: URI itself, so linking it would put the whole payload back in
		// the document and spend the budget it just failed.
		//
		// SAFE_LINK is checked here and not only in capture.js because this is
		// the point where a page-supplied string would become a live href —
		// "no javascript: in a saved file" has to hold on every path that can
		// write one.
		if (!SAFE_LINK.test(original)) {
			img.remove();
			continue;
		}
		// Over budget or unfetchable: a plain link, with the address visible so
		// the reader can go and look deliberately.
		const link = root.ownerDocument.createElement("a");
		link.setAttribute("href", original);
		link.textContent = img.getAttribute("alt") || original;
		img.replaceWith(link);
	}
	return spent;
}

async function fontCss() {
	const faces = await Promise.all(
		FONT_FACES.map(async ([family, style, weight, file, range]) => {
			const blob = await fetch(chrome.runtime.getURL(`fonts/${file}`)).then((r) =>
				r.blob()
			);
			return (
				`@font-face{font-family:${family};font-style:${style};` +
				`font-weight:${weight};` +
				(range ? `unicode-range:${range};` : "") +
				`src:url("${await toDataUri(blob)}") format("woff2");}`
			);
		})
	);
	return faces.join("\n");
}

const escapeHtml = (text) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

// ASCII only, because the filename has to survive whatever filesystem it lands
// on. A wholly non-Latin title slugs to nothing, so the hostname stands in
// rather than every such page being saved as "page".
const slug = (text) =>
	text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const fileStem = () => {
	let stem = slug(page.title);
	if (!stem) {
		try {
			stem = slug(new URL(page.url).hostname);
		} catch {}
	}
	return stem || "page";
};

const isoDay = (date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-` +
	`${String(date.getDate()).padStart(2, "0")}`;

const longDay = (date) =>
	date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// Title first, then the capture record: the document says what it is before it
// accounts for where it came from.
const headerHtml = (page, date) =>
	`<h1>${escapeHtml(page.title)}</h1>\n` +
	`<div class="sf-source">\n` +
	`<div><span class="sf-key">Source</span>` +
	`<a href="${escapeHtml(page.url)}">${escapeHtml(page.url)}</a></div>\n` +
	`<div><span class="sf-key">Saved</span>${longDay(date)}</div>\n` +
	`</div>`;

// The title is page-supplied and does not pass through the DOM walker's
// escaper, so it is escaped here: a title reading `<img src=x onerror=…>`
// would otherwise be raw HTML in the .md, which most renderers pass through.
const escapeMarkdown = (text) => text.replace(/([\\`*_[\]#>|<&])/g, "\\$1");

const headerMarkdown = (page, date) =>
	`# ${escapeMarkdown(page.title)}\n\n**Source:** <${encodeURI(page.url)}>  \n` +
	`**Saved:** ${longDay(date)}\n\n---\n`;

// ---------------------------------------------------------------------------

let page = null; // the capture result
let doc = null; // the canonical document, assets already inlined
let assets = null; // { fonts, theme, saved } — the inlined stylesheets

async function capture() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab || !/^https?:|^file:/.test(tab.url || "")) {
		throw new Error("This page cannot be captured.");
	}

	// A page whose main thread is wedged — a bot-check interstitial spinning on
	// a busy loop is the common one — never runs injected code at all, and
	// executeScript waits on it forever. The deadline covers the injection as
	// well as the call: a wedged page hangs the first one just as readily.
	const deadline = new Promise((_, fail) =>
		setTimeout(() => fail(new Error("The page did not respond in time.")), CAPTURE_TIMEOUT)
	);
	const [result] = await Promise.race([
		(async () => {
			await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				files: ["capture.js"],
			});
			return chrome.scripting.executeScript({
				target: { tabId: tab.id },
				func: () => window.__singleFile.capture(),
			});
		})(),
		deadline,
	]);
	if (!result || !result.result) throw new Error("The page did not respond.");
	page = result.result;

	// parseFromString gives an inert document: no browsing context, so nothing
	// in it loads while we work on it.
	doc = new DOMParser().parseFromString(
		`<!doctype html><body>${page.html}</body>`,
		"text/html"
	);

	status.textContent = `Fetching ${page.assets.length} images…`;
	const blobs = await fetchAssets(page.assets);
	await inlineAssets(doc.body, page.assets, blobs);
	// Counted after inlining, not from the capture: images that failed to fetch
	// are links by now, and counting them would suppress the warning on exactly
	// the page that needs it.
	page.images = doc.body.querySelectorAll("img").length;

	const [fonts, theme, saved] = await Promise.all([
		fontCss(),
		readFile("theme.css"),
		readFile("saved.css"),
	]);
	assets = { fonts, theme, saved };
}

function buildHtml(date) {
	// BCP 47 subtags can carry digits — es-419, de-CH-1901 — and rejecting them
	// would relabel the document as English.
	const lang = /^[a-zA-Z0-9-]{2,35}$/.test(page.lang || "") ? page.lang : "en";
	return (
		`<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n` +
		// Defence in depth, and the only part of the guarantee the file can
		// enforce on its own behalf: whatever the allowlist may have missed,
		// the document cannot run a script or reach the network to render.
		// style-src and font-src allow only what this file carries inline.
		`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
		`img-src data:; style-src 'unsafe-inline'; font-src data:">\n` +
		`<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
		`<title>${escapeHtml(page.title)}</title>\n` +
		`<meta name="source-url" content="${escapeHtml(page.url)}">\n` +
		`<meta name="captured-at" content="${date.toISOString()}">\n` +
		`<style>\n${assets.fonts}\n</style>\n` +
		`<style>\n${assets.theme}\n</style>\n` +
		`<style>\n${assets.saved}\n</style>\n` +
		`</head>\n<body>\n<main class="prose">\n${headerHtml(page, date)}\n` +
		`${doc.body.innerHTML}\n</main>\n</body>\n</html>\n`
	);
}

async function save(text, mime, extension, date) {
	const name = `${isoDay(date)}-${fileStem()}.${extension}`;
	const url = URL.createObjectURL(new Blob([text], { type: mime }));
	const id = await chrome.downloads.download({ url, filename: name });
	// download() resolves as soon as the download has an id, so a disk-full or
	// cancelled save would otherwise be reported as "Saved". A blob download
	// completes almost immediately; if it is still going after a moment, say
	// that rather than claim either outcome.
	for (let attempt = 0; attempt < 20; attempt++) {
		const [item] = await chrome.downloads.search({ id });
		if (item && item.state === "complete") return { id, name, state: "complete" };
		if (item && item.state === "interrupted") {
			throw new Error(`Download failed: ${item.error || "interrupted"}`);
		}
		await new Promise((done) => setTimeout(done, 100));
	}
	return { id, name, state: "in_progress" };
}

async function run(format) {
	for (const button of Object.values(buttons)) button.disabled = true;
	// Cleared per attempt: a save that fails and is then retried successfully
	// would otherwise keep the failure styling, and the PDF path would follow
	// its failure-only branch on the retry that worked.
	status.className = "ready";
	const date = new Date();
	try {
		const done = (result) => {
			status.textContent =
				result.state === "complete" ? `Saved ${result.name}` : `Saving ${result.name}…`;
		};
		if (format === "markdown") {
			const text = headerMarkdown(page, date) + "\n" + toMarkdown(doc.body);
			done(await save(text, "text/markdown", "md", date));
			return;
		}
		const saved = await save(buildHtml(date), "text/html", "html", date);
		if (format === "html") {
			done(saved);
			return;
		}
		// Only the PDF path ends the popup's usefulness, because it opens a tab.
		// After HTML or Markdown the same capture can be saved again in another
		// format without recapturing.
		// PDF is the same HTML, opened and printed: Chrome's own engine, fed a
		// page that has already been cleaned. The service worker takes it from
		// here because opening a tab closes this popup.
		// The worker reports whether it got as far as the print dialog. Without
		// checking, a failure — file-URL access switched off is the likely one
		// — reads as success while nothing happens.
		const printed = await chrome.runtime.sendMessage({
			type: "print",
			downloadId: saved.id,
		});
		if (printed && printed.ok === false) {
			throw new Error("Saved the HTML, but could not print it — see the README.");
		}
		status.textContent = "Opening the print dialog…";
	} catch (error) {
		status.className = "failed";
		status.textContent = error.message || "Save failed.";
	} finally {
		// Re-enabled on success too: saving the HTML and then the Markdown of
		// one capture is a normal thing to want, and disabling them for good
		// forced a reopen and a second capture to get it. The PDF path is the
		// exception only when it worked — it ends the popup by opening a tab,
		// but a failure has to leave the buttons usable.
		if (format !== "pdf" || status.className === "failed") {
			for (const button of Object.values(buttons)) button.disabled = false;
		}
	}
}

buttons.html.addEventListener("click", () => run("html"));
buttons.markdown.addEventListener("click", () => run("markdown"));
buttons.pdf.addEventListener("click", () => run("pdf"));

capture()
	.then(() => {
		status.className = "ready";
		status.textContent = `${page.words} words, ${page.images} images.`;
		if (page.words < MIN_WORDS && page.images < MIN_IMAGES) {
			warning.hidden = false;
			// A statement, not a question: the buttons are enabled either way,
			// so asking one would leave the reader looking for a Yes.
			warning.textContent =
				"Very little content was captured — this may be a login wall or an " +
				"app-shaped page. Saving is still available.";
		}
		for (const button of Object.values(buttons)) button.disabled = false;
	})
	.catch((error) => {
		status.className = "failed";
		status.textContent = error.message || "Capture failed.";
	});
