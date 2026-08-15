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
	let next = 0;
	const worker = async () => {
		while (next < urls.length) {
			const index = next++;
			try {
				const response = await fetch(urls[index]);
				if (!response.ok) continue;
				const blob = await response.blob();
				if (blob.size > MAX_IMAGE_BYTES) continue;
				blobs[index] = blob;
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
async function inlineAssets(doc, urls, blobs) {
	let spent = 0;
	for (const img of doc.querySelectorAll("img")) {
		const source = img.getAttribute("src") || "";
		const index = /^asset:(\d+)$/.exec(source);
		if (!index) continue;
		const original = urls[Number(index[1])];
		const blob = blobs[Number(index[1])];
		if (blob && spent + blob.size <= MAX_TOTAL_BYTES) {
			spent += blob.size;
			img.setAttribute("src", await toDataUri(blob));
			continue;
		}
		// Two sources have no address worth falling back to. A rasterized
		// canvas is a data: URI, so linking it would put the whole payload back
		// in the document and spend the budget it just failed. A blob: URL
		// belongs to the page that minted it and is dead everywhere else — an
		// unfetchable one must not become a link that goes nowhere.
		if (original.startsWith("data:") || original.startsWith("blob:")) {
			img.remove();
			continue;
		}
		// Over budget or unfetchable: a plain link, with the address visible so
		// the reader can go and look deliberately.
		const link = doc.createElement("a");
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

const slug = (text) =>
	text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) ||
	"page";

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

	await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["capture.js"] });
	// A page whose main thread is wedged — a bot-check interstitial spinning on
	// a busy loop is the common one — never runs the injected function at all,
	// and executeScript waits on it forever. Without a deadline the popup sits
	// on "Capturing…" with nothing to tell you.
	const [result] = await Promise.race([
		chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: () => window.__singleFile.capture(),
		}),
		new Promise((_, fail) =>
			setTimeout(() => fail(new Error("The page did not respond in time.")), CAPTURE_TIMEOUT)
		),
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
	return (
		`<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
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
	const name = `${isoDay(date)}-${slug(page.title)}.${extension}`;
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
		// PDF is the same HTML, opened and printed: Chrome's own engine, fed a
		// page that has already been cleaned. The service worker takes it from
		// here because opening a tab closes this popup.
		await chrome.runtime.sendMessage({ type: "print", downloadId: id });
		status.textContent = "Opening the print dialog…";
	} catch (error) {
		status.className = "failed";
		status.textContent = error.message || "Save failed.";
		for (const button of Object.values(buttons)) button.disabled = false;
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
			warning.textContent =
				"Very little content was captured — this may be a login wall or an " +
				"app-shaped page. Save anyway?";
		}
		for (const button of Object.values(buttons)) button.disabled = false;
	})
	.catch((error) => {
		status.className = "failed";
		status.textContent = error.message || "Capture failed.";
	});
