#!/usr/bin/env node
// Render a .md file to ONE standalone .html that looks exactly like this
// extension's in-browser rendering — same markdown-it, same highlight.js,
// same theme.css, same bundled fonts (base64-inlined). No network at
// runtime, nothing to install: the output is a single file to email, drop
// in Slack, or open on a machine that has never seen the extension.
//
//   node md2html.mjs input.md [output.html]
//
// The parity obligation: content.js is the source of truth for how a
// document is rendered. What is duplicated here is marked DUPLICATED —
// change it there, change it here. What cannot apply is marked OMITTED.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, basename, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createContext, runInContext } from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));

const [, , inputArg, outputArg] = process.argv;
if (!inputArg) {
	console.error("usage: node md2html.mjs input.md [output.html]");
	process.exit(1);
}
const input = resolve(inputArg);
const output = outputArg
	? resolve(outputArg)
	: input.replace(/\.(md|markdown)$/i, "") + ".html";
// Comparing resolved path strings is not enough: the aliases that actually
// bite are a case-only variant (macOS is case-insensitive by default), a
// symlink, and a hard link — all of which name the same file with a
// different string. Inode identity sees through all three.
const sameFile = (a, b) => {
	if (a === b) return true;
	try {
		const x = statSync(a);
		const y = statSync(b);
		return x.dev === y.dev && x.ino === y.ino;
	} catch {
		return false; // output does not exist yet, so there is nothing to clobber
	}
};
if (sameFile(input, output)) {
	console.error(`refusing to overwrite the source: ${input}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// The vendored browser bundles, loaded as-is.
//
// Both are UMD. In a vm context with no module/exports/define they take the
// browser branch and assign to `window` — which is why the sandbox is its own
// window. Using these files rather than an npm markdown-it is the whole point:
// a version drift between the extension and this script would render the same
// document two different ways.
// ---------------------------------------------------------------------------
const sandbox = {};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
const context = createContext(sandbox);
for (const lib of ["markdown-it.min.js", "highlight.min.js"]) {
	runInContext(readFileSync(join(HERE, lib), "utf8"), context, { filename: lib });
}
const { markdownit, hljs } = sandbox;

// DUPLICATED from content.js — markdown-it options.
const md = markdownit({
	html: false,
	linkify: true,
	highlight: (code, lang) => {
		if (hljs && lang && hljs.getLanguage(lang)) {
			return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
		}
		return "";
	},
});

// DUPLICATED from content.js — the data: URI whitelist. markdown-it ships
// gif/png/jpeg/webp only, which renders an SVG logo as raw ![…](data:…) text.
const okData = /^data:image\/(gif|png|jpeg|webp|svg\+xml)[;,]/;
const badProto = /^(vbscript|javascript|file|data):/;
md.validateLink = (url) => {
	const str = url.trim().toLowerCase();
	return badProto.test(str) ? okData.test(str) : true;
};

let source;
try {
	source = readFileSync(input, "utf8");
} catch (error) {
	const why = error.code === "ENOENT" ? "no such file" : error.message;
	console.error(`cannot read ${input}: ${why}`);
	process.exit(1);
}
// Chrome strips a UTF-8 BOM when it decodes a file:// text document, so
// content.js never sees one; readFileSync keeps it. Left in place it would
// hide the first heading behind an invisible character.
source = source.replace(/^\uFEFF/, "");

let html = md.render(source);

// OMITTED from content.js: the <img> rewrite. That guard exists because the
// extension renders untrusted local files in a live page — with html:false,
// a remote ![](https://…) is the one way such a file could phone home while
// you merely open it. Here the author is publishing their own document on
// purpose, and a stripped image would be a rendering bug rather than a
// safety win. Remote images are left exactly as written.
//
// Local ones cannot be: "one file to email" is the whole promise, and a
// relative src breaks the moment the HTML is written anywhere but beside the
// source — or is sent anywhere at all. They travel inlined, like the fonts.
//
// OMITTED for the same reason: the <a href="data:…"> unwrap that content.js
// does alongside its <img> rewrite. Widening validateLink to pass SVG makes
// data: valid as a link target as well as an image source; in the extension
// that is someone else's file, so the anchor is taken back. Here it is the
// author's own link, deliberately written, and dropping it would be the
// rendering bug again.
const IMAGE_TYPES = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".svg": "image/svg+xml",
	".bmp": "image/bmp",
	".ico": "image/x-icon",
};

// DUPLICATED from content.js — which src counts as local. Same URL parse
// against the document's own file: URL, same rule: data:, or file: with no
// host. The host clause is the load-bearing one — //host/share resolves to
// a *hosted* file: URL, which on Windows is SMB, so it is remote. Getting
// this by hand-rolled string tests was wrong in both directions: ///tmp/x
// and //localhost/tmp/x are hostless, hence local.
const BASE = pathToFileURL(input);
const localUrl = (src) => {
	let url;
	try {
		url = new URL(src.replace(/&amp;/g, "&"), BASE); // undo attribute escaping
	} catch {
		return null;
	}
	if (url.protocol === "data:") return url;
	return url.protocol === "file:" && url.hostname === "" ? url : null;
};
const isRemote = (src) => localUrl(src) === null;

const inlineImage = (src) => {
	const url = localUrl(src);
	if (!url || url.protocol !== "file:") return null; // remote, or already inline
	let file;
	try {
		// Query and fragment are not part of the path; fileURLToPath drops
		// them and undoes the percent-encoding markdown-it applied, so a file
		// named "pic#1.png" (written "pic%231.png") resolves to itself.
		file = fileURLToPath(url);
	} catch {
		console.warn(`warning: not inlined, malformed URL — ${src}`);
		return null;
	}
	if (file === input) return null; // a bare "#anchor" resolves to the document
	const type = IMAGE_TYPES[extname(file).toLowerCase()];
	if (!type) {
		console.warn(`warning: not inlined, unknown image type — ${src}`);
		return null;
	}
	try {
		return `data:${type};base64,${readFileSync(file).toString("base64")}`;
	} catch {
		console.warn(`warning: not inlined, cannot read — ${src}`);
		return null;
	}
};

// html:false means every <img> here came from markdown image syntax, so the
// tag is markdown-it's own output: attributes are escaped and quoted, and a
// data: URI never contains a quote to close one early.
html = html.replace(/<img\b([^>]*?)src="([^"]*)"/g, (match, before, src) => {
	const inlined = inlineImage(src);
	return inlined ? `<img${before}src="${inlined}"` : match;
});

// ---------------------------------------------------------------------------
// Post-processing. content.js does these against a real DOM; string work is
// the honest equivalent for a build step, so each rule below is deliberately
// narrow about what it matches.
// ---------------------------------------------------------------------------

// Text of a heading, for the slug and the ToC label: tags dropped, entities
// resolved — the same string .textContent would have given.
//
// The <img> rule is load-bearing for parity. content.js de-fangs a remote
// image into <a> labelled `alt || src` *before* it reads textContent, so
// "## ![API](https://…)" slugs as "api" there. Dropping the tag outright
// would slug it "section" here and leave a blank ToC entry. A local image
// stays an <img> in content.js and contributes nothing — as here.
const textOf = (fragment) =>
	fragment
		.replace(/<img\b[^>]*>/g, (tag) => {
			const src = /\ssrc="([^"]*)"/.exec(tag);
			if (!src || !isRemote(src[1])) return "";
			const alt = /\salt="([^"]*)"/.exec(tag);
			return (alt && alt[1]) || src[1];
		})
		.replace(/<[^>]*>/g, "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");

// DUPLICATED from content.js — GitHub-style task lists. markdown-it core
// leaves "[ ]"/"[x]" as literal text. Anchored to the start of the item (or
// of its first paragraph, for loose lists), so a "[x]" mid-sentence is safe.
html = html.replace(
	/<li>(\s*(?:<p>)?)\[([ xX])\] /g,
	(_match, lead, mark) =>
		// No space after the checkbox: content.js slices "[x] " off the text
		// node and inserts the box directly before what is left, and
		// theme.css already carries the gap as a right margin.
		`<li class="task">${lead}<input type="checkbox" disabled${
			mark === " " ? "" : " checked"
		}>`
);

// DUPLICATED from content.js — heading ids, same slug rules and same
// numeric de-duplication, so a link into the HTML matches a link into the
// extension's rendering of the same file.
const headings = [];
const used = new Set();
html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_match, level, inner) => {
	const text = textOf(inner);
	const base =
		text
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, "")
			.replace(/\s+/g, "-") || "section";
	let id = base;
	for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
	used.add(id);
	headings.push({ level, id, text });
	return `<h${level} id="${id}">${inner}</h${level}>`;
});

const escapeAttr = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const escapeText = (value) =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// DUPLICATED from content.js — the rail earns its place at 3+ headings, and
// carries a synthetic "Overview" entry for the prose above the first h2.
const toc =
	headings.length >= 3
		? `<nav class="toc"><p class="toc-label">On this page</p><ul>` +
		  `<li class="h2"><a href="#">Overview</a></li>` +
		  headings
				.map(
					(h) =>
						`<li class="h${h.level}"><a href="#${escapeAttr(h.id)}">${escapeText(
							h.text
						)}</a></li>`
				)
				.join("") +
		  `</ul></nav>`
		: "";

// DUPLICATED from content.js — <h1> names the document, filename otherwise.
const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(html);
const title = h1 ? textOf(h1[1]) : basename(input);

// ---------------------------------------------------------------------------
// Fonts, inlined. In the extension these are chrome-extension:// URLs from
// web_accessible_resources; standalone they have to travel inside the file,
// so each woff2 becomes a data: URI. That is what makes the output render
// identically on a machine that has never installed DM Sans or Merriweather
// — and what puts a ~480KB floor under every output.
//
// DUPLICATED from content.js: the family/style/weight table and both
// unicode-range slices. The weight ranges and ranges are load-bearing — see
// the comments there before touching either.
// ---------------------------------------------------------------------------
const dataUri = (file) =>
	`data:font/woff2;base64,${readFileSync(join(HERE, "fonts", file)).toString("base64")}`;

const face = (family, style, weight, file, range) =>
	`@font-face{font-family:${family};font-style:${style};font-weight:${weight};` +
	(range ? `unicode-range:${range};` : "") +
	`src:url("${dataUri(file)}") format("woff2");}`;

const MERRIWEATHER_SYMBOLS =
	"U+02D8-02D9,U+02DB,U+0302,U+0306-0307,U+030A-030D,U+030F-0313," +
	"U+0315,U+031B,U+0320,U+0324-0328,U+032D-0332,U+0334-0338,U+0358,U+035C-035D," +
	"U+035F,U+0361-0362,U+0394,U+039B-039C,U+03A7,U+03A9,U+03BB-03BC,U+03C0,U+03C7," +
	"U+058F,U+0E3F,U+1DC4-1DCA,U+2070-2071,U+2074-2079,U+207F-2089,U+2100-2101," +
	"U+2105-2106,U+2117,U+2126,U+212E,U+2144,U+2150-2156,U+2158-215E,U+2183-2184," +
	"U+2190,U+2192,U+2194-2199,U+2202,U+2205-2206,U+220F,U+2211,U+2219-221A,U+221E," +
	"U+222B,U+2236,U+2248,U+2260,U+2264-2267,U+2317,U+24B6,U+24D0,U+25A0-25A1," +
	"U+25AA-25AB,U+25B2-25B9,U+25BC-25C3,U+25C6-25C7,U+25C9-25CC,U+25CF,U+25E6," +
	"U+25FC,U+2611-2612,U+2661,U+2665,U+27A1,U+27E8-27E9,U+2B05-2B0B,U+2B1B-2B1C," +
	"U+2B98-2B9F,U+2E17,U+2E38,U+3003,U+A717-A71A,U+AB53,U+FB01-FB02";

const DM_SANS_SYMBOLS =
	"U+02D8-02D9,U+02DB,U+0302,U+0306-0307,U+030A-030C,U+0312," +
	"U+0326-0328,U+03C0,U+1EBC-1EBD,U+2074,U+2126,U+212E,U+2190,U+2192,U+2194-2199," +
	"U+2202,U+2206,U+220F,U+2211,U+221A,U+221E,U+222B,U+2248,U+2260,U+2264-2265," +
	"U+25CA,U+FB01-FB02";

const fontCss = [
	face('"Merriweather"', "normal", "300 900", "merriweather-latin.woff2"),
	face('"Merriweather"', "italic", "300 900", "merriweather-latin-italic.woff2"),
	face('"DM Sans"', "normal", "100 1000", "dm-sans-latin.woff2"),
	face('"DM Mono"', "normal", "400", "dm-mono-latin.woff2"),
	face('"DM Mono"', "normal", "500 700", "dm-mono-latin-medium.woff2"),
	face(
		'"Merriweather"',
		"normal",
		"300 900",
		"merriweather-symbols.woff2",
		MERRIWEATHER_SYMBOLS
	),
	face('"DM Sans"', "normal", "100 1000", "dm-sans-symbols.woff2", DM_SANS_SYMBOLS),
].join("\n");

// Every font file must be accounted for: a new slice added to fonts/ and
// wired into content.js but not into the table above would render here in a
// system fallback, quietly, and only on the glyphs it covers.
const known = new Set([
	"merriweather-latin.woff2",
	"merriweather-latin-italic.woff2",
	"merriweather-symbols.woff2",
	"dm-sans-latin.woff2",
	"dm-sans-symbols.woff2",
	"dm-mono-latin.woff2",
	"dm-mono-latin-medium.woff2",
]);
for (const file of readdirSync(join(HERE, "fonts"))) {
	if (file.endsWith(".woff2") && !known.has(file)) {
		console.warn(`warning: fonts/${file} is not inlined — add it to md2html.mjs`);
	}
}

const theme = readFileSync(join(HERE, "theme.css"), "utf8");

// DUPLICATED from content.js — the scroll-spy, verbatim apart from reading
// the rail out of the document instead of building it and dropping the
// `signal` option on the listeners (that AbortSignal only serves the live
// refresh). Emitted only when there is a rail to drive.
// OMITTED from content.js: the live refresh — the content-script poll and
// worker.js. An export is a static file; there is nothing to watch.
const spyScript = toc
	? `
<script>
(() => {
	const list = document.querySelector(".toc ul");
	if (!list) return;
	const toc = document.querySelector(".toc");
	const links = [...list.querySelectorAll("a")];
	const headings = [...document.querySelectorAll("main.prose h2, main.prose h3")];
	let ticking = false;
	let pinned = -1;
	const spy = () => {
		ticking = false;
		if (pinned >= 0) {
			links.forEach((link, i) => link.classList.toggle("active", i === pinned));
			return;
		}
		let current = 0;
		const doc = document.documentElement;
		const bottom =
			doc.scrollHeight > window.innerHeight &&
			window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
		if (bottom) {
			current = links.length - 1;
		} else {
			for (let i = 0; i < headings.length; i++) {
				if (headings[i].getBoundingClientRect().top <= 120) current = i + 1;
			}
		}
		links.forEach((link, i) => link.classList.toggle("active", i === current));
	};
	const schedule = () => {
		if (!ticking) {
			ticking = true;
			requestAnimationFrame(spy);
		}
	};
	document.addEventListener("scroll", schedule, { passive: true });
	window.addEventListener("resize", schedule);
	list.addEventListener("click", (event) => {
		const link = event.target.closest("a");
		if (!link) return;
		pinned = links.indexOf(link);
		schedule();
	});
	const unpin = () => {
		if (pinned < 0) return;
		pinned = -1;
		schedule();
	};
	const unpinOutsideToc = (event) => {
		if (!toc.contains(event.target)) unpin();
	};
	window.addEventListener("wheel", unpinOutsideToc, { passive: true });
	window.addEventListener("touchstart", unpinOutsideToc, { passive: true });
	window.addEventListener("mousedown", unpinOutsideToc);
	const scrollKeys = new Set(["ArrowUp","ArrowDown","PageUp","PageDown","Home","End"," "]);
	window.addEventListener("keydown", (event) => {
		if (scrollKeys.has(event.key)) unpin();
	});
	spy();
})();
</script>`
	: "";

// DUPLICATED from content.js — the copy button on fenced blocks, verbatim.
// Client-side because the export builds its HTML as a string, and the
// button is only worth having where script runs to serve it anyway.
const copyScript = `
<script>
(() => {
	const main = document.querySelector("main.prose");
	const COPY_ICON =
		'<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';
	const DONE_ICON =
		'<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.5"/></svg>';
	for (const pre of main.querySelectorAll("pre")) {
		const block = document.createElement("div");
		block.className = "codeblock";
		pre.replaceWith(block);
		block.appendChild(pre);
		const button = document.createElement("button");
		button.type = "button";
		button.className = "copy";
		button.setAttribute("aria-label", "Copy code");
		button.title = "Copy";
		button.innerHTML = COPY_ICON;
		block.appendChild(button);
	}
	main.addEventListener("click", (event) => {
		const button = event.target.closest("button.copy");
		if (!button) return;
		const pre = button.parentElement.querySelector("pre");
		const text = pre.textContent.replace(/\\n$/, "");
		navigator.clipboard.writeText(text).then(
			() => flash(button, "done", "Copied"),
			() => flash(button, "failed", "Copy failed")
		);
	});
	const flash = (button, state, title) => {
		button.className = "copy " + state;
		button.title = title;
		button.innerHTML = state === "done" ? DONE_ICON : COPY_ICON;
		clearTimeout(button.timer);
		button.timer = setTimeout(() => {
			button.className = "copy";
			button.title = "Copy";
			button.innerHTML = COPY_ICON;
		}, 1500);
	};
})();
</script>`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(title)}</title>
<style>
${fontCss}
</style>
<style>
${theme}
</style>
</head>
<body>
<main class="prose">
${html}</main>
${toc}${copyScript}${spyScript}
</body>
</html>
`;

try {
	writeFileSync(output, page);
} catch (error) {
	const why = error.code === "ENOENT" ? "no such directory" : error.message;
	console.error(`cannot write ${output}: ${why}`);
	process.exit(1);
}
const kb = Math.round(Buffer.byteLength(page) / 1024);
console.log(`${output}  (${kb} KB, ${headings.length} headings${toc ? "" : ", no ToC"})`);
