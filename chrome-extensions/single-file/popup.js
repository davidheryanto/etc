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
	// Keyed by URL, so the second occurrence reuses the first fetch.
	const byUrl = new Map();
	let next = 0;
	const worker = async () => {
		while (next < urls.length) {
			const index = next++;
			const url = urls[index];
			if (byUrl.has(url)) {
				blobs[index] = byUrl.get(url);
				continue;
			}
			try {
				// Without a deadline one hanging request leaves the popup on
				// "Fetching…" with the buttons disabled and nothing to do.
				const response = await fetch(url, {
					signal: AbortSignal.timeout(FETCH_TIMEOUT),
				});
				if (!response.ok) continue;
				const blob = await response.blob();
				if (blob.size > MAX_IMAGE_BYTES) continue;
				blobs[index] = blob;
				byUrl.set(url, blob);
			} catch {
				// A failed fetch is not an error worth stopping for: that image
				// degrades to a link and the rest of the page is unaffected.
			}
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
		if (inlined.has(original)) {
			img.setAttribute("src", inlined.get(original));
			continue;
		}
		if (blob && spent + encoded(blob.size) <= MAX_TOTAL_BYTES) {
			spent += encoded(blob.size);
			const uri = await toDataUri(blob);
			inlined.set(original, uri);
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

const headerMarkdown = (page, date) =>
	`# ${page.title}\n\n**Source:** <${page.url}>  \n**Saved:** ${longDay(date)}\n\n---\n`;

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

	const [fonts, theme, saved] = await Promise.all([
		fontCss(),
		readFile("theme.css"),
		readFile("saved.css"),
	]);
	assets = { fonts, theme, saved };
}

function buildHtml(date) {
	const lang = /^[a-zA-Z-]{2,35}$/.test(page.lang || "") ? page.lang : "en";
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
	return { id: await chrome.downloads.download({ url, filename: name }), name };
}

async function run(format) {
	for (const button of Object.values(buttons)) button.disabled = true;
	const date = new Date();
	try {
		if (format === "markdown") {
			const text = headerMarkdown(page, date) + "\n" + toMarkdown(doc.body);
			const { name } = await save(text, "text/markdown", "md", date);
			status.textContent = `Saved ${name}`;
			return;
		}
		const { id, name } = await save(buildHtml(date), "text/html", "html", date);
		if (format === "html") {
			status.textContent = `Saved ${name}`;
			return;
		}
		// Only the PDF path ends the popup's usefulness, because it opens a tab.
		// After HTML or Markdown the same capture can be saved again in another
		// format without recapturing.
		// PDF is the same HTML, opened and printed: Chrome's own engine, fed a
		// page that has already been cleaned. The service worker takes it from
		// here because opening a tab closes this popup.
		await chrome.runtime.sendMessage({ type: "print", downloadId: id });
		status.textContent = "Opening the print dialog…";
	} catch (error) {
		status.className = "failed";
		status.textContent = error.message || "Save failed.";
	} finally {
		// Re-enabled on success too: saving the HTML and then the Markdown of
		// one capture is a normal thing to want, and disabling them for good
		// forced a reopen and a second capture to get it.
		if (format !== "pdf") {
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
