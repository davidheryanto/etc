#!/usr/bin/env node
// Runs the real content.js against fixtures and checks what it renders and
// what it copies. Needs only Node and Chrome; nothing to install.
//
//   node test/run.mjs            # CHROME=/path/to/chrome to override
//
// Why an HTTP harness and not the extension: headless Chrome will not grant
// an unpacked extension file:// scripting, even with allowFileAccess seeded
// into its Preferences. So this serves the extension's own files over
// loopback, opens a page that holds the fixture in a <pre> the way Chrome
// wraps a text file, rewrites the path so content.js sees a .md, and stubs
// the two things it reaches for that a plain page lacks: chrome.runtime and
// navigator.clipboard. The unmodified script then runs, and the page writes
// what it produced into a <textarea> for --dump-dom to carry back.
//
// The clipboard stub captures; it does not reimplement. Every copy
// assertion here is on what the page's own button or copy handler put on
// the clipboard, so a probe cannot pass while the page is broken.

import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CHROME = process.env.CHROME || "google-chrome";
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2" };

// ---------------------------------------------------------------- Harness
// One page per case. `path` is what content.js will see as the URL; `scripts`
// and `css` are the manifest's entries for that path; `probe` runs after the
// render and returns what to assert on.
const page = ({ source, path, scripts, css, probe }) => `<!doctype html>
<meta charset="utf-8">
${css.map((f) => `<link rel="stylesheet" href="/${f}">`).join("\n")}
<pre>${source.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>
<script>
history.replaceState(null, "", ${JSON.stringify(path)});
window.chrome = { runtime: { getURL: (p) => "/" + p, sendMessage: () => Promise.resolve(null) } };
window.__out = { errors: [] };
window.addEventListener("error", (e) => window.__out.errors.push(String(e.message)));
window.__clip = [];
Object.defineProperty(navigator, "clipboard", {
	value: {
		writeText: async (text) => { window.__clip.push({ text }); },
		write: async (items) => {
			const item = items[0];
			const entry = {};
			for (const type of item.types) entry[type] = await item.getType(type).then((b) => b.text());
			window.__clip.push(entry);
		},
	},
});
// Ctrl+C through the page's own copy listener.
window.__copySelection = (range) => {
	const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
	const dt = new DataTransfer();
	document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
	return { "text/html": dt.getData("text/html"), "text/plain": dt.getData("text/plain") };
};
</script>
${scripts.map((f) => `<script src="/${f}"></script>`).join("\n")}
<script>
setTimeout(async () => {
	try { Object.assign(window.__out, await (${probe})()); }
	catch (e) { window.__out.errors.push("probe: " + (e.stack || e)); }
	const ta = document.createElement("textarea"); ta.id = "__out";
	ta.textContent = JSON.stringify(window.__out);
	document.body.appendChild(ta);
}, 300);
</script>`;

// Every request Chrome makes lands in `hits`, so a case can assert that a
// remote image was never fetched — not merely that it is gone from the
// final DOM — with the page's own scripts as the control that the log
// records anything at all.
const hits = [];
const serve = (pages) =>
	new Promise((resolve) => {
		const server = createServer((req, res) => {
			const url = new URL(req.url, "http://x");
			hits.push(url.pathname);
			if (pages[url.pathname]) {
				res.setHeader("content-type", "text/html");
				return res.end(pages[url.pathname]);
			}
			try {
				const file = join(ROOT, url.pathname);
				res.setHeader("content-type", TYPES[extname(file)] || "application/octet-stream");
				res.end(readFileSync(file));
			} catch {
				res.statusCode = 404;
				res.end();
			}
		});
		server.listen(0, "127.0.0.1", () => resolve(server));
	});

// Async, not execFileSync: the server that Chrome is fetching from runs on
// this same event loop, and a blocking spawn would deadlock the two.
// A temporary profile of its own: Chrome refuses to start where it cannot
// create its implicit one (a read-only home, an isolated runner).
const dump = async (url, width = 1200) => {
	const profile = mkdtempSync(join(tmpdir(), "local-viewer-test-"));
	let dom;
	try {
		({ stdout: dom } = await promisify(execFile)(
			CHROME,
			[
				"--headless=new",
				"--disable-gpu",
				"--no-first-run",
				`--user-data-dir=${profile}`,
				// The layout case needs a window wide enough for the rail and
				// the table breakout; the default 800x600 would leave both off.
				`--window-size=${width},1000`,
				"--virtual-time-budget=5000",
				"--dump-dom",
				url,
			],
			{ encoding: "utf8", maxBuffer: 64 << 20, timeout: 60000 },
		));
	} finally {
		rmSync(profile, { recursive: true, force: true });
	}
	const match = /<textarea id="__out">([\s\S]*?)<\/textarea>/.exec(dom);
	if (!match) throw new Error("page produced no output; content.js did not finish\n" + dom.slice(0, 2000));
	const text = match[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
	return JSON.parse(text);
};

// ---------------------------------------------------------------- Cases
const fixture = (name) => readFileSync(join(HERE, "fixtures", name), "utf8");
const MD = { scripts: ["markdown-it.min.js", "highlight.min.js", "content.js"], css: ["theme.css"] };
const EMAIL = { scripts: ["markdown-it.min.js", "content.js"], css: ["email.css"] };
const DATA = { scripts: ["json.js", "content.js"], css: ["theme.css", "json.css"] };

const cases = {
	// The copy is the composer's own DOM for typed text: a <div> per line,
	// <div><br></div> as a blank line, no <p> — Outlook stamps 1em margins on
	// a pasted <p> and every block split off it inherits them.
	email: {
		...EMAIL,
		path: "/draft.email.md",
		source: fixture("draft.email.md"),
		probe: `async () => {
			const main = document.querySelector("main.prose");
			const lines = main.querySelectorAll("main > div");
			const li = main.querySelector("li");
			const range = (a, from, b, to) => { const r = document.createRange(); r.setStart(a, from); r.setEnd(b, to); return r; };
			// Mid-paragraph into the first list item: main is the common ancestor.
			const across = window.__copySelection(range(lines[2].firstChild, 5, li.firstChild, 2));
			// Inside one link's text: the <a>, then its line, must be rebuilt around the clone.
			const anchor = main.querySelector("a[href='https://example.com']");
			const inLink = window.__copySelection(range(anchor.firstChild, 1, anchor.firstChild, 3));
			// Inside the nested list's item: li, ul, li, ul all rebuilt.
			const nested = main.querySelector("li li");
			const inNested = window.__copySelection(range(nested.firstChild, 0, nested.firstChild, 4));
			document.querySelector(".copy-all").click();
			for (let i = 0; i < 100 && !window.__clip.length; i++) await new Promise((r) => setTimeout(r, 20));
			return { preview: main.innerHTML, all: window.__clip[0], across, inLink, inNested };
		}`,
		check: ({ preview, all, across, inLink, inNested, errors }) => {
			assert.deepEqual(errors, []);
			const html = all["text/html"];
			assert.ok(!/<p[\s>]/.test(html), "no <p> in the copy");
			assert.ok(!/<h[1-6]/.test(html), "no headings in the copy");
			assert.ok(!/ (id|class)=/.test(html), "no id or class in the copy");
			assert.match(html, /^<div><strong>Hello<\/strong><\/div><div><br><\/div>\n<div>This is a test\.<\/div><div><br><\/div>/);
			assert.match(html, /<div>From Dec 2024 to Apr 2025, time spent halved,<br>\nsecond line/, "breaks: true");
			assert.match(html, /<ul style="margin:0">/, "blocks that keep their tag carry margin:0");
			assert.match(html, /<li><strong>two<\/strong> and <a href="https:\/\/example\.com\/2">more<\/a>\n<ul style="margin:0">/, "inline children of a tight item get no spacer");
			assert.match(html, /<li>☑ <strong>done<\/strong> now<\/li>/, "task box as a character, then its inline siblings untouched");
			assert.match(
				html,
				/<li>\n<div>loose first<\/div><div><br><\/div>\n<div>loose second<\/div>\n<ul style="margin:0">\n<li>under it<\/li>\n<\/ul>\n<\/li>/,
				"a loose item keeps its blank line; its nested list attaches directly",
			);
			assert.match(html, /<blockquote style="margin:0;[^"]*">\n<div>quoted line<\/div><div><br><\/div>\n<div>second quote para<\/div>\n<\/blockquote>/);
			assert.match(html, /<th style="[^"]*font-weight:bold;text-align:right">b<\/th>/, "authored alignment kept");
			assert.ok(!html.includes("attach in client"), "placeholder omitted from the copy");
			assert.ok(!html.includes("<img"), "no image in the copy");
			assert.ok(!/<div><br><\/div>\s*<div><br><\/div>/.test(html), "removing the image line leaves one blank line, not two");
			assert.match(html, /<\/pre><div><br><\/div>\s*<div>Last line/, "two images on consecutive lines leave nothing behind, not a <br>");
			assert.ok(!/^\s*<div><br><\/div>/.test(html) && !/<div><br><\/div>\s*$/.test(html), "no blank line at either end");
			assert.match(html, /<a href="https:\/\/example\.com">link<\/a>/);
			assert.equal(
				all["text/plain"],
				[
					"Hello",
					"",
					"This is a test.",
					"",
					"From Dec 2024 to Apr 2025, time spent halved,",
					"second line of same paragraph (second picture).",
					"",
					"- one",
					"- two and more (https://example.com/2)",
					"  - nested",
					"- [x] done now",
					"",
					"Between lists.",
					"",
					"- loose first",
					"  loose second",
					"  - under it",
					"",
					"quoted line",
					"",
					"second quote para",
					"",
					"a\tb",
					"1\t2",
					"",
					"code here",
					"",
					"Last line with a link (https://example.com).",
					"",
				].join("\n"),
			);
			assert.match(across["text/html"], /^<div>is a test\.<\/div><div><br><\/div>\n<div>From Dec/);
			assert.match(across["text/html"], /<ul style="margin:0">\n<li>on<\/li><\/ul>$/, "selection keeps its list");
			assert.equal(across["text/plain"], "is a test.\n\nFrom Dec 2024 to Apr 2025, time spent halved,\nsecond line of same paragraph (second picture).\n\n- on\n");
			assert.equal(inLink["text/html"], '<div><a href="https://example.com">in</a></div>', "the link is rebuilt around text selected inside it");
			assert.equal(inLink["text/plain"], "in (https://example.com)\n");
			assert.equal(inNested["text/html"], '<ul style="margin:0"><li><ul style="margin:0"><li>nest</li></ul></li></ul>', "both lists rebuilt around a nested item");
			assert.equal(inNested["text/plain"], "-\n  - nest\n");
			assert.match(preview, /<span class="attach">attach in client: shot<\/span>/, "preview shows the placeholder");
			assert.ok(!/<p[\s>]/.test(preview), "preview is the same DOM as the copy");
		},
	},

	// The document look: rail, code copy, and no remote image fetched.
	markdown: {
		...MD,
		path: "/notes.md",
		source: fixture("notes.md"),
		probe: `async () => {
			document.querySelector(".codeblock button.copy").click();
			for (let i = 0; i < 100 && !window.__clip.length; i++) await new Promise((r) => setTimeout(r, 20));
			return {
				title: document.title,
				toc: [...document.querySelectorAll(".toc a")].map((a) => a.getAttribute("href")),
				imgs: [...document.querySelectorAll("img")].map((i) => i.getAttribute("src")),
				links: [...document.querySelectorAll("main a")].map((a) => a.getAttribute("href")),
				copied: window.__clip[0],
				task: document.querySelector("li.task input") && document.querySelector("li.task input").checked,
			};
		}`,
		check: ({ title, toc, imgs, links, copied, task, errors }) => {
			assert.deepEqual(errors, []);
			// The phone-home promise, observed at the server: the page's own
			// scripts prove the log records, the tracker must not be in it.
			assert.ok(hits.includes("/content.js"), "request log is live");
			assert.ok(!hits.includes("/tracker.png"), "remote image never fetched");
			assert.equal(title, "Notes");
			assert.deepEqual(toc, ["#", "#first", "#second", "#third"]);
			// Served over http, a relative image is remote too; data: is the
			// one kind of local image the harness can show staying put.
			assert.deepEqual(imgs, ["data:image/png;base64,iVBORw0KGgo="], "the remote image is not on the page");
			assert.ok(links.includes("tracker.png"), "the remote image became a link");
			assert.ok(!links.some((h) => /^javascript:/i.test(h)), "javascript: link stripped");
			assert.equal(copied.text, "print('hi')", "trailing newline trimmed");
			assert.equal(task, true);
		},
	},

	// Geometry, which is the one thing the other cases never look at. A
	// table breaks out to the right of the 832px measure, and a code chip
	// inside one gets <wbr> so a path stops setting the column's minimum
	// width. Both are read back from the laid-out page, not from the markup:
	// the assertions that matter here are "does it fit" and "does it stay
	// off the rail", and only layout can answer those.
	tables: {
		...MD,
		path: "/tables.md",
		source: fixture("tables.md"),
		width: 1440,
		probe: `async () => {
			const main = document.querySelector("main.prose");
			const de = document.documentElement;
			const rail = document.querySelector(".toc");
			const rect = (el) => {
				const r = el.getBoundingClientRect();
				return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
			};
			const [wide, narrow, hash] = [...main.querySelectorAll("table")].map((t) => ({
				...rect(t),
				// The visible table shrink-wraps inside the scroll box, so
				// this is what the reader sees; the box is what it may use.
				inner: rect(t.querySelector("tbody")).width,
				marginRight: getComputedStyle(t).marginRight,
				clipped: t.scrollWidth > t.clientWidth + 1,
			}));
			const img = (alt) => {
				const el = main.querySelector('img[alt="' + alt + '"]');
				return { natural: el.naturalWidth, ...rect(el) };
			};
			return {
				viewport: window.innerWidth,
				pageOverflow: de.scrollWidth - de.clientWidth,
				railRight: rail && getComputedStyle(rail).display !== "none" ? rect(rail).right : null,
				prose: rect(main),
				wide, narrow, hash,
				figure: img("wide figure"),
				smallFigure: img("small figure"),
				inlineImage: img("inline"),
				wbrInTables: main.querySelectorAll("table code wbr").length,
				wbrOutside: main.querySelectorAll("code wbr").length - main.querySelectorAll("table code wbr").length,
				align: main.querySelector("th:last-child").getAttribute("style"),
			};
		}`,
		check: ({ viewport, pageOverflow, railRight, prose, wide, narrow, hash, figure, smallFigure, inlineImage, wbrInTables, wbrOutside, align, errors }) => {
			assert.deepEqual(errors, []);
			assert.equal(prose.width, 832, "the prose keeps its measure");
			// The breakout itself, and the two edges it must never cross.
			assert.ok(wide.width > prose.width, `table box ${wide.width} should exceed the 832px measure`);
			assert.ok(wide.right <= viewport, `table right ${wide.right} is past the window`);
			assert.ok(railRight !== null && wide.left >= railRight, "the table must not reach under the rail");
			assert.equal(pageOverflow, 0, "the page itself must never scroll horizontally");
			// A narrow table gets the same box and still looks narrow: the
			// visible table shrink-wraps inside it.
			assert.equal(narrow.width, wide.width, "same box");
			assert.ok(narrow.inner < 120, `a narrow table stays narrow, got ${narrow.inner}px`);
			// <wbr> earns the breakout: with break opportunities at _ and /,
			// the wide table now fits instead of scrolling.
			assert.ok(wbrInTables > 0, "code chips in a table get <wbr>");
			assert.equal(wbrOutside, 0, "a chip in prose does not");
			assert.equal(wide.clipped, false, "the wide table fits once it can break and break out");
			// And where there is nothing to break, it still scrolls rather
			// than pushing the page out.
			assert.equal(hash.clipped, true, "an unbreakable token still scrolls inside its box");
			assert.ok(hash.right <= viewport, "even then it stays inside the window");
			// The code_inline override must not disturb what td_open writes.
			assert.match(align || "", /text-align:\s*right/, "authored alignment kept");
			// The prose sits in the lane rather than centred, so the gap
			// between the rail and the text is the 48px the layout needs and
			// not the drift centring used to leave behind. That gap is what
			// the breakout spends, so this and the table width above are one
			// assertion looked at from two ends.
			assert.equal(prose.left - railRight, 48, "the rail-to-prose gap is the lane's, not centring's drift");
			// A figure spends the same gutter. max-width never scales an
			// image up, so only the one that was being shrunk moves.
			assert.ok(figure.width > prose.width, `a wide figure breaks out, got ${figure.width}`);
			assert.equal(figure.right, wide.right, "a figure and a table share one right edge");
			assert.ok(figure.width < figure.natural, "still shrunk, just less");
			// +2: box-sizing is border-box and an image carries a 1px border
			// each side, so its natural size lands 2px wider as a border box.
			assert.equal(smallFigure.width, smallFigure.natural + 2, "a small figure is never scaled up");
			assert.ok(inlineImage.right <= prose.right, "an image among words is punctuation, not a figure");
		},
	},

	// The data view: a lazy tree. Ranges past 100 entries, the exact digits
	// of an integer JSON.parse would round, a key click that copies its
	// path, a value copy, and a re-render that reopens what was open.
	json: {
		...DATA,
		path: "/data.json",
		source: fixture("data.json"),
		probe: `async () => {
			const main = document.querySelector("main.jsn");
			const rowOf = (path) => main.querySelector(".jn[data-path='" + path + "']");
			// The first paint opens breadth-first under a budget, so a range
			// may or may not already be open; the click is only for a closed one.
			const ensureOpen = (path) => {
				const node = rowOf(path);
				if (!node.classList.contains("open")) node.querySelector(":scope > .row > .tg").click();
			};
			const items = rowOf("items");
			const ranges = [...items.querySelectorAll(":scope > .kids > .jn")].map((n) => n.dataset.path);
			// Open the second range, then a record in it.
			ensureOpen("items[100:200]");
			ensureOpen("items[150]");
			const nestedOpen = !!rowOf("items[150].nested");
			ensureOpen("items[150].nested");
			// Copy the path of a nested key, then the value of a container.
			rowOf("items[150].nested.x").querySelector(".key").click();
			for (let i = 0; i < 100 && window.__clip.length < 1; i++) await new Promise((r) => setTimeout(r, 20));
			rowOf("flags").querySelector(".copy").click();
			for (let i = 0; i < 100 && window.__clip.length < 2; i++) await new Promise((r) => setTimeout(r, 20));
			rowOf("items[100:200]").querySelector(".copy").click();
			for (let i = 0; i < 100 && window.__clip.length < 3; i++) await new Promise((r) => setTimeout(r, 20));
			// Unclip the long string.
			rowOf("long").querySelector(".more").click();
			// A second render fed the first one's open set reopens the same nodes.
			const expanded = window.jsonRender.expandedPaths(main);
			const again = window.jsonRender.render(${JSON.stringify(fixture("data.json"))}, { jsonl: false, expanded, icons: { copy: "", done: "" } });
			// Numbers a double cannot hold, in forms with no long digit run.
			const odd = window.jsonRender.render('{"a": 900719925474099.3e1, "b": 1e400, "c": 2.5}', { jsonl: false, expanded: null, icons: { copy: "", done: "" } });
			// A scalar is a valid file; a flat list of 35,000 entries is 350
			// range rows at the root, and the first range must still open.
			const opts = { jsonl: false, expanded: null, icons: { copy: "", done: "" } };
			const scalar = ["42", "null", '"hi"'].map((src) => window.jsonRender.render(src, opts).querySelector(".jn.root .val").textContent);
			const flat = window.jsonRender.render(JSON.stringify(Array.from({ length: 35000 }, (_, i) => i)), opts);
			document.body.appendChild(flat);
			const flatFirst = { ranges: flat.querySelectorAll(".jn.root > .kids > .jn").length, first: !!flat.querySelector(".jn[data-path='[0]']"), second: !!flat.querySelector(".jn[data-path='[100]']") };
			flat.querySelector(".expand").click();
			const flatExpand = { note: flat.querySelector(".tools .note").textContent, rows: flat.querySelectorAll(".jn").length };
			return {
				scalar, flatFirst, flatExpand,
				odd: [...odd.querySelectorAll(".val")].map((v) => v.textContent),
				oddCopy: (() => { const m = odd; return m.querySelector(".jn.root .copy") ? "has" : "none"; })(),
				emptyCopy: !!rowOf("empty_obj").querySelector(".copy") && !!rowOf("empty_arr").querySelector(".copy"),
				rootToggle: !!main.querySelector(".jn.root > .row > .tg"),
				title: document.title,
				railLabel: document.querySelector(".toc-label").textContent,
				toc: [...document.querySelectorAll(".toc a")].map((a) => a.getAttribute("href")),
				meta: main.querySelector(".meta").textContent,
				bigId: rowOf("big_id").querySelector(".val").textContent,
				link: rowOf("site").querySelector("a") && rowOf("site").querySelector("a").getAttribute("href"),
				empty: [rowOf("empty_obj").textContent, rowOf("empty_arr").textContent],
				weird: rowOf('["weird key!"]["a b"]') ? rowOf('["weird key!"]["a b"]').dataset.path : null,
				ranges,
				nestedOpen,
				longLen: rowOf("long").querySelector(".val").textContent.length,
				clip: window.__clip,
				reopened: [...again.querySelectorAll(".jn.open")].map((n) => n.dataset.path).sort(),
				expanded: [...expanded].sort(),
			};
		}`,
		check: ({ scalar, flatFirst, flatExpand, odd, oddCopy, emptyCopy, rootToggle, title, railLabel, toc, meta, bigId, link, empty, weird, ranges, nestedOpen, longLen, clip, reopened, expanded, errors }) => {
			assert.deepEqual(errors, []);
			assert.deepEqual(scalar, ["42", "null", "hi"], "a scalar root renders");
			assert.deepEqual(flatFirst, { ranges: 350, first: true, second: false }, "the first range of a big flat list opens on first paint, the second does not");
			assert.equal(flatExpand.note, "stopped at 5,000 rows");
			assert.ok(flatExpand.rows > 5000 && flatExpand.rows < 5600, `Expand all on a flat list stops near the ceiling (got ${flatExpand.rows})`);
			assert.deepEqual(odd, ["900719925474099.3e1", "1e400", "2.5"], "exponent forms keep their source text; a plain number is plain");
			assert.equal(oddCopy, "has");
			assert.equal(emptyCopy, true, "empty containers still copy");
			assert.equal(rootToggle, false, "the root has no toggle");
			assert.equal(title, "data.json");
			assert.equal(railLabel, "Keys");
			assert.deepEqual(toc, ["#", "#k-name", "#k-big_id", "#k-site", "#k-empty_obj", "#k-empty_arr", "#k-flags", "#k-long", "#k-weird-key", "#k-items"]);
			assert.match(meta, /^Object · 9 keys · [\d.]+ KB$/);
			assert.equal(bigId, "12345678901234567890", "an integer past 2^53 keeps its digits");
			assert.equal(link, "https://example.com/path?q=1");
			assert.deepEqual(empty, ["empty_obj: {}", "empty_arr: []"], "an empty container's copy button adds no text");
			assert.equal(weird, '["weird key!"]["a b"]', "non-identifier keys are bracket-quoted in the path");
			assert.deepEqual(ranges, ["items[0:100]", "items[100:200]", "items[200:250]"]);
			assert.equal(nestedOpen, true, "opening a range renders its entries");
			assert.equal(longLen, 1000, "… more unclips the string");
			assert.equal(clip[0].text, "items[150].nested.x", "a key click copies its path");
			assert.equal(clip[1].text, JSON.stringify({ on: true, off: false, none: null, n: 1.5, neg: -0.25 }, null, 2));
			assert.equal(JSON.parse(clip[2].text).length, 100, "a range copies its slice");
			assert.ok(expanded.includes("items[100:200]") && expanded.includes("items[150]"));
			assert.deepEqual(reopened, expanded, "a re-render reopens exactly the outgoing set");
		},
	},

	// Find searches the parsed values, not the page: a match in a collapsed
	// range is found, its way down is opened, and only that. Substring,
	// regex, path-mode, Enter to step, a refresh that keeps the query. Every
	// match on a rendered row is marked, the current one stronger, and rows
	// that appear later — an open, Expand all, an unclipped string — are
	// marked as they appear.
	find: {
		...DATA,
		path: "/data.json",
		source: fixture("data.json"),
		probe: `async () => {
			const main = document.querySelector("main.jsn");
			const input = main.querySelector(".find input");
			const count = () => main.querySelector(".find .count").textContent;
			const hit = () => { const r = main.querySelector(".row.hit"); return r ? r.parentElement.dataset.path : null; };
			const type = async (q) => {
				input.value = q;
				input.dispatchEvent(new Event("input", { bubbles: true }));
				await new Promise((r) => setTimeout(r, 250));
			};
			const enter = (shift) => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: !!shift, bubbles: true, cancelable: true }));
			const rowsBefore = main.querySelectorAll(".jn").length;
			// A value deep in the last range, which the first paint left closed.
			await type("t2");
			const marks = (scope) => [...(scope || main).querySelectorAll("mark.m")].map((m) => m.parentElement.closest(".jn").dataset.path + ":" + m.textContent);
			const hitMarks = () => marks(main.querySelector(".row.hit") || document.createElement("i"));
			const first = { count: count(), hit: hit(), rows: main.querySelectorAll(".jn").length, hitMarks: hitMarks(), marks: marks().length, allT2: marks().every((x) => x.endsWith(".tag:t2")) };
			enter(); enter();
			const third = { count: count(), hit: hit(), hitMarks: hitMarks(), marks: marks().length };
			enter(true);
			const back = { count: count(), hit: hit() };
			const opened249 = !!main.querySelector(".jn[data-path='items[249]']");
			// Expand all: every match the file has is now on the page, marked once each.
			main.querySelector(".expand").click();
			const wide = { marks: marks().length, hitMarks: hitMarks(), hit: hit() };
			// Collapse all takes the rows away; opening the way back down marks the new rows.
			main.querySelector(".collapse").click();
			const closed = marks().length;
			const rowOf = (path) => main.querySelector(".jn[data-path='" + path + "']");
			for (const path of ["items", "items[0:100]", "items[5]"]) rowOf(path).querySelector(":scope > .row > .tg").click();
			const reopened = marks();
			// Path mode: a dot in the query matches paths.
			await type("nested.x");
			const pathMode = { count: count(), hit: hit() };
			// A bare word does not match by path — "flags" hits the key once,
			// not each of its five children.
			await type("flags");
			const bare = count();
			// Regex, and a match in the folded tail of a long string unclips it.
			await type("/x{900}/");
			const regex = { count: count(), hit: hit(), len: main.querySelector(".jn[data-path='long'] .val").textContent.length, markLen: main.querySelector("mark.m").textContent.length };
			// A special character in a plain query is text, not regex.
			await type("q=1");
			const literal = { count: count(), marks: marks() };
			await type("zzz");
			const none = { count: count(), hit: hit() };
			// The refresh path: a new render fed the query keeps it, counts it, and does not jump.
			await type("t2");
			const again = window.jsonRender.render(${JSON.stringify(fixture("data.json"))}, { jsonl: false, expanded: null, query: window.jsonRender.queryOf(main), icons: { copy: "", done: "" } });
			document.body.appendChild(again);
			await new Promise((r) => setTimeout(r, 50));
			const kept = { value: again.querySelector(".find input").value, count: again.querySelector(".find .count").textContent, hit: !!again.querySelector(".row.hit"), marked: again.querySelectorAll("mark.m").length > 0 };
			// A clipped string is judged whole: /x{450}/ matches across the fold, so the visible
			// prefix is marked up to the fold, and "… more" then draws the match at its true extent.
			const clipped = window.jsonRender.render(${JSON.stringify(fixture("data.json"))}, { jsonl: false, expanded: null, query: "/x{450}|t2/", icons: { copy: "", done: "" } });
			document.body.appendChild(clipped);
			await new Promise((r) => setTimeout(r, 50));
			const longRow = clipped.querySelector(".jn[data-path='long'] > .row");
			const before = [...longRow.querySelectorAll("mark.m")].map((m) => m.textContent.length);
			longRow.querySelector(".more").click();
			const unclipped = { before, after: [...longRow.querySelectorAll("mark.m")].map((m) => m.textContent.length), len: longRow.querySelector(".val").textContent.length };
			// A clipped string is judged whole: /x$/ matches its last character, which is
			// past the fold, so the visible prefix — which also ends in x — is not marked.
			const anchored = window.jsonRender.render(${JSON.stringify(fixture("data.json"))}, { jsonl: false, expanded: null, query: "/x$/", icons: { copy: "", done: "" } });
			document.body.appendChild(anchored);
			await new Promise((r) => setTimeout(r, 50));
			const anchoredRow = anchored.querySelector(".jn[data-path='long'] > .row");
			const anchoredBefore = anchoredRow.querySelectorAll("mark.m").length;
			anchoredRow.querySelector(".more").click();
			const anchoredAfter = [...anchoredRow.querySelectorAll("mark.m")].map((m) => m.textContent);
			// The page-wide budget: 300 values of 100 letters is 30,000 possible marks; 20,000
			// are drawn, then rows stay plain — except the current match, drawn whole. The
			// last value is long enough to clip.
			const bigSrc = JSON.stringify(Object.fromEntries(Array.from({ length: 300 }, (_, i) => ["k" + i, "a".repeat(i === 299 ? 500 : 100)])));
			const big = window.jsonRender.render(bigSrc, { jsonl: false, expanded: null, query: "a", icons: { copy: "", done: "" } });
			document.body.appendChild(big);
			await new Promise((r) => setTimeout(r, 50));
			big.querySelector(".expand").click();
			const budget = { rows: big.querySelectorAll(".jn").length, marks: big.querySelectorAll("mark.m").length, count: big.querySelector(".find .count").textContent };
			const lastRow = big.querySelector(".jn[data-path='k299'] > .row");
			budget.lastBefore = lastRow.querySelectorAll("mark.m").length;
			// Unclipping a plain row past the budget does not draw it.
			lastRow.querySelector(".more").click();
			budget.unclipped = [lastRow.querySelectorAll("mark.m").length, lastRow.querySelector(".val").textContent.length];
			big.querySelector(".find .prev").click();
			budget.lastAfter = lastRow.querySelectorAll("mark.m").length;
			budget.hit = lastRow.classList.contains("hit");
			budget.total = big.querySelectorAll("mark.m").length;
			// Stepping on: the row that was current goes back under the budget, and is plain again.
			big.querySelector(".find .prev").click();
			budget.stepped = [lastRow.querySelectorAll("mark.m").length, big.querySelector(".row.hit").querySelectorAll("mark.m").length, big.querySelectorAll("mark.m").length];
			// Marks that leave with a closed node come off the count, so a reopen may draw again.
			const bigList = window.jsonRender.render(JSON.stringify([Array.from({ length: 150 }, () => "a".repeat(100)), Array.from({ length: 150 }, () => "a".repeat(100))]), { jsonl: false, expanded: null, query: "a", icons: { copy: "", done: "" } });
			document.body.appendChild(bigList);
			await new Promise((r) => setTimeout(r, 50));
			// The first paint opened both lists and their first ranges: 200 values, the whole budget.
			const refund = { open: bigList.querySelectorAll("mark.m").length };
			bigList.querySelector(".jn[data-path='[0]'] > .row > .tg").click();
			refund.closed = bigList.querySelectorAll("mark.m").length;
			bigList.querySelector(".jn[data-path='[0]'] > .row > .tg").click();
			refund.reopened = bigList.querySelectorAll("mark.m").length;
			bigList.querySelector(".jn[data-path='[0][0:100]'] > .row > .tg").click();
			refund.rangeOpened = bigList.querySelectorAll("mark.m").length;
			// "/" focuses the box; Ctrl+F too, and is prevented.
			input.blur();
			document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));
			const slashFocus = document.activeElement === input || document.activeElement === again.querySelector(".find input");
			const ctrl = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
			document.body.dispatchEvent(ctrl);
			return { rowsBefore, first, third, back, opened249, wide, closed, reopened, pathMode, bare, regex, literal, none, kept, unclipped, anchoredBefore, anchoredAfter, budget, refund, slashFocus, ctrlPrevented: ctrl.defaultPrevented };
		}`,
		check: ({ rowsBefore, first, third, back, opened249, wide, closed, reopened, pathMode, bare, regex, literal, none, kept, unclipped, anchoredBefore, anchoredAfter, budget, refund, slashFocus, ctrlPrevented, errors }) => {
			assert.deepEqual(errors, []);
			// tag "t2" on items 2, 5, 8 … 248: 83 of them.
			assert.equal(first.count, "1 of 83");
			assert.equal(first.hit, "items[2].tag");
			assert.ok(first.rows <= rowsBefore + 10, "the first jump opened at most the way to one match, not the whole file");
			assert.deepEqual(first.hitMarks, ["items[2].tag:t2"], "the matched text is marked on the current row");
			assert.ok(first.marks > 1 && first.marks < 83 && first.allT2, `the other matches on the page are marked too, and only those (got ${first.marks})`);
			assert.equal(third.count, "3 of 83");
			assert.equal(third.hit, "items[8].tag");
			assert.deepEqual(third.hitMarks, ["items[8].tag:t2"], "the current row moved");
			assert.equal(third.marks, first.marks, "stepping neither adds nor removes marks");
			assert.equal(back.count, "2 of 83");
			assert.equal(back.hit, "items[5].tag");
			assert.equal(opened249, false, "the last range stayed closed");
			assert.deepEqual(wide, { marks: 83, hitMarks: ["items[5].tag:t2"], hit: "items[5].tag" }, "Expand all marks every match it opens, once each; the current row stays");
			assert.equal(closed, 0, "Collapse all took the marked rows away");
			assert.deepEqual(reopened, ["items[5].tag:t2"], "rows opened by hand are marked as they appear");
			assert.equal(pathMode.count, "1 of 250");
			assert.equal(pathMode.hit, "items[0].nested.x");
			assert.equal(bare, "1 of 1", "a bare word matches keys and values, never paths");
			assert.equal(regex.count, "1 of 1");
			assert.equal(regex.hit, "long");
			assert.equal(regex.len, 1000, "the current match unclips its string");
			assert.equal(regex.markLen, 900, "the regex match is marked at its true extent");
			assert.deepEqual(literal, { count: "1 of 1", marks: ["site:q=1"] }, "a plain query is literal, and marks inside a link's text");
			assert.deepEqual(none, { count: "no matches", hit: null });
			assert.deepEqual(kept, { value: "t2", count: "0 of 83", hit: false, marked: true }, "a refresh keeps the query and count, marks the page, and does not jump");
			assert.deepEqual(unclipped, { before: [400], after: [450, 450], len: 1000 }, "a match across the fold is cut at it, then drawn whole once the string is");
			assert.equal(anchoredBefore, 0, "a clipped string is judged whole: an end-anchored match past the fold is not drawn on the prefix");
			assert.deepEqual(anchoredAfter, ["x"], "and is drawn once the string is whole");
			assert.equal(budget.rows, 304, "every value is a row on the page, under three ranges and the root");
			assert.equal(budget.count, "0 of 300");
			assert.equal(budget.marks, 20000, "marks stop at the page budget");
			assert.deepEqual(budget.unclipped, [0, 500], "unclipping a plain row past the budget shows the string but draws nothing");
			assert.deepEqual([budget.lastBefore, budget.lastAfter, budget.hit], [0, 200, true], "the current match is drawn whole past the budget, up to the per-value cap");
			assert.equal(budget.total, 20200, "and counted");
			assert.deepEqual(budget.stepped, [0, 100, 20100], "a row that stops being current gives its forced marks back");
			assert.deepEqual(refund, { open: 20000, closed: 10000, reopened: 10000, rangeOpened: 20000 }, "closing a node gives its marks back to the budget, and a later open spends them");
			assert.equal(slashFocus, true);
			assert.equal(ctrlPrevented, true);
		},
	},

	// JSON Lines: the file is the root, records are its children, a bad line
	// is one bad row with its line number, and the header sums the fields.
	jsonl: {
		...DATA,
		path: "/data.jsonl",
		source: fixture("data.jsonl"),
		probe: `async () => {
			const main = document.querySelector("main.jsn");
			const rowOf = (path) => main.querySelector(".jn[data-path='" + path + "']");
			main.querySelector(".jn.root > .row > .copy").click();
			for (let i = 0; i < 100 && !window.__clip.length; i++) await new Promise((r) => setTimeout(r, 20));
			// Find over records: a bad line is searched as its own text, and
			// Previous from a restored (no-current) query wraps to the last.
			const input = main.querySelector(".find input");
			const type = async (q) => { input.value = q; input.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 250)); };
			await type("not json");
			const badHit = main.querySelector(".row.hit") && main.querySelector(".row.hit").parentElement.dataset.path;
			// A long bad line: the match in its tail is shown and marked when it is the hit.
			const longBad = window.jsonRender.render('{"ok": 1}\\n' + "x".repeat(600) + " needle", { jsonl: true, expanded: null, query: "needle", icons: { copy: "", done: "" } });
			document.body.appendChild(longBad);
			longBad.querySelector(".find .next").click();
			const tail = { count: longBad.querySelector(".find .count").textContent, marks: [...longBad.querySelectorAll("mark.m")].map((m) => m.textContent), rawLen: longBad.querySelector(".row.hit .raw").textContent.length };
			const again = window.jsonRender.render(${JSON.stringify(fixture("data.jsonl"))}, { jsonl: true, expanded: null, query: "msg", icons: { copy: "", done: "" } });
			document.body.appendChild(again);
			again.querySelector(".find .prev").click();
			const wrapped = again.querySelector(".find .count").textContent + " " + again.querySelector(".row.hit").parentElement.dataset.path;
			// An empty first paint: the root says so, and nothing throws.
			const empty = window.jsonRender.render("", { jsonl: true, expanded: null, icons: { copy: "", done: "" } }).querySelector(".jn.root .row").textContent;
			let emptyJson = "";
			try { window.jsonRender.render("", { jsonl: false, expanded: null, icons: { copy: "", done: "" } }); } catch (e) { emptyJson = "threw"; }
			return {
				badHit, tail, wrapped, empty, emptyJson,
				meta: main.querySelector(".meta").textContent,
				fields: [...main.querySelectorAll(".fields .f")].map((f) => f.textContent),
				records: [...main.querySelectorAll(".jn.root > .kids > .jn")].map((n) => n.dataset.path),
				bad: rowOf("[3]").className + " | " + rowOf("[3]").querySelector(".err").textContent,
				tags: rowOf("[0].tags") && rowOf("[0].tags").querySelector(".sum").textContent,
				railLabel: document.querySelector(".toc-label").textContent,
				copied: window.__clip[0],
			};
		}`,
		check: ({ badHit, tail, wrapped, empty, emptyJson, meta, fields, records, bad, tags, railLabel, copied, errors }) => {
			assert.deepEqual(errors, []);
			assert.equal(badHit, "[3]", "a bad line is found by its own text");
			assert.deepEqual(tail, { count: "1 of 1", marks: ["needle"], rawLen: 607 }, "a hit in a long bad line's tail unclips and marks it");
			assert.equal(wrapped, "4 of 4 [4].msg", "Previous from a restored query wraps to the last match");
			assert.equal(empty, "no records");
			assert.equal(emptyJson, "threw", "an empty .json is reported, not rendered as nothing");
			assert.match(meta, /^JSON Lines · 5 records · \d+ B$/, "blank lines are not records");
			assert.deepEqual(fields, ["id 100%", "msg 100%", "tags 75%", "extra 25%"], "share among records that parsed");
			assert.deepEqual(records, ["[0]", "[1]", "[2]", "[3]", "[4]"]);
			assert.match(bad, /^jn bad top \| line 5: /, "the bad row names its line in the file");
			assert.equal(tags, "1 item");
			assert.equal(railLabel, "Records");
			assert.equal(copied.text, fixture("data.jsonl").split("\n").filter((l) => l.trim()).join("\n"), "the root copies the file's own lines");
		},
	},
};

// ---------------------------------------------------------------- Run
const only = process.argv[2];
if (only && !cases[only]) {
	console.error(`no such case: ${only} (have ${Object.keys(cases).join(", ")})`);
	process.exit(2);
}
const names = Object.keys(cases).filter((n) => !only || n === only);
const pages = Object.fromEntries(names.map((n) => [`/__${n}.html`, page(cases[n])]));
const server = await serve(pages);
const { port } = server.address();
let failed = 0;
for (const name of names) {
	try {
		cases[name].check(await dump(`http://127.0.0.1:${port}/__${name}.html`, cases[name].width));
		console.log(`ok    ${name}`);
	} catch (e) {
		failed++;
		console.log(`FAIL  ${name}\n${e.stack || e}`);
	}
}
server.close();
process.exit(failed ? 1 : 0);
