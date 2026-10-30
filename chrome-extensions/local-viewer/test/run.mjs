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

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createContext, runInContext } from "node:vm";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CHROME = process.env.CHROME || "google-chrome";
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2" };

// ---------------------------------------------------------------- Harness
// One page per case. `path` is what content.js will see as the URL; `scripts`
// and `css` are the manifest's entries for that path; `probe` runs after the
// render and returns what to assert on. `sendMessage` answers content.js's
// messages to worker.js, whose types are recorded in `messages`; by default
// every one gets null, which a read takes as "file unchanged".
const page = ({ source, path, scripts, css, probe, sendMessage = "() => Promise.resolve(null)" }) => `<!doctype html>
<meta charset="utf-8">
${css.map((f) => `<link rel="stylesheet" href="/${f}">`).join("\n")}
<pre>${source.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>
<script>
history.replaceState(null, "", ${JSON.stringify(path)});
window.__out = { errors: [], messages: [] };
window.chrome = { runtime: { getURL: (p) => "/" + p, sendMessage: (m) => (window.__out.messages.push(m && m.type), (${sendMessage})(m)) } };
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
// Armed here, before the extension's scripts, rather than in a script after
// them: a notebook page adds its own CSP meta as content.js loads, and a
// script parsed after that point is refused by it. load fires once every
// script below has run.
window.addEventListener("load", () => setTimeout(async () => {
	try { Object.assign(window.__out, await (${probe})()); }
	catch (e) { window.__out.errors.push("probe: " + (e.stack || e)); }
	const ta = document.createElement("textarea"); ta.id = "__out";
	ta.textContent = JSON.stringify(window.__out);
	document.body.appendChild(ta);
}, 300));
</script>
${scripts.map((f) => `<script src="/${f}"></script>`).join("\n")}`;

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
	if (!match) throw new Error("page produced no output; content.js did not finish\n" + (process.env.DEBUG_DOM ? dom : dom.slice(0, 2000)));
	const text = match[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
	return JSON.parse(text);
};

// ---------------------------------------------------------------- Cases
const fixture = (name) => readFileSync(join(HERE, "fixtures", name), "utf8");
const MD = { scripts: ["markdown-it.min.js", "highlight.min.js", "details.js", "anchors.js", "images.js", "links.js", "breaks.js", "comments.js", "frontmatter.js", "image-viewer.js", "mermaid.js", "content.js"], css: ["theme.css"] };
const EMAIL = { scripts: ["markdown-it.min.js", "comments.js", "frontmatter.js", "content.js"], css: ["email.css"] };
const DATA = { scripts: ["json.js", "content.js"], css: ["theme.css", "json.css"] };
const NB = { scripts: ["markdown-it.min.js", "highlight.min.js", "details.js", "anchors.js", "images.js", "links.js", "breaks.js", "comments.js", "notebook.js", "image-viewer.js", "mermaid.js", "content.js"], css: ["theme.css", "notebook.css"] };

// Captions and table source notes, rendered by the extension (`captions`) and
// the exporter (`md2htmlCaptions`) and checked against one list, so the two
// cannot drift apart on which paragraphs are captions.
const CAPTIONS = {
	source: () => {
		const png = /!\[small figure\]\((data:[^)]*)\)/.exec(fixture("tables.md"))[1];
		const table = ["| A | B |", "|---|---|", "| 1 | 2 |", ""];
		return [
			"# Captions", "",
			...table, "*Source: one line.*", "",
			...table, "*¹ First note.*\\", "*² Second note.*", "",
			...table, "*First italic paragraph.*", "", "*Second italic paragraph.*", "",
			...table, "*Source:* words follow the emphasis.", "",
			...table, "Body text.", "", "*After body text.*", "",
			"- Item", "", ...table.map((l) => l && "  " + l), "  *In a list item.*", "",
			...table.map((l) => "> " + l), "> *In a quote.*", "",
			"<details>", "<summary>More</summary>", "", ...table, "*In details.*", "", "</details>", "",
			`![figure](${png})`, "", "*Figure 2: line one*\\", "*line two.*", "",
			`![figure](${png})`, "", "Body text.", "", "*Far below a figure.*",
		].join("\n");
	},
	expected: [
		"Source: one line.",
		"¹ First note. ² Second note.",
		"First italic paragraph.",
		"Figure 2: line one line two.",
	],
};

// Short codes kept on one line, rendered by the extension (`nowrap`) and the
// exporter (`md2htmlNowrap`) and checked against one list. The long Decision
// sentences hold the # column to its minimum width, the way the PRD that
// prompted this did; the rows below them are the ones that must not match.
const NOWRAP = {
	source: () => {
		const long = "A decision long enough to wrap over several lines at any width the harness uses, so that the table is narrower than all of its text and the automatic layout has to squeeze it";
		return [
			"# Codes", "",
			"| # | Decision | Owner | Q4-2026 |", "|---|---|---|---|",
			"| | **For Product to decide** | | |",
			`| OD-1 | ${long}. | Anish | 2026-10-31 |`,
			`| **OD-16** | ${long}, again. | Anish, with the frontend and app teams | R1–R4 |`,
			"| [OD-7](#codes) | Short. | Self-recommendations | 94%¹ |",
			"| OD\\-9 | Short. | evidence-m365-verified-2026-10-19.md | `claude-opus-4-5` |", "",
		].join("\n");
	},
	// The header with a digit, plain, bold, linked and escaped codes, a date,
	// a range and a footnoted figure. Not the empty group cell, a word with
	// no digit, a code chip (the <wbr> rule's), or a file name over 16. Only
	// codes in the first column: anything wider there would hold it open.
	expected: ["Q4-2026", "OD-1", "2026-10-31", "OD-16", "R1–R4", "OD-7", "94%¹", "OD-9"],
};

// Header rows with every cell empty, dropped by the extension (`emptyHead`)
// and the exporter (`md2htmlEmptyHead`), checked against one list. &nbsp;
// counts as empty; one cell with anything else in it, an image with no alt
// text included, keeps the header.
const EMPTY_HEAD = {
	source: () => {
		const png = /!\[small figure\]\((data:[^)]*)\)/.exec(fixture("tables.md"))[1];
		return [
			"# Grids", "",
			"| | | |", "|---|---|---|", "| a | b | c |", "",
			"| &nbsp; |  |", "|---|---|", "| d | e |", "",
			"| Village | |", "|---|---|", "| f | g |", "",
			`| ![](${png}) | |`, "|---|---|", "| h | i |", "",
			"| | |", "|---|---|", `| ![grid](${png}) | ![grid](${png}) |`, "",
		].join("\n");
	},
	// Per table: does it keep a header, and its row count, header included.
	expected: [[false, 1], [false, 1], [true, 2], [true, 2], [false, 1]],
};

// Grids of pictures, marked by the extension (`grid`) and the exporter
// (`md2htmlGrid`) and checked against one list: a table whose body cells
// hold only images, under labels or none, with a link round one or an empty
// cell. One word in the body, and it stays a table.
const GRID = {
	source: () => {
		const svg = "data:image/svg+xml;base64," +
			Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"></svg>').toString("base64");
		const img = `<img src="${svg}" width="120">`;
		return [
			"# Grids", "",
			"| | | |", "|---|---|---|", `| ${img} | ${img} | ${img} |`, `| ${img} | ${img} | |`, "",
			"| Village | Wood |", "|---|---|", `| ${img} | [${img}](#grids) |`, "",
			"| | |", "|--:|---|", `| ${img} | ${img} |`, "",
			"| | |", "|---|---|", `| ${img} caption | ${img} |`, "",
			"| A | B |", "|---|---|", "| 1 | 2 |", "",
		].join("\n");
	},
	// Per table: is it a grid. Plain, labelled with a linked image, aligned
	// by its author, a word beside an image, data.
	expected: [true, true, true, false, false],
};

// Links of every kind theme.css once drew a chevron after, and the ones it
// did not: a same-page jump, a link around an image, and a data: link,
// which content.js unwraps (the exporter keeps it). None gets anything after
// it now, and none is rewrapped: what markdown-it wrote inside a link stays.
const MARKER = {
	source: () => [
		"# Links", "",
		"[`sketch-cg-weekly-tv-update.md`](sketch-cg-weekly-tv-update.md)", "",
		"[Several words in a long link label](notes.md)", "",
		"**[bold label](bold.md)**", "",
		"<https://example.com/a/long/path>", "",
		"https://bare.example.com/page", "",
		"[same page](#links) and [elsewhere](other.md#links)", "",
		"[![local](data:image/png;base64,iVBORw0KGgo=)](https://example.com/linked)", "",
		"![remote](https://example.com/remote.png)", "",
		"[data](data:image/png;base64,iVBORw0KGgo=)", "",
		"<details open><summary>[in summary](summary.md)</summary>",
		"[in body](body.md)",
		"</details>", "",
		"| File | What |", "|---|---|",
		"| [`reader-notes/`](reader-notes/) | A directory |",
		"| [`sketch-cg-weekly-tv-update.md`](sketch-cg-weekly-tv-update.md) | A file |",
		"| [`inventory.md`](inventory.md), [`notes/`](notes/) | A comma after the link |",
		"| `a/b/` and `snake_case_` | Chips that end in a separator |", "",
	].join("\n"),
	notebook: () => JSON.stringify({
		nbformat: 4, nbformat_minor: 5, metadata: {},
		cells: [
			{ cell_type: "markdown", metadata: {}, source: ["# Links\n", "\n", "[cell link](cell.md)\n"] },
			{
				cell_type: "code", execution_count: 1, metadata: {}, source: ["display(x)"],
				outputs: [{ output_type: "display_data", metadata: {}, data: { "text/html": ['<a href="https://example.com/out">out</a>'] } }],
			},
		],
	}),
};

// Where the rail, the text column and a canvas sit at one window width.
const lane = (width, check) => ({
	...MD,
	path: `/lane-${width}.md`,
	source: fixture("tables.md"),
	width,
	probe: `async () => {
		const de = document.documentElement;
		const rect = (q) => { const r = document.querySelector(q).getBoundingClientRect(); return { left: r.left, right: r.right }; };
		return { viewport: de.clientWidth, overflow: de.scrollWidth - de.clientWidth,
			rail: rect(".toc"), prose: rect("main.prose"), block: rect(".codeblock") };
	}`,
	check,
});

// A wide table, a narrow one and a long line of code, with or without the
// rail: the narrow table keeps the shared edges, the other two grow to the
// right edge `limit` gives, which is not the window's at 2560.
const grow = (width, rail, limit) => ({
	...MD,
	path: `/grow-${width}${rail ? "-rail" : ""}.md`,
	width,
	source: [
		"# Growth", "",
		...(rail ? ["## One", "", "## Two", "", "## Three", ""] : []),
		"| Key | Notes |", "| --- | --- |", `| item | ${"a long sentence of notes ".repeat(12).trim()} |`, "",
		"| A | B |", "| - | - |", "| 1 | 2 |", "",
		"```sh", "echo " + "x".repeat(300), "```", "",
	].join("\n"),
	probe: `async () => {
		const de = document.documentElement;
		const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; };
		const toc = document.querySelector(".toc");
		const [wide, narrow] = [...document.querySelectorAll(".tablewrap")].map(rect);
		return { viewport: de.clientWidth, overflow: de.scrollWidth - de.clientWidth, rail: !!toc && getComputedStyle(toc).display !== "none",
			prose: rect(document.querySelector("main.prose")), wide, narrow, code: rect(document.querySelector(".codeblock")) };
	}`,
	check: (out) => {
		const { viewport, overflow, prose, wide, narrow, code, errors } = out;
		assert.deepEqual(errors, []);
		assert.equal(out.rail, rail, rail ? "three h2s, a rail" : "no h2, no rail");
		assert.equal(overflow, 0);
		const side = prose.left - narrow.left;
		assert.ok(Math.abs(side - 160) <= 0.5, `the whole breakout, got ${side}px`);
		assert.ok(Math.abs(narrow.right - prose.right - side) <= 0.5, "a table that fits keeps symmetric edges");
		const right = limit(out);
		assert.ok(right <= viewport - 48, `the limit ${right} must leave the 48px margin in ${viewport}`);
		for (const [name, box] of [["table", wide], ["code", code]]) {
			assert.ok(Math.abs(box.left - narrow.left) <= 0.5, `${name}: the left edge stays`);
			assert.ok(Math.abs(box.right - right) <= 0.5, `${name}: grows to ${right}, got ${box.right} in ${viewport}`);
		}
	},
});

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
				toc: [...document.querySelectorAll(".toc a")].map((a) => a.dataset.href),
				rail: await (async () => {
					const link = document.querySelector('.toc a[data-href="#second"]');
					const atRest = document.querySelectorAll(".toc a[href]").length;
					link.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
					const pressed = link.getAttribute("href");
					link.dispatchEvent(new MouseEvent("mouseleave"));
					const left = link.getAttribute("href");
					link.click();
					await new Promise((r) => setTimeout(r, 50));
					// Enter follows a link only if it has an href, so focus must
					// put it back and blur take it away again.
					const third = document.querySelector('.toc a[data-href="#third"]');
					third.focus();
					const focused = document.activeElement === third && third.getAttribute("href");
					third.blur();
					return { atRest, pressed, left, hash: location.hash, after: link.getAttribute("href"), focused, blurred: third.getAttribute("href"), label: document.querySelector(".toc-label").tagName };
				})(),
				imgs: [...document.querySelectorAll("img")].map((i) => i.getAttribute("src")),
				links: [...document.querySelectorAll("main a")].map((a) => a.getAttribute("href")),
				copied: window.__clip[0],
				task: document.querySelector("li.task input") && document.querySelector("li.task input").checked,
			};
		}`,
		check: ({ title, toc, rail, imgs, links, copied, task, messages, errors }) => {
			assert.deepEqual(errors, []);
			// No diagram, so the 5.5 MB bundle is never asked for.
			assert.ok(!messages.includes("mermaid"), "Mermaid is loaded only for a page with a diagram");
			// No href at rest, so Chrome's status bubble stays away while the
			// rail is browsed; back for a press, gone on leave, and a bare
			// click still navigates by the anchor's own default action.
			assert.deepEqual(rail, { atRest: 0, pressed: "#second", left: null, hash: "#second", after: null, focused: "#third", blurred: null, label: "BUTTON" });
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

	// Geometry, which is the one thing the other cases never look at. Code,
	// tables and figures sit in canvases that break out of the 720px measure
	// by the same amount on both sides, a canvas whose content is wider grows
	// to the right as far as the content asks, and a code chip inside a table
	// gets <wbr> so a path stops setting the column's minimum width. All read
	// back from the laid-out page, not from the markup: the assertions that
	// matter here are "does it fit", "is it symmetric", "does it grow only as
	// far as it needs" and "does it stay off the rail", and only layout can
	// answer those.
	tables: {
		...MD,
		path: "/tables.md",
		source: fixture("tables.md"),
		// Wide enough for the whole 160px breakout beside the rail.
		width: 1728,
		probe: `async () => {
			const main = document.querySelector("main.prose");
			const de = document.documentElement;
			const rail = document.querySelector(".toc");
			const rect = (el) => {
				const r = el.getBoundingClientRect();
				return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
			};
			const pad = (el) => {
				const cs = getComputedStyle(el);
				return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
			};
			const [wide, narrow, hash] = [...main.querySelectorAll(".tablewrap")].map((panel) => {
				const table = panel.querySelector("table");
				const box = {
					...rect(panel),
					// What a table may fill: the panel inside its padding.
					content: Math.round(panel.clientWidth - pad(panel)),
					table: rect(table).width,
					clipped: panel.scrollWidth > panel.clientWidth + 1,
				};
				// What the panel asks for: the table with every cell on one
				// line, and the panel's padding around it.
				table.style.width = "max-content";
				box.asks = table.getBoundingClientRect().width + pad(panel);
				table.style.width = "";
				return box;
			});
			const img = (alt) => {
				const el = main.querySelector('img[alt="' + alt + '"]');
				return { natural: el.naturalWidth, ...rect(el) };
			};
			return {
				// clientWidth, not innerWidth: the edge a box must stay inside
				// is the one left of a classic scrollbar.
				viewport: de.clientWidth,
				pageOverflow: de.scrollWidth - de.clientWidth,
				railRight: rail && getComputedStyle(rail).display !== "none" ? rect(rail).right : null,
				prose: rect(main),
				wide, narrow, hash,
				// -apple-system is SF Pro on a Mac and nothing on Linux, where
				// Inter takes over; the detection in content.js must say which.
				sf: de.hasAttribute("data-sf"),
				captions: [...main.querySelectorAll(".caption")].map((p) => p.textContent),
				figurePanel: { ...rect(main.querySelector("p.figure")), pad: pad(main.querySelector("p.figure")) },
				figure: img("wide figure"),
				linkedFigure: img("linked figure"),
				smallFigure: img("small figure"),
				inlineImage: img("inline"),
				pairedImage: img("pair"),
				blocks: [...main.querySelectorAll(".codeblock")].map((b) => {
					const pre = b.querySelector("pre");
					const cs = getComputedStyle(pre);
					return {
						...rect(b),
						pre: rect(pre),
						// The line's own width, what the block needs to show it
						// whole. Not scrollWidth: that is floored at the box, so in
						// a widened box it would read the box for a three-word line.
						line: Math.round((() => { const r = document.createRange(); r.selectNodeContents(pre.querySelector("code")); return r.getBoundingClientRect().width; })()),
						content: Math.round(pre.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
						pad: pad(pre),
						clipped: pre.scrollWidth > pre.clientWidth + 1,
						button: rect(b.querySelector("button.copy")),
					};
				}),
				wbrInTables: main.querySelectorAll("table code wbr").length,
				wbrOutside: main.querySelectorAll("code wbr").length - main.querySelectorAll("table code wbr").length,
				align: main.querySelector("th:last-child").getAttribute("style"),
				// Where a chip sits in a one-line cell, in CSS px. A baseline
				// is not in any rect, so a zero-height inline-block marks it:
				// its bottom edge rests on the baseline of whatever holds it.
				chips: [...main.querySelectorAll(".tablewrap:last-of-type td code")].map((code) => {
					const td = code.closest("td");
					const cs = getComputedStyle(td);
					const cell = td.getBoundingClientRect();
					const box = code.getBoundingClientRect();
					const top = cell.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
					const bottom = cell.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom);
					const mark = (parent, before) => {
						const m = document.createElement("span");
						m.style.cssText = "display:inline-block;width:0;height:0";
						parent.insertBefore(m, before);
						const y = m.getBoundingClientRect().bottom;
						m.remove();
						return y;
					};
					const chipCs = getComputedStyle(code);
					return {
						text: code.textContent,
						above: box.top - top,
						below: bottom - box.bottom,
						// Chip text minus cell text: positive is higher.
						lift: mark(td, null) - mark(code, null),
						padding: [chipCs.paddingTop, chipCs.paddingBottom],
					};
				}),
			};
		}`,
		check: ({ viewport, pageOverflow, railRight, prose, wide, narrow, hash, sf, captions, figurePanel, blocks, figure, linkedFigure, smallFigure, inlineImage, pairedImage, wbrInTables, wbrOutside, align, chips, errors }) => {
			assert.deepEqual(errors, []);
			assert.equal(prose.width, 720, "the prose keeps its measure");
			assert.equal(sf, process.platform === "darwin", "SF Pro's tracking on a Mac, Inter's elsewhere");
			// A canvas whose content fits: as far past the measure on the left
			// as on the right, clear of the rail, inside the window.
			const side = prose.left - narrow.left;
			assert.ok(side > 0, `the table panel should break out, got ${side}px`);
			assert.ok(Math.abs(narrow.right - prose.right - side) <= 1, `symmetric: ${side}px left, ${narrow.right - prose.right}px right`);
			assert.ok(railRight !== null && narrow.left > railRight, "the panel must not reach under the rail");
			assert.equal(pageOverflow, 0, "the page itself must never scroll horizontally");
			// The column is centred on the window, rail or not; with the room
			// for the whole breakout, the rail moves in to 32px off the canvas.
			const centre = (prose.left + prose.right) / 2;
			assert.ok(Math.abs(centre - viewport / 2) <= 1, `column centre ${centre}, window centre ${viewport / 2}`);
			assert.equal(side, 160, "a wide window gives the canvases their whole breakout");
			assert.ok(Math.abs(narrow.left - railRight - 32) <= 1, `the rail follows the content: gap ${narrow.left - railRight}`);
			// Every table fills its panel, a narrow one too: Apple's tables
			// span their canvas rather than shrink-wrapping in a corner of it.
			assert.equal(narrow.table, narrow.content, "a narrow table fills its panel");
			// A canvas whose content is wider keeps the left edge and grows
			// to the right, as far as the content asks and no further than
			// 48px short of the window edge; only then does it scroll.
			const room = viewport - 48 - narrow.left;
			assert.ok(room > narrow.width, `the window must leave room to grow, got ${room}px`);
			const grown = (asks) => Math.max(narrow.width, Math.min(asks, room));
			assert.ok(wide.asks > narrow.width, `the wide table must ask for more than the shared edges, got ${wide.asks}px`);
			assert.equal(wide.left, narrow.left, "a grown table keeps the left edge");
			assert.ok(Math.abs(wide.width - grown(wide.asks)) <= 1, `the wide table grows to what it asks: ${wide.width}, asked ${wide.asks}, room ${room}`);
			assert.equal(wide.table, wide.content, "and fills its panel");
			// <wbr> earns the breakout: with break opportunities at _ and /,
			// the wide table fits instead of scrolling.
			assert.ok(wbrInTables > 0, "code chips in a table get <wbr>");
			assert.equal(wbrOutside, 0, "a chip in prose does not");
			assert.equal(wide.clipped, false, "the wide table fits once it can break and break out");
			// And where there is nothing to break, the panel takes all the
			// room and scrolls rather than pushing the page out.
			assert.equal(hash.left, narrow.left);
			assert.ok(Math.abs(hash.width - room) <= 1, `an unbreakable token takes all the room: ${hash.width} of ${room}`);
			assert.equal(hash.clipped, true, "and still scrolls inside its panel");
			// The code_inline override must not disturb what td_open writes.
			assert.match(align || "", /text-align:\s*right/, "authored alignment kept");
			// A fenced block takes the same canvas, wrapper and all, so the
			// copy button rides out with the code; a short block keeps the
			// shared edges rather than shrink-wrapping, a long one grows.
			const [long, short] = blocks;
			assert.equal(blocks.length, 2, "two fenced blocks in the fixture");
			assert.deepEqual([short.left, short.right], [narrow.left, narrow.right], "a short block keeps the shared edges");
			assert.ok(long.line > prose.width, `the long line must need the room, got ${long.line}px`);
			assert.ok(short.line < prose.width / 2, `the short line must not, got ${short.line}px`);
			assert.equal(long.left, narrow.left, "a long block keeps the left edge");
			assert.ok(Math.abs(long.width - grown(long.line + long.pad)) <= 1, `and grows to its line: ${long.width}, line ${long.line}, room ${room}`);
			assert.equal(long.pre.right, long.right, "the <pre> fills the wrapper");
			assert.equal(long.clipped, long.line > long.content + 1, `a line wider than the canvas scrolls, one that fits does not: line ${long.line}, room ${long.content}`);
			assert.ok(long.button.right <= long.right && long.button.right > prose.right, "the copy button sits in the widened block");
			// A figure's paragraph is a canvas too, grown for an image wider
			// than the shared edges; the image inside it is shrunk to fit and
			// never scaled up.
			assert.equal(figurePanel.left, narrow.left, "a figure's canvas keeps the left edge");
			assert.ok(Math.abs(figurePanel.width - grown(figure.natural + figurePanel.pad)) <= 1, `and grows for its image: ${figurePanel.width}, image ${figure.natural}, room ${room}`);
			assert.ok(figure.width > prose.width, `a wide figure breaks out, got ${figure.width}`);
			assert.ok(figure.left >= figurePanel.left && figure.right <= figurePanel.right, "inside its canvas");
			assert.ok(figure.width < figure.natural, "still shrunk, just less");
			// A figure wearing a link is still a figure: markdown-it renders
			// [![alt](src)](href) as <p><a><img></a></p>.
			assert.equal(linkedFigure.width, figure.width, "a linked figure breaks out the same");
			assert.equal(smallFigure.width, smallFigure.natural, "a small figure is never scaled up");
			// Both of these are as wide as the figure above, so they can only
			// pass by NOT being treated as figures — a small image would
			// satisfy the assertion whatever the rule did.
			assert.equal(inlineImage.natural, figure.natural, "the inline image must be wide enough to bite");
			assert.ok(inlineImage.right <= prose.right, "an image among words is punctuation, not a figure");
			assert.ok(pairedImage.right <= prose.right, "two images in one paragraph are not a figure either");
			// Only the wholly italic line under the figure is a caption; the
			// one with words after its emphasis stays a paragraph.
			assert.deepEqual(captions, ["Figure 1: the wide figure, captioned."]);
			// A chip in a table cell sits centred in its row, its text on the
			// cell text's baseline and centred in its box. Each assertion
			// catches one past regression: the prose chip's 1px lift pushed
			// the box ~1.5px high and the text 1px above its neighbours
			// (3.4.3), and uneven 1px/3px padding centred the box but left the
			// text high inside it (3.4.6) — a centred box alone passes that
			// one, so the baseline and the even padding are checked too. Even
			// padding stands in for "text centred in the box", which only the
			// rendered ink can show; it was measured on screenshots.
			// The centring tolerance is a device pixel, not half a CSS pixel:
			// the chip's box (20.8px) nearly fills the 21px Inter line, so its
			// centre lands wherever Chrome snaps the baseline, measured 0.75px
			// low at 1x here and 0.5px high at 1.25x. The 3.4.3 regression this
			// guards against was a 3px difference.
			assert.equal(chips.length, 2, "two chips in the fixture's last table");
			for (const { text, above, below, lift, padding } of chips) {
				assert.ok(Math.abs(above - below) <= 1.5, `${text}: centred in its cell, got ${above} above and ${below} below`);
				assert.ok(Math.abs(lift) <= 0.5, `${text}: on the cell text's baseline, got ${lift}px above it`);
				assert.equal(padding[0], padding[1], `${text}: even top and bottom padding`);
			}
		},
	},

	// <details>/<summary>: the two-tag allowlist in details.js. What is a
	// toggle and what stays escaped text, the rail's handling of a heading
	// inside a closed one, and the open set surviving a live refresh — the
	// last through the real poll, with the worker stubbed to hand back an
	// edited file.

	anchors: {
		...MD,
		path: "/anchors.md",
		source: [
			"# Anchors", "", '[Jump](#old-section)', "",
			'<a id="old-section"></a>', "## Renamed section", "",
			"<a id='single-quoted'></a>", "",
			'<a id="collision"></a>', "## Collision", "",
			'<a id="bad" onclick="alert(1)"></a>', "",
			'<a id="filled">text</a>', "",
			'inline <a id="inline"></a>', "",
			'    <a id="indented"></a>', "",
			'```html', '<a id="fenced"></a>', '```', "",
			'- **Parent**', '  - Child', '  - Last child', '', '- **Next parent**', '  - Child',
		].join("\n"),
		probe: `async () => {
			const anchors = [...document.querySelectorAll("main .legacy-anchor")];
			const groups = [...document.querySelectorAll("main > ul > li")];
			const parent = groups[0].querySelector("p").getBoundingClientRect();
			const children = groups[0].querySelectorAll("li");
			return {
				ids: anchors.map(a => a.id), heights: anchors.map(a => a.getBoundingClientRect().height),
				heading: document.querySelector("h2:last-of-type").id,
				unsafe: document.querySelectorAll("#bad, #filled, #inline, #indented, #fenced, [onclick]").length,
				literal: document.querySelector("main").textContent,
				childGap: children[0].getBoundingClientRect().top - parent.bottom,
				groupGap: groups[1].getBoundingClientRect().top - children[1].getBoundingClientRect().bottom,
			};
		}`,
		check: ({ ids, heights, heading, unsafe, literal, childGap, groupGap, errors }) => {
			assert.deepEqual(errors, []);
			assert.deepEqual(ids, ["old-section", "single-quoted", "collision"]);
			assert.deepEqual(heights, [0, 0, 0], "targets occupy no vertical space");
			assert.equal(heading, "collision-2", "generated headings avoid authored IDs");
			assert.equal(unsafe, 0, "extra attributes, content, inline tags and code stay literal");
			assert.ok(literal.includes('<a id="bad" onclick="alert(1)"></a>'));
			assert.equal(childGap, 6);
			assert.equal(groupGap, 10);
		},
	},

	// A wholly italic paragraph right below a figure or a top-level table is a
	// caption; hard-break-joined italic lines count as one. Everything else in
	// CAPTIONS.source stays body text.
	captions: {
		...MD,
		path: "/captions.md",
		source: CAPTIONS.source(),
		probe: `async () => ({
			captions: [...document.querySelectorAll("main .caption")].map((p) => p.textContent.replace(/\\s+/g, " ").trim()),
			panels: document.querySelectorAll("main .tablewrap").length,
			afterPanel: [...document.querySelectorAll("main > .tablewrap + .caption")].length,
		})`,
		check: ({ captions, panels, afterPanel, errors }) => {
			assert.deepEqual(errors, []);
			assert.deepEqual(captions, CAPTIONS.expected);
			assert.equal(panels, 8, "every table, nested or not, still gets its panel");
			assert.equal(afterPanel, 3, "and a source note ends up right below its panel");
		},
	},

	nowrap: {
		...MD,
		path: "/codes.md",
		source: NOWRAP.source(),
		probe: `async () => {
			const lines = (el) => {
				const r = document.createRange();
				r.selectNodeContents(el);
				return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
			};
			const cells = [...document.querySelectorAll("main .tablewrap th, main .tablewrap td")];
			const marked = cells.filter((c) => c.classList.contains("nowrap"));
			const od1 = marked.find((c) => c.textContent === "OD-1");
			const oneLine = marked.map(lines);
			// The counterfactual: the same table with no cell marked (one
			// marked OD-16 is enough to hold the column wide). If OD-16 fitted
			// on one line anyway, the check above proves nothing. OD-16, not
			// OD-1: unmarked, the column shrinks to its widest unbreakable
			// piece, the bold "OD-" of **OD-16**, and a regular-weight OD-1
			// fits inside that on one line.
			for (const c of marked) c.classList.remove("nowrap");
			const unmarked = lines(marked.find((c) => c.textContent === "OD-16"));
			for (const c of marked) c.classList.add("nowrap");
			return {
				marked: marked.map((c) => c.textContent),
				oneLine, unmarked,
				whiteSpace: getComputedStyle(od1).whiteSpace,
				fileName: lines(cells.find((c) => c.textContent.startsWith("evidence-"))),
			};
		}`,
		check: ({ marked, oneLine, unmarked, whiteSpace, fileName, errors }) => {
			assert.deepEqual(errors, []);
			assert.deepEqual(marked, NOWRAP.expected);
			assert.ok(oneLine.every((n) => n === 1), `every marked cell is one line: ${oneLine}`);
			assert.ok(unmarked > 1, `unmarked, OD-16 breaks at its hyphen (${unmarked} lines)`);
			assert.equal(whiteSpace, "nowrap");
			assert.ok(fileName > 1, "a file name over 16 characters still wraps");
		},
	},

	// An empty header row leaves nothing at the top of the panel: no rule,
	// and no row's height above the first body row. And an image in a cell
	// sits as far from the panel's bottom as from its top (theme.css): on the
	// baseline it sat 5px high.
	emptyHead: {
		...MD,
		path: "/grids.md",
		source: EMPTY_HEAD.source(),
		probe: `async () => {
			const panels = [...document.querySelectorAll("main .tablewrap")];
			const first = panels[0];
			return {
				tables: panels.map((p) => { const t = p.querySelector("table"); return [!!t.tHead, t.rows.length]; }),
				gap: Math.round(first.querySelector("td").getBoundingClientRect().top - first.getBoundingClientRect().top),
				pad: parseFloat(getComputedStyle(first).paddingTop),
				grid: (() => {
					const panel = panels.at(-1).getBoundingClientRect();
					const img = panels.at(-1).querySelector("img").getBoundingClientRect();
					return [Math.round(img.top - panel.top), Math.round(panel.bottom - img.bottom)];
				})(),
			};
		}`,
		check: ({ tables, gap, pad, grid, errors }) => {
			assert.deepEqual(errors, []);
			assert.deepEqual(tables, EMPTY_HEAD.expected);
			assert.equal(gap, pad, "the first body row starts right below the panel's padding");
			assert.equal(grid[0], grid[1], `an image in a cell is centred in its panel: ${grid}`);
		},
	},

	// A grid of pictures shrinks to its images and sits centred, the same
	// margin each side, 28px between images across and down, and no rule
	// between its rows. Labels centre over their images; an author's column
	// alignment still holds; a table of data is untouched.
	grid: {
		...MD,
		path: "/grids.md",
		source: GRID.source(),
		probe: `async () => {
			const main = document.querySelector("main");
			await Promise.all([...main.querySelectorAll("img")].map((i) => i.decode().catch(() => {})));
			const panels = [...main.querySelectorAll(".tablewrap")];
			const row = (panel, n) => [...panel.querySelectorAll("tbody tr")[n].querySelectorAll("img")].map((i) => i.getBoundingClientRect());
			const [first, labelled, aligned, , data] = panels;
			const p = first.getBoundingClientRect();
			const top = row(first, 0);
			const below = row(first, 1);
			const pad = (el) => parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).paddingRight);
			return {
				grids: panels.map((x) => x.querySelector("table").classList.contains("grid")),
				margins: [top[0].left - p.left, p.right - top.at(-1).right].map(Math.round),
				gaps: top.slice(1).map((r, i) => Math.round(r.left - top[i].right)),
				rowGap: Math.round(below[0].top - top[0].bottom),
				rule: getComputedStyle(first.querySelectorAll("tbody tr")[1].cells[0]).borderTopWidth,
				label: getComputedStyle(labelled.querySelector("th")).textAlign,
				aligned: getComputedStyle(aligned.querySelector("td")).textAlign,
				dataFills: Math.round(data.querySelector("table").getBoundingClientRect().width) === Math.round(data.clientWidth - pad(data)),
				dataAlign: getComputedStyle(data.querySelector("td")).textAlign,
			};
		}`,
		check: ({ grids, margins, gaps, rowGap, rule, label, aligned, dataFills, dataAlign, errors }) => {
			assert.deepEqual(errors, []);
			assert.deepEqual(grids, GRID.expected);
			assert.ok(Math.abs(margins[0] - margins[1]) <= 1 && margins[0] > 36, `centred in its panel: ${margins}`);
			assert.deepEqual(gaps, [28, 28], "28px between images across");
			assert.equal(rowGap, 28, "and down");
			assert.equal(rule, "0px", "no rule between rows of pictures");
			assert.equal(label, "center", "a label centres over its image");
			assert.equal(aligned, "right", "an author's alignment holds");
			assert.ok(dataFills && dataAlign === "left", "a table of data still fills its panel, left-aligned");
		},
	},

	// Sized <img>: the allowlist in images.js. The tag renders as the same
	// image token ![](…) does, so a table cell, a figure with its caption and
	// the remote-image guard all treat it like one, at the width written.
	// Anything outside the allowlist stays text.
	images: (() => {
		// The 300x200 PNG from tables.md.
		const png = /!\[small figure\]\((data:[^)]*)\)/.exec(fixture("tables.md"))[1];
		return {
			...MD,
			path: "/images.md",
			width: 1728,
			source: [
				"# Images", "",
				"| Before | After |", "|---|---|",
				`| <img src="${png}" alt="before" width="120"> | <img src='${png}' alt='after' width="120" /> |`, "",
				`<img src="${png}" alt="figure" title="t" width="150" height="100">`, "",
				"*Figure 1: a sized figure.*", "",
				`<img src="${png}" alt="huge" width="3000" height="2000">`, "",
				'<img src="https://example.com/t.gif" alt="tracker" width="1">', "",
				`<img src="${png}" onload="alert(1)">`, "",
				`<img src="${png}" style="width:9px">`, "",
				`<img src="${png}" srcset="https://example.com/x.png 2x">`, "",
				`<IMG SRC="${png}">`, "",
				`<img src="${png}" width="120px">`, "",
				"`<img src=\"x.png\" width=\"120\">`",
			].join("\n"),
			probe: `async () => {
				const main = document.querySelector("main");
				await Promise.all([...main.querySelectorAll("img")].map((i) => i.decode().catch(() => {})));
				const box = (alt) => {
					const r = main.querySelector('img[alt="' + alt + '"]').getBoundingClientRect();
					return [Math.round(r.width), Math.round(r.height)];
				};
				return {
					alts: [...main.querySelectorAll("img")].map((i) => i.alt),
					before: box("before"), after: box("after"), figure: box("figure"), huge: box("huge"),
					inCell: main.querySelectorAll("td img").length,
					figures: [...main.querySelectorAll("p.figure img")].map((i) => i.alt),
					caption: (main.querySelector(".caption") || {}).textContent,
					title: main.querySelector('img[alt="figure"]').title,
					tracker: [...main.querySelectorAll("a")].filter((a) => a.textContent === "tracker").map((a) => a.getAttribute("href")),
					unsafe: main.querySelectorAll("[onload], [style], [srcset]").length,
					text: main.textContent,
				};
			}`,
			check: ({ alts, before, after, figure, huge, inCell, figures, caption, title, tracker, unsafe, text, errors }) => {
				assert.deepEqual(errors, []);
				assert.deepEqual(alts, ["before", "after", "figure", "huge"], "only the allowlisted tags become images");
				assert.equal(inCell, 2, "both tags in the table row render");
				// 81, not 80: the 1px border is inside the 120 (border-box), and
				// the ratio applies to what is left.
				assert.deepEqual(before, [120, 81], "at the width written, keeping the ratio");
				assert.deepEqual(after, [120, 81], "single quotes and a self-closing slash too");
				assert.deepEqual(figures, ["figure", "huge"], "a sized image alone in its paragraph is a figure");
				assert.deepEqual(figure, [150, 100]);
				assert.equal(caption, "Figure 1: a sized figure.", "and takes the caption below it");
				assert.equal(title, "t");
				assert.ok(huge[0] < 3000, "max-width still narrows an oversized one");
				assert.equal(Math.round(huge[0] * 2 / 3), huge[1], "and the height follows, not squashed");
				assert.deepEqual(tracker, ["https://example.com/t.gif"], "a remote one becomes a link, like ![](https://…)");
				assert.equal(unsafe, 0);
				for (const literal of ['onload="alert(1)"', 'style="width:9px"', "srcset=", "<IMG SRC=", 'width="120px"', '<img src="x.png" width="120">']) {
					assert.ok(text.includes(literal), `stays text: ${literal}`);
				}
			},
		};
	})(),

	// Linked images: links.js, on top of images.js. In a table cell and as
	// a figure, the run renders as [<img …>](…) does; anything outside the
	// allowlist stays text with its image still drawn; and a remote image
	// inside a link becomes its alt text, not a link in a link.
	links: (() => {
		const png = /!\[small figure\]\((data:[^)]*)\)/.exec(fixture("tables.md"))[1];
		return {
			...MD,
			path: "/linked.md",
			source: [
				"# Links", "",
				"| Shot |", "|---|",
				`| <a href="#cell"><img src="${png}" alt="cell" width="120"></a> |`, "",
				`<a href="#fig" title="T"><img src="${png}" alt="figure" width="150"></a>`, "",
				"*Figure 1: a linked figure.*", "",
				`<a href="#x" target="_blank"><img src="${png}" alt="target" width="60"></a>`, "",
				`<a href="#x" id="clobber"><img src="${png}" alt="id" width="60"></a>`, "",
				`<a href="#x">see <img src="${png}" alt="text" width="60"></a>`, "",
				`<A HREF="#x"><img src="${png}" alt="upper" width="60"></A>`, "",
				`<a href="javascript:alert(1)"><img src="${png}" alt="js" width="60"></a>`, "",
				'<a href="https://example.com/page"><img src="https://example.com/t.png" alt="remote" width="60"></a>', "",
			].join("\n"),
			probe: `async () => {
				const main = document.querySelector("main");
				return {
					linked: [...main.querySelectorAll("a > img")].map((i) => [i.alt, i.parentElement.getAttribute("href")]),
					inCell: main.querySelectorAll("td > a > img").length,
					figures: [...main.querySelectorAll("p.figure img")].map((i) => i.alt),
					caption: (main.querySelector(".caption") || {}).textContent,
					title: main.querySelector('a[href="#fig"]').title,
					drawn: [...main.querySelectorAll("img")].map((i) => i.alt),
					remote: [...main.querySelectorAll('a[href="https://example.com/page"]')].map((a) => [a.textContent, a.querySelectorAll("img, a").length]),
					nested: main.querySelectorAll("a a").length,
					unsafe: main.querySelectorAll("[target], #clobber, [href^=javascript]").length,
					text: main.textContent,
				};
			}`,
			check: ({ linked, inCell, figures, caption, title, drawn, remote, nested, unsafe, text, errors }) => {
				assert.deepEqual(errors, []);
				assert.deepEqual(linked, [["cell", "#cell"], ["figure", "#fig"]], "only the allowlisted runs become links");
				assert.equal(inCell, 1, "in a table cell");
				assert.deepEqual(figures, ["figure"], "a linked image alone in its paragraph is a figure");
				assert.equal(caption, "Figure 1: a linked figure.", "and takes the caption below it");
				assert.equal(title, "T");
				assert.deepEqual(drawn, ["cell", "figure", "target", "id", "text", "upper", "js"], "a refused run still draws its image");
				assert.deepEqual(remote, [["remote", 0]], "a remote image in a link becomes its alt text");
				assert.equal(nested, 0, "never a link in a link");
				assert.equal(unsafe, 0);
				for (const literal of ['<a href="#x" target="_blank">', '<a href="#x" id="clobber">', '<a href="#x">see', '<A HREF="#x">', '<a href="javascript:alert(1)">', "</a>", "</A>"]) {
					assert.ok(text.includes(literal), `stays text: ${literal}`);
				}
			},
		};
	})(),

	// Nothing after a link, of any kind, and nothing around its text: what
	// markdown-it wrote inside a link is what the page shows. The browser's
	// own focus ring is the keyboard's cue; theme.css must not take it away.
	marker: {
		...MD,
		path: "/links.md",
		source: MARKER.source(),
		probe: `async () => {
			const main = document.querySelector("main.prose");
			const links = [...main.querySelectorAll("a[href]")];
			const first = links[0];
			first.focus();
			return {
				hrefs: links.map((a) => a.getAttribute("href")),
				after: [...new Set(links.map((a) => getComputedStyle(a, "::after").content))],
				labels: main.querySelectorAll(".link-label").length,
				first: first.innerHTML,
				focus: [first.matches(":focus-visible"), getComputedStyle(first).outlineStyle],
				chips: [...main.querySelectorAll("table code")].map((c) => c.innerHTML),
				overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			};
		}`,
		check: ({ hrefs, after, labels, first, focus, chips, overflow, errors }) => {
			assert.deepEqual(errors, []);
			assert.deepEqual(hrefs, [
				"sketch-cg-weekly-tv-update.md", "notes.md", "bold.md", "https://example.com/a/long/path", "https://bare.example.com/page",
				"#links", "other.md#links", "https://example.com/linked", "https://example.com/remote.png", "summary.md", "body.md",
				"reader-notes/", "sketch-cg-weekly-tv-update.md", "inventory.md", "notes/",
			], "the data: link is unwrapped; a remote image demoted to a link stays one");
			assert.deepEqual(after, ["none"], "no link draws anything after itself");
			assert.equal(labels, 0, "no link text is rewrapped");
			assert.equal(first, "<code>sketch-cg-weekly-tv-update.md</code>", "a link holds what markdown-it wrote");
			assert.deepEqual(focus, [true, "auto"], "a focused link keeps the browser's focus ring");
			assert.deepEqual(chips, ["reader-notes/", "sketch-cg-weekly-tv-update.md", "inventory.md", "notes/", "a/<wbr>b/", "snake_<wbr>case_"], "no <wbr> after a separator that ends the chip");
			assert.equal(overflow, 0);
		},
	},
	// A notebook's Markdown cells and its outputs alike: nothing after a link,
	// nothing around its text.
	markerNotebook: {
		...NB,
		path: "/links.ipynb",
		source: MARKER.notebook(),
		probe: `async () => {
			const cell = document.querySelector("main .md a[href]");
			const out = document.querySelector("main .output a[href]");
			return {
				cell: cell.innerHTML,
				output: out.innerHTML,
				after: [getComputedStyle(cell, "::after").content, getComputedStyle(out, "::after").content],
			};
		}`,
		check: ({ cell, output, after, errors }) => {
			assert.deepEqual(errors, []);
			assert.equal(cell, "cell link");
			assert.equal(output, "out", "an output's link is left as it came");
			assert.deepEqual(after, ["none", "none"]);
		},
	},
	// <br>: the allowlist in breaks.js. The tag renders as the hard break a
	// trailing backslash makes, so two lines fit in one table cell; any other
	// spelling stays text.
	breaks: {
		...MD,
		path: "/breaks.md",
		source: [
			"| Where | Note |", "|---|---|",
			"| **One:** first<br>**Two:** second | a<br/>b<br />c |", "",
			"Prose<br>breaks too.", "",
			'<BR> and <br class="x"> stay text.', "",
			"`<br>`",
		].join("\n"),
		probe: `async () => {
			const main = document.querySelector("main");
			return {
				cells: [...main.querySelectorAll("td")].map((td) => td.querySelectorAll("br").length),
				prose: main.querySelector("p").querySelectorAll("br").length,
				count: main.querySelectorAll("br").length,
				code: main.querySelector("p > code").textContent,
				text: main.textContent,
			};
		}`,
		check: ({ cells, prose, count, code, text, errors }) => {
			assert.deepEqual(errors, []);
			assert.deepEqual(cells, [1, 2], "each <br> in a cell is a line break");
			assert.equal(prose, 1, "and in a paragraph");
			assert.equal(count, 4, "nothing else becomes one");
			for (const literal of ["<BR>", '<br class="x">']) {
				assert.ok(text.includes(literal), `stays text: ${literal}`);
			}
			assert.equal(code, "<br>", "a code span keeps it as text");
			assert.ok(!text.includes("first<br>"), "an allowlisted tag is not shown as text");
		},
	},

	// HTML comments: comments.js. One renders as nothing, on its own lines or
	// inline; in code it stays text, and one that never closes stays text.
	comments: {
		...MD,
		path: "/comments.md",
		source: [
			"<!-- confluence-page-id: 5702746886 -->",
			"# Comments", "",
			"Before <!-- inline --> after.",
			"<!--", "# not a heading", "-->",
			"Next paragraph.", "",
			"- one", "  <!-- in an item -->", "- two", "",
			"| A | B |", "|---|---|", "| x <!-- in a cell --> | y |", "",
			"```", "<!-- in a fence -->", "```", "",
			"`<!-- in a span -->`", "",
			"<!-- never closed",
		].join("\n"),
		probe: `async () => {
			const main = document.querySelector("main");
			return {
				title: document.title,
				headings: [...main.querySelectorAll("h1, h2")].map((h) => h.textContent),
				paragraphs: [...main.querySelectorAll(":scope > p")].map((p) => p.textContent),
				items: [...main.querySelectorAll("li")].map((li) => li.textContent.trim()),
				cell: main.querySelector("td").textContent,
				fence: main.querySelector("pre code").textContent,
				span: main.querySelector("p > code").textContent,
				text: main.textContent,
			};
		}`,
		check: ({ title, headings, paragraphs, items, cell, fence, span, text, errors }) => {
			assert.deepEqual(errors, []);
			assert.equal(title, "Comments", "a comment directly above the title leaves it the heading");
			assert.deepEqual(headings, ["Comments"], "a heading inside a comment is hidden with it");
			assert.equal(paragraphs[0], "Before  after.", "an inline comment renders as nothing");
			assert.equal(paragraphs[1], "Next paragraph.", "a comment ends the paragraph above it, as in CommonMark");
			assert.deepEqual(items, ["one", "two"], "a comment in a list item leaves the list whole");
			assert.equal(cell, "x ", "and in a table cell");
			assert.equal(fence, "<!-- in a fence -->\n", "a fence keeps it as text");
			assert.equal(span, "<!-- in a span -->", "a code span keeps it as text");
			assert.equal(paragraphs.at(-1), "<!-- never closed", "a comment that never closes stays text");
			for (const hidden of ["confluence-page-id", "inline", "not a heading", "in an item", "in a cell"]) {
				assert.ok(!text.includes(hidden), `hidden: ${hidden}`);
			}
		},
	},

	// Email mode hides a comment too, so it never reaches the copied email.
	emailComments: {
		...EMAIL,
		path: "/comments.email.md",
		source: ["<!-- confluence-page-id: 5702746886 -->", "Hi team,", "", "Numbers <!-- check with Anish --> are in."].join("\n"),
		probe: `async () => {
			document.querySelector(".copy-all").click();
			for (let i = 0; i < 100 && !window.__clip.length; i++) await new Promise((r) => setTimeout(r, 20));
			return { preview: document.querySelector("main").textContent, all: window.__clip[0] };
		}`,
		check: ({ preview, all, errors }) => {
			assert.deepEqual(errors, []);
			for (const text of [preview, all["text/html"], all["text/plain"]]) {
				assert.ok(!text.includes("confluence") && !text.includes("Anish"), `hidden: ${text}`);
				assert.ok(text.includes("Hi team,") && text.includes("are in."));
			}
		},
	},

	// Front matter: frontmatter.js. The shape md2conf files have, a block
	// then the page-id comment then the title, renders as a closed toggle
	// holding the text, with no heading, outline entry or rule of its own. A
	// later `---` is still a rule and a setext underline.
	frontMatter: {
		...MD,
		path: "/frontmatter.md",
		source: [
			"---", "properties:", "  content-appearance-published: full-width", "# not a heading", "---",
			"<!-- confluence-page-id: 5705138177 -->",
			"# Title", "",
			"## One", "", "## Two", "", "## Three", "",
			"---", "", "Setext", "---",
		].join("\n"),
		probe: `async () => {
			const main = document.querySelector("main");
			const fm = main.querySelectorAll("details.frontmatter");
			return {
				title: document.title,
				first: main.firstElementChild.tagName,
				count: fm.length,
				open: fm[0].open,
				summary: fm[0].querySelector("summary").textContent,
				code: fm[0].querySelector("pre code").textContent,
				lang: fm[0].querySelector("pre code").className,
				headings: [...main.querySelectorAll("h1, h2, h3")].map((h) => h.textContent),
				toc: [...document.querySelectorAll(".toc a")].map((a) => a.textContent),
				rules: main.querySelectorAll("hr").length,
				text: main.textContent,
			};
		}`,
		check: ({ title, first, count, open, summary, code, lang, headings, toc, rules, text, errors }) => {
			assert.deepEqual(errors, []);
			assert.equal(title, "Title", "the heading below the front matter names the document");
			assert.equal(first, "DETAILS", "nothing renders above the front matter");
			assert.equal(count, 1);
			assert.equal(open, false, "closed until opened");
			assert.equal(summary, "Front matter");
			assert.equal(code, "properties:\n  content-appearance-published: full-width\n# not a heading\n", "its text, verbatim");
			assert.match(lang, /language-yaml/);
			assert.deepEqual(headings, ["Title", "One", "Two", "Three", "Setext"], "no heading from the front matter");
			assert.deepEqual(toc, ["Overview", "One", "Two", "Three", "Setext"], "nor an outline entry");
			assert.equal(rules, 1, "only the later rule is a rule");
			assert.ok(!text.includes("confluence-page-id"), "the comment after it stays hidden");
		},
	},

	// Email mode renders front matter as nothing, so it is never copied.
	emailFrontMatter: {
		...EMAIL,
		path: "/frontmatter.email.md",
		source: ["---", "to: team", "---", "Hi team,", "", "Numbers are in."].join("\n"),
		probe: `async () => {
			document.querySelector(".copy-all").click();
			for (let i = 0; i < 100 && !window.__clip.length; i++) await new Promise((r) => setTimeout(r, 20));
			return { preview: document.querySelector("main").textContent, all: window.__clip[0] };
		}`,
		check: ({ preview, all, errors }) => {
			assert.deepEqual(errors, []);
			for (const text of [preview, all["text/html"], all["text/plain"]]) {
				assert.ok(!text.includes("to: team") && !text.includes("---"), `hidden: ${text}`);
				assert.ok(text.includes("Hi team,") && text.includes("are in."));
			}
		},
	},

	// The image viewer (image-viewer.js): an image shown smaller than its
	// file opens in a modal dialog at its own size, capped by the window, and
	// one at its own size or inside a link does not open at all.
	viewer: (() => {
		const png = /!\[small figure\]\((data:[^)]*)\)/.exec(fixture("tables.md"))[1];
		// 2000x3000 with no pixels to decode: taller than the window will fit.
		const big = "data:image/svg+xml;base64," +
			Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="3000"/>').toString("base64");
		return {
			...MD,
			path: "/viewer.md",
			// Each image alone, in its cell or paragraph: no strip (viewerGallery).
			source: [
				"# Viewer", "",
				"| Small |", "|---|",
				`| <img src="${png}" alt="small" width="120"> |`, "",
				`<img src="${big}" alt="big" width="120">`, "",
				`![natural](${png})`, "",
				`[<img src="${png}" alt="linked" width="120">](#top)`,
			].join("\n"),
			probe: `async () => {
				const main = document.querySelector("main");
				await Promise.all([...main.querySelectorAll("img")].map((i) => i.decode().catch(() => {})));
				const img = (alt) => main.querySelector('img[alt="' + alt + '"]');
				const cursor = (alt) => {
					img(alt).dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
					return getComputedStyle(img(alt)).cursor;
				};
				const cursors = ["small", "big", "natural", "linked"].map(cursor);
				const atRest = document.querySelectorAll("dialog").length;
				img("natural").click();
				img("linked").click();
				img("small").dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
				const unopened = document.querySelectorAll("dialog[open]").length;
				const show = async (alt) => {
					img(alt).click();
					const dialog = document.querySelector("dialog.viewer");
					const view = dialog.querySelector("img");
					await view.decode().catch(() => {});
					return { dialog, view };
				};
				const { dialog, view } = await show("small");
				const small = {
					modal: dialog.matches(":modal"),
					sameSrc: view.src === img("small").src,
					alt: view.alt,
					size: [view.clientWidth, view.clientHeight],
					inMain: main.contains(dialog),
				};
				dialog.click();
				const closedByClick = !dialog.open;
				await show("big");
				const big = [view.clientWidth, view.clientHeight, view.offsetHeight, innerHeight];
				dialog.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
				const closedByWheel = !dialog.open;
				await show("small");
				dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
				const closedByKey = !dialog.open;
				return { cursors, atRest, unopened, small, closedByClick, big, closedByWheel, closedByKey,
					dialogs: document.querySelectorAll("dialog").length };
			}`,
			check: ({ cursors, atRest, unopened, small, closedByClick, big, closedByWheel, closedByKey, dialogs, errors }) => {
				assert.deepEqual(errors, []);
				assert.deepEqual(cursors, ["zoom-in", "zoom-in", "auto", "pointer"], "only a shrunken, unlinked image offers itself");
				assert.equal(atRest, 0, "no dialog in the page until one is asked for");
				assert.equal(unopened, 0, "an image at its own size, inside a link, or clicked with a modifier does not open");
				assert.deepEqual(small, { modal: true, sameSrc: true, alt: "small", size: [300, 200], inMain: false },
					"a modal dialog outside <main>, the same image at its natural 300x200");
				assert.ok(closedByClick, "a click closes it");
				const [width, height, outer, window] = big;
				// The border is inside the cap (border-box), so the box is what fits.
				assert.equal(outer, window - 48, "too tall for the window: 24px clear top and bottom");
				assert.equal(Math.round(height * 2 / 3), width, "and the width follows, ratio kept");
				assert.ok(closedByWheel, "the wheel closes it");
				assert.ok(closedByKey, "any key closes it");
				assert.equal(dialogs, 1, "one dialog, reused");
			},
		};
	})(),

	// The viewer among other images: ←/→ step through the clicked image's
	// table, row by row, or its paragraph, wrapping at the ends, under a strip
	// of thumbnails that a click moves through and that scrolls when it is
	// too long for the image.
	viewerGallery: (() => {
		// Pixel-free SVGs, each its own src, so the image shown says which.
		const svg = (name, w = 600, h = 400) => "data:image/svg+xml;base64," +
			Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><title>${name}</title></svg>`).toString("base64");
		const img = (name, w, h) => `<img src="${svg(name, w, h)}" alt="${name}" width="120">`;
		const many = Array.from({ length: 30 }, (_, i) => img(`m${i}`)).join(" ");
		return {
			...MD,
			path: "/gallery.md",
			source: [
				"# Gallery", "",
				"| | |", "|---|---|",
				`| ${img("a")} | ${img("b")} |`,
				`| ${img("c")} | [${img("linked")}](#top) |`, "",
				`${img("tall1", 2000, 3000)} ${img("tall2", 2000, 3000)}`, "",
				`${img("tiny1", 150, 100)} ${img("tiny2", 150, 100)}`, "",
				`${img("wide", 900, 400)} ${img("narrow", 300, 600)} ${img("mid", 500, 300)}`, "",
				img("lone"), "",
				many,
			].join("\n"),
			probe: `async () => {
				const main = document.querySelector("main");
				await Promise.all([...main.querySelectorAll("img")].map((i) => i.decode().catch(() => {})));
				const pageImg = (alt) => main.querySelector('img[alt="' + alt + '"]');
				const dialog = () => document.querySelector("dialog.viewer");
				const view = () => dialog().querySelector(":scope > img");
				const strip = () => dialog().querySelector(".strip");
				const press = (key) => dialog().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
				const state = () => ({
					open: dialog().open,
					shown: view().alt,
					on: [...strip().querySelectorAll("img.on")].map((t) => t.alt),
					from: view().getAnimations().map((a) => a.effect.getKeyframes()[0].transform ?? "fade")[0] ?? null,
				});
				const steps = [];
				pageImg("a").click();
				const thumbs = [...strip().children].map((t) => t.alt);
				const sameSrcs = [...strip().children].every((t) => t.src === pageImg(t.alt).src);
				steps.push(state());
				const consumed = !press("ArrowRight");
				steps.push(state());
				press("ArrowRight"); steps.push(state());
				press("ArrowRight"); steps.push(state());
				press("ArrowLeft"); steps.push(state());
				strip().children[1].click(); steps.push(state());
				strip().click();
				const closedByGap = !dialog().open;

				// The arrows: centred 60px in from each side of the window, on
				// the line through the image's centre, which is the centre of
				// the room above the strip; shown near the pointer, one at a
				// time; the circle alone takes the click, which steps as the
				// keys do.
				const loaded = () => new Promise((r) => view().complete ? r() : view().addEventListener("load", r, { once: true }));
				pageImg("a").click();
				await loaded();
				const [prev, next] = [...dialog().querySelectorAll(".arrow")];
				// The last step's slide may still be running, and moves only
				// the image: the arrows stay where theme.css put them.
				view().getAnimations().forEach((a) => a.finish());
				const v = view().getBoundingClientRect();
				// The window less the page's scrollbar, which the dialog stops at.
				const { clientWidth: width, clientHeight: height } = document.documentElement;
				const line = height / 2 - 33;
				const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
				const [nx, ny] = centre(next);
				const [px, py] = centre(prev);
				const placed = {
					prev: [Math.round(px), Math.round(py - line)],
					next: [Math.round(width - nx), Math.round(ny - line)],
					image: [Math.round(v.left + v.width / 2 - width / 2), Math.round(v.top + v.height / 2 - line)],
				};
				const move = (x, y) => dialog().dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));
				const shown = () => [prev, next].filter((a) => a.classList.contains("near")).map((a) => a.classList[1]);
				const proximity = [];
				move(nx, ny); proximity.push(shown());
				move(innerWidth - 1, ny); proximity.push(shown());
				move(nx, ny - 151); proximity.push(shown());
				move(nx - 100, ny); proximity.push(shown());
				move(v.left + v.width / 2, ny); proximity.push(shown());
				move(px, py); dialog().dispatchEvent(new PointerEvent("pointerleave")); proximity.push(shown());
				const hit = {
					centre: document.elementFromPoint(nx, ny) === next,
					corner: document.elementFromPoint(nx + 28, ny + 28) === next,
				};
				const arrowSteps = [];
				next.click(); arrowSteps.push(state());
				prev.click(); arrowSteps.push(state());
				prev.click(); arrowSteps.push(state());
				const arrowOpen = dialog().open;
				dialog().close();

				pageImg("tiny1").click();
				await loaded();
				const small = getComputedStyle(next).display;
				dialog().close();

				// Images of three sizes: the arrows and the strip hold still,
				// so a pointer resting on → clicks through them all; the
				// dialog is the whole window, so a click in its corner closes.
				pageImg("wide").click();
				const still = [];
				for (let i = 0; i < 3; i++) {
					await loaded();
					view().getAnimations().forEach((a) => a.finish());
					still.push({
						width: view().getBoundingClientRect().width,
						next: centre(next).map(Math.round),
						strip: Math.round(strip().getBoundingClientRect().top),
					});
					next.click();
				}
				const corner = document.elementFromPoint(4, 4) === dialog();
				dialog().close();

				pageImg("tall1").click();
				const tall = [view().offsetHeight, strip().offsetHeight, innerHeight];
				dialog().close();

				pageImg("lone").click();
				const lone = { strip: strip().hidden, gallery: dialog().classList.contains("gallery"), arrow: getComputedStyle(dialog().querySelector(".arrow")).display };
				press("ArrowRight");
				const loneStays = { open: dialog().open, shown: view().alt };
				press("x");
				const loneClosed = !dialog().open;

				pageImg("m15").click();
				const s = strip().getBoundingClientRect();
				const t = strip().querySelector("img.on").getBoundingClientRect();
				const wide = {
					scrolls: strip().scrollWidth > strip().clientWidth,
					centred: Math.abs(t.left + t.width / 2 - (s.left + s.width / 2)) <= 1,
					focus: document.activeElement === dialog(),
				};
				const before = strip().scrollLeft;
				strip().dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
				const wheel = { open: dialog().open, moved: strip().scrollLeft - before };
				view().dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true }));
				wheel.closedOverImage = !dialog().open;
				return { thumbs, sameSrcs, steps, consumed, closedByGap, placed, proximity, hit, arrowSteps, arrowOpen, small, still, corner, tall, lone, loneStays, loneClosed, wide, wheel };
			}`,
			check: ({ thumbs, sameSrcs, steps, consumed, closedByGap, placed, proximity, hit, arrowSteps, arrowOpen, small, still, corner, tall, lone, loneStays, loneClosed, wide, wheel, errors }) => {
				assert.deepEqual(errors, []);
				assert.deepEqual(thumbs, ["a", "b", "c"], "the table's images, row by row, less the one that is a link");
				assert.ok(sameSrcs, "each thumbnail is the page's own src");
				assert.deepEqual(steps, [
					{ open: true, shown: "a", on: ["a"], from: null },
					{ open: true, shown: "b", on: ["b"], from: "translateX(40px)" },
					{ open: true, shown: "c", on: ["c"], from: "translateX(40px)" },
					{ open: true, shown: "a", on: ["a"], from: "fade" },
					{ open: true, shown: "c", on: ["c"], from: "fade" },
					{ open: true, shown: "b", on: ["b"], from: "translateX(-40px)" },
				], "→ slides in from the right, a wrap fades, a thumbnail slides from its side");
				assert.ok(consumed, "an arrow is the viewer's, not the page's");
				assert.ok(closedByGap, "a click between thumbnails closes, like one anywhere else");
				assert.deepEqual(placed, { prev: [60, 0], next: [60, 0], image: [0, 0] },
					"each arrow 60px in from the window's side, on the line through the centred image");
				assert.deepEqual(proximity, [["next"], ["next"], [], ["next"], [], []],
					"shown on it, out to the window's edge and 100px in; not 151px above, midway, or once the pointer leaves");
				assert.deepEqual(hit, { centre: true, corner: false }, "the circle takes the click, not its square's corner");
				assert.deepEqual(arrowSteps, [
					{ open: true, shown: "b", on: ["b"], from: "translateX(40px)" },
					{ open: true, shown: "a", on: ["a"], from: "translateX(-40px)" },
					{ open: true, shown: "c", on: ["c"], from: "fade" },
				], "an arrow steps as its key does, wrap and all");
				assert.ok(arrowOpen, "and leaves the image open");
				assert.equal(small, "block", "a small image keeps its arrows, out at the window's sides");
				assert.equal(new Set(still.map((s) => s.width)).size, 3, `three widths, got ${still.map((s) => s.width)}`);
				assert.deepEqual(still.map((s) => s.next), Array(3).fill(still[0].next), "→ holds still from one size to the next");
				assert.deepEqual(still.map((s) => s.strip), Array(3).fill(still[0].strip), "and so does the strip");
				assert.ok(corner, "the dialog fills the window, so a click in its corner is the dialog's, and closes");
				const [image, bar, window] = tall;
				assert.equal(bar, 56, "the strip: 48px thumbnails and 4px padding twice");
				assert.equal(image + 10 + bar, window - 48, "a tall image gives up the strip and its 10px gap, and keeps 24px clear");
				assert.deepEqual(lone, { strip: true, gallery: false, arrow: "none" }, "an image alone has no strip and no arrows");
				assert.deepEqual(loneStays, { open: true, shown: "lone" }, "and an arrow leaves it where it is");
				assert.ok(loneClosed, "any other key still closes");
				assert.deepEqual(wide, { scrolls: true, centred: true, focus: true },
					"thirty scroll, the current one centred, and focus stays on the dialog, not the scroller");
				assert.ok(wheel.open && wheel.moved > 0, "the wheel over a strip that scrolls scrolls it");
				assert.ok(wheel.closedOverImage, "and over the image still closes");
			},
		};
	})(),

	// The lane where the margin runs short (theme.css). At 1300 the canvases
	// have given up nearly all their breakout so the text can stay centred;
	// at 1200 they have none left, and the text moves right only as far as
	// keeps it 32px off the rail.
	laneNarrow: lane(1300, ({ viewport, rail, prose, block, overflow, errors }) => {
		assert.deepEqual(errors, []);
		assert.equal(overflow, 0);
		const centre = (prose.left + prose.right) / 2;
		assert.ok(Math.abs(centre - viewport / 2) <= 1, `column centre ${centre}, window centre ${viewport / 2}`);
		const side = prose.left - block.left;
		assert.ok(side > 0 && side < 20, `a sliver of breakout is left, got ${side}px`);
		assert.ok(Math.abs(block.left - rail.right - 32) <= 1, `canvas 32px off the rail, got ${block.left - rail.right}`);
		assert.equal(rail.left, 24, "the rail stays at the window edge until the breakout is whole");
	}),
	laneNudge: lane(1200, ({ viewport, rail, prose, block, overflow, errors }) => {
		assert.deepEqual(errors, []);
		assert.equal(overflow, 0);
		assert.ok(Math.abs(block.left - prose.left) <= 0.5, "no breakout left to give");
		assert.ok(Math.abs(prose.left - rail.right - 32) <= 1, `text 32px off the rail, got ${prose.left - rail.right}`);
		assert.ok((prose.left + prose.right) / 2 > viewport / 2 + 1, "only here does the text leave the centre");
	}),
	// Growth on both branches of --grow, the rail's and the centred
	// column's: at 1490 the window's margin is what stops it, at 2560 the
	// 360px cap.
	growNoRail: grow(1490, false, ({ viewport, narrow }) => viewport - 48),
	growCap: grow(2560, false, ({ narrow }) => narrow.right + 360),
	growCapRail: grow(2560, true, ({ narrow }) => narrow.right + 360),

	viewport: {
		...MD,
		path: "/viewport.md",
		width: 1100,
		source: '# Layout\n\n## One\n\n' + 'longtoken'.repeat(100) + '\n\n## Two\n\n| Key | Value |\n| --- | --- |\n| item | ' + 'x'.repeat(300) + ' |\n\n## Three\n',
		probe: `async () => {
			// The panel is the scroll box; the table inside it may be wider.
			const t = document.querySelector(".tablewrap");
			return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
				right: t.getBoundingClientRect().right, viewport: document.documentElement.clientWidth,
				scrolls: t.scrollWidth > t.clientWidth };
		}`,
		check: ({ overflow, right, viewport, scrolls, errors }) => {
			assert.deepEqual(errors, []);
			assert.equal(overflow, 0, "long prose and tables do not widen the page at the rail cutoff");
			assert.ok(right <= viewport);
			assert.ok(scrolls, "unbreakable table content scrolls inside its panel");
		},
	},

	details: {
		...MD,
		path: "/details.md",
		source: fixture("details.md"),
		probe: `async () => {
			const main = document.querySelector("main.prose");
			const all = () => [...document.querySelectorAll("main details")].map((d) => ({
				summary: (d.querySelector(":scope > summary") || {}).textContent,
				open: d.open,
				depth: (() => { let n = 0; for (let e = d.parentElement; e; e = e.parentElement) if (e.tagName === "DETAILS") n++; return n; })(),
			}));
			const before = all();
			const text = main.textContent;
			const chip = !!main.querySelector("details > summary > code");
			const toc = [...document.querySelectorAll(".toc a")].map((a) => a.dataset.href);
			const hidden = document.getElementById("inside-a-toggle");
			const outer = hidden.closest("details");
			// Laid out, but not visible: what the spy's skip is keyed on. The
			// spy itself runs on requestAnimationFrame, which never fires in
			// this headless page, so the scroll assertion is in e2e.mjs.
			const hiddenVisible = hidden.checkVisibility();
			const hiddenBox = hidden.getBoundingClientRect().height > 0;
			// A rail link into a closed toggle: Chrome opens it on the jump.
			document.querySelector('.toc a[data-href="#inside-a-toggle"]').click();
			await new Promise((r) => setTimeout(r, 50));
			const openedByJump = outer.open;
			// The copy button on a fence inside a (closed) toggle.
			main.querySelector("details .codeblock button.copy").click();
			for (let i = 0; i < 100 && !window.__clip.length; i++) await new Promise((r) => setTimeout(r, 20));
			// Live refresh: the reader opened the first, shut the authored-open
			// one; the file then gains a paragraph and a new authored-open toggle.
			main.querySelector("details").open = true;
			main.querySelectorAll("details")[1].open = false;
			const edited = ${JSON.stringify(fixture("details.md"))}.replace("Intro.", "Intro, edited.\\n\\n<details open><summary>New</summary>\\n\\nnew\\n\\n</details>");
			window.chrome.runtime.sendMessage = () => Promise.resolve(edited);
			for (let i = 0; i < 100 && document.querySelector("main.prose") === main; i++) await new Promise((r) => setTimeout(r, 20));
			const refreshed = document.querySelector("main.prose") !== main;
			return { before, text, chip, toc, hiddenVisible, hiddenBox, openedByJump, copied: window.__clip[0], refreshed, after: all() };
		}`,
		check: ({ before, text, chip, toc, hiddenVisible, hiddenBox, openedByJump, copied, refreshed, after, errors }) => {
			assert.deepEqual(errors, []);
			assert.deepEqual(
				before.map((d) => [d.summary, d.open, d.depth]),
				[
					["Large query (read-only)", false, 0],
					["Already open", true, 0],
					["Log", false, 0],
					["Log", false, 0],
					["Fence quoting the closer", false, 0],
					["Nested outer", false, 0],
					["Nested inner", false, 1],
					["Listed inner", false, 1],
				],
				"eight toggles, in order, nested where written, open where authored",
			);
			assert.ok(chip, "summary text is inline markdown");
			// Everything outside the allowlist is text, not markup.
			assert.match(text, /Not a toggle: <details>inline<\/details>/, "a tag mid-paragraph stays text");
			assert.match(text, /<details class="x">\n<summary>Attribute<\/summary>/, "an attribute other than open stays text");
			assert.match(text, /kept as text\n<\/details>/, "and so does its closer");
			assert.match(text, /<summary>Stray summary<\/summary>/, "a summary outside a toggle stays text");
			assert.match(text, /<details>\n<summary>Never closed<\/summary>/, "an opener with no closer stays text");
			assert.match(text, /listed text/, "a toggle behind a list marker is parsed");
			assert.ok(!text.includes("<summary>Listed inner"), "and its opener is not text");
			assert.ok(!text.includes("<details><summary>"), "no toggle marker survives as text");
			// The fence inside a toggle rendered as a fence — and its literal
			// closer did not end the toggle early.
			assert.equal(copied.text, "SELECT 1", "the copy button inside a toggle copies its fence");
			// A heading inside a closed toggle is in the rail. It has a box —
			// which is why the spy cannot go by the rect — and is not visible,
			// which is what the spy goes by instead.
			assert.deepEqual(toc, ["#", "#before", "#after", "#inside-a-toggle"]);
			assert.equal(hiddenBox, true, "closed toggle content is still laid out");
			assert.equal(hiddenVisible, false, "and checkVisibility() says it is unseen");
			assert.equal(openedByJump, true, "a rail link into a closed toggle opens it");
			// The refresh: reader state carried by summary text and occurrence,
			// the new toggle keeps what the file says.
			assert.equal(refreshed, true, "the poll re-rendered the edited file");
			assert.deepEqual(
				after.map((d) => [d.summary, d.open]),
				[
					["New", true],
					["Large query (read-only)", true],
					["Already open", false],
					["Log", false],
					["Log", false],
					["Fence quoting the closer", false],
					["Nested outer", true],
					["Nested inner", false],
					["Listed inner", false],
				],
				"open state survives a refresh; a toggle the edit added keeps its authored state",
			);
		},
	},

	// ```mermaid fences drawn by mermaid.js. mermaid.min.js is listed as a
	// script here because the stub stands in for worker.js, which injects it;
	// the real injection, and that a page without a diagram never gets the
	// bundle, are in e2e.mjs. The `markdown` case checks the page never asks.
	mermaid: {
		...MD,
		scripts: [...MD.scripts.slice(0, -1), "mermaid.min.js", "content.js"],
		path: "/diagrams.md",
		source: fixture("diagrams.md"),
		sendMessage: `(m) => Promise.resolve(m && m.type === "mermaid" ? !!window.mermaid : null)`,
		probe: `async () => {
			const until = async (f) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 25)); return f(); };
			const main = document.querySelector("main.prose");
			const fences = (root) => [...root.querySelectorAll("pre > code.language-mermaid")];
			const drawing = (code) => code.parentElement.parentElement.querySelector(":scope > svg");
			await until(() => main.querySelectorAll(".diagram > svg, .diagram-error").length >= 12);
			// The page text's face as Chrome reports it, not --sans as written:
			// on a Mac Chrome reports BlinkMacSystemFont as system-ui, for the
			// page text and the labels alike.
			const sans = getComputedStyle(main).fontFamily.replace(/["\\s]/g, "");
			const panels = fences(main).map((code) => {
				const pre = code.parentElement;
				const svg = drawing(code);
				const texts = svg ? [...svg.querySelectorAll("text")] : [];
				return {
					panel: pre.parentElement.className,
					id: svg ? svg.id : null,
					preShown: getComputedStyle(pre).display !== "none",
					error: (pre.parentElement.querySelector(":scope > .diagram-error") || {}).textContent || null,
					text: texts.map((t) => t.textContent).join(" | "),
					faces: [...new Set(texts.map((t) => getComputedStyle(t).fontFamily.replace(/["\\s]/g, "")))],
					beacons: svg ? svg.outerHTML.match(/beacon-[a-z]+/g) || [] : [],
					ownIds: svg ? [...svg.querySelectorAll("[id]")].every((e) => e.id.includes(svg.id)) : null,
					// Mermaid's max-width, moved to the width by mermaid.js.
					size: svg ? [svg.style.width, svg.style.maxWidth] : null,
					drawn: svg ? svg.getBoundingClientRect().width : null,
					room: (() => {
						const panel = pre.parentElement;
						const cs = getComputedStyle(panel);
						return panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
					})(),
					right: pre.parentElement.getBoundingClientRect().right,
				};
			});
			const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
			const box = document.body.querySelector(":scope > div[aria-hidden]");
			const csp = (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content;
			// The backstop on its own: a url() in markup added after the CSP.
			const control = document.createElement("div");
			control.style.cssText = "width:10px;height:10px;background-image:url(/beacon-control.png)";
			main.append(control);
			await document.fonts.ready;
			const inter = [...document.fonts].filter((f) => f.family.replace(/"/g, "") === "Inter").map((f) => f.status);
			// The call mermaid.js makes before measuring, with the page's own
			// stack: it must name the bundled Inter, or a machine without
			// Inter installed would measure labels in the fallback.
			const stack = getComputedStyle(document.documentElement).getPropertyValue("--sans").trim();
			const preload = await document.fonts.load("16px " + stack, "x").then((faces) => faces.map((f) => f.family.replace(/"/g, "")), (e) => "rejected: " + e);
			main.querySelector(".diagram button.copy").click();
			await until(() => window.__clip.length);
			// Live refresh with the first diagram edited: what the page shows
			// in the task that swaps it in, and once the drawing is redone.
			const before = panels.map((p) => p.id);
			let swapped = null;
			new MutationObserver((records, observer) => {
				const next = document.querySelector("main.prose");
				if (next === main) return;
				observer.disconnect();
				swapped = fences(next).map((code) => (drawing(code) || {}).id || null);
			}).observe(document.body, { childList: true });
			const edited = ${JSON.stringify(fixture("diagrams.md"))}.replace("Adobe sign-in, encrypted", "Adobe sign-in, edited");
			window.chrome.runtime.sendMessage = (m) => Promise.resolve(m.type === "read" ? edited : true);
			await until(() => document.querySelector("main.prose") !== main);
			const next = document.querySelector("main.prose");
			await until(() => (drawing(fences(next)[0]) || {}).id !== before[0]);
			const after = fences(next).map((code) => (drawing(code) || {}).id || null);
			return {
				panels, sans, viewport: document.documentElement.clientWidth, dupes: ids.filter((id, i) => ids.indexOf(id) !== i), boxEmpty: box ? box.childElementCount === 0 : null,
				csp, inter, preload, copied: window.__clip[0], before, swapped, after, editedText: drawing(fences(next)[0]).textContent,
			};
		}`,
		check: ({ panels, sans, viewport, dupes, boxEmpty, csp, inter, preload, copied, before, swapped, after, editedText, messages, errors }) => {
			assert.deepEqual(errors, []);
			assert.ok(messages.includes("mermaid"), "a page with a diagram asks for Mermaid");
			assert.equal(panels.length, 12, "twelve fences");
			const [seq, twiceA, twiceB, broken, directive, frontMatter, listed, far, farEscaped, farIcon, farRelative, mentioned] = panels;
			for (const p of [seq, twiceA, twiceB, directive, frontMatter, listed, mentioned]) {
				assert.equal(p.panel, "codeblock diagram", `drawn in the fence's own panel: ${JSON.stringify(p)}`);
				assert.ok(p.id && !p.preShown && !p.error, "the drawing replaces the code, which stays hidden");
				assert.ok(p.ownIds, "every id in a drawing holds the drawing's own");
				assert.deepEqual(p.faces, [sans], "labels are set in the page's face, sequence diagrams too");
				// A drawing asks its panel for its own width (theme.css, the
				// breakout), and is no wider than the panel gives it.
				assert.match(p.size[0], /^\d+(\.\d+)?px$/, `the drawing's width is Mermaid's, in px: ${p.size}`);
				assert.equal(p.size[1], "100%", "and it shrinks with the panel");
				assert.ok(Math.abs(p.drawn - Math.min(parseFloat(p.size[0]), p.room)) <= 1, `drawn ${p.drawn}, asked ${p.size[0]}, room ${p.room}`);
				assert.ok(p.right <= viewport - 48, `a panel stays 48px off the window edge, got ${p.right}`);
			}
			assert.match(seq.text, /Adobe skips its sign-in; M3's form comes already filled in/, "#59; draws a semicolon");
			assert.notEqual(twiceA.id, twiceB.id, "the same source twice is drawn twice");
			assert.deepEqual(dupes, [], "no id repeats on the page");
			// The `;` in the PR body that GitHub refused, refused here the same way.
			assert.equal(broken.panel, "codeblock");
			assert.ok(broken.preShown && !broken.id);
			assert.match(broken.error, /^Mermaid: Parse error on line 3:\n.*already filled in\n-+\^\nExpecting .*got 'NEWLINE'$/s);
			// An image on another computer is refused before Mermaid loads
			// it, however it is spelled; a share named in a label is drawn.
			for (const p of [far, farEscaped, farIcon]) {
				assert.ok(p.preShown && !p.id, "a diagram that would load a far file stays code");
				assert.match(p.error, /^Mermaid: not drawn, as it would load file:\/\/evilhost\/[^ ]*, a file on another computer$/);
			}
			// Over http a scheme-relative URL is http, which the CSP refuses;
			// on file:// it is a far file, refused as above (e2e.mjs).
			assert.ok(farRelative.preShown && farRelative.error, "a scheme-relative image is not drawn either");
			// Neither directive channel can set CSS or theme variables, and
			// a url() that did reach the page would not be fetched: the CSP
			// refuses the control, added after it.
			for (const p of panels) assert.deepEqual(p.beacons, [], "a diagram's own CSS reached its drawing");
			assert.ok(hits.includes("/mermaid.min.js"), "request log is live");
			assert.deepEqual(hits.filter((h) => h.startsWith("/beacon-")), [], "no url() is fetched");
			assert.match(csp, /font-src http:\/\/127\.0\.0\.1:\d+;/, "fonts allowed from their own origin only");
			assert.ok(inter.includes("loaded"), "the bundled Inter loads under the page CSP");
			assert.ok(Array.isArray(preload) && preload.includes("Inter"), `the font preload before measuring names Inter: ${preload}`);
			assert.equal(boxEmpty, true, "Mermaid leaves nothing in its layout box");
			assert.match(copied.text, /^sequenceDiagram\n {2}participant B as User's browser\n[\s\S]*filled in$/, "the panel's copy button copies the source");
			// The refresh: every diagram drawn in the task that swaps the page
			// in, the edited one with its previous drawing; then only it redone.
			assert.deepEqual(swapped, before, "nothing drops back to code at the swap");
			assert.notEqual(after[0], before[0], "the edited diagram is drawn again");
			assert.deepEqual(after.slice(1), before.slice(1), "and nothing else is");
			assert.match(editedText, /Adobe sign-in, edited/);
		},
	},

	// A fence in a notebook's markdown cell is drawn; one a cell printed is
	// output, and stays as the notebook wrote it.
	mermaidNotebook: {
		...NB,
		scripts: [...NB.scripts.slice(0, -1), "mermaid.min.js", "content.js"],
		path: "/diagrams.ipynb",
		source: JSON.stringify({
			nbformat: 4, nbformat_minor: 5, metadata: {},
			cells: [
				{ cell_type: "markdown", metadata: {}, source: ["# Cells\n", "\n", "```mermaid\n", "flowchart LR\n", "  A[Cell] --> B[Diagram]\n", "```\n"] },
				{
					cell_type: "code", execution_count: 1, metadata: {}, source: ["show()"],
					outputs: [{ output_type: "display_data", metadata: {}, data: { "text/html": ['<pre><code class="language-mermaid">flowchart LR\n  X --> Y</code></pre>'] } }],
				},
			],
		}),
		sendMessage: `(m) => Promise.resolve(m && m.type === "mermaid" ? !!window.mermaid : null)`,
		probe: `async () => {
			const main = document.querySelector("main.prose");
			for (let i = 0; i < 100 && !main.querySelector(".diagram > svg"); i++) await new Promise((r) => setTimeout(r, 25));
			const panel = main.querySelector(".md .diagram");
			return {
				drawn: panel ? { fence: "fence" in panel.dataset, svg: !!panel.querySelector(":scope > svg"), text: panel.querySelector("svg").textContent } : null,
				output: main.querySelector(".output").textContent,
				outputDrawn: main.querySelectorAll(".output [data-fence], .output .diagram").length,
			};
		}`,
		check: ({ drawn, output, outputDrawn, errors }) => {
			assert.deepEqual(errors, []);
			assert.ok(drawn && drawn.fence && drawn.svg, "the markdown cell's fence is drawn in a panel of its own");
			assert.match(drawn.text, /Cell.*Diagram/);
			assert.equal(outputDrawn, 0, "an output is never drawn");
			assert.match(output, /flowchart LR\s+X --> Y/);
		},
	},

	// A notebook's markdown cell goes through the same rule, and then
	// through hydrate()'s scaffolding allowlist — which must let the pair
	// through, or the toggle is unwrapped to its text. An output that
	// carries the same tags is the other author, and stays unwrapped.
	notebook: {
		...NB,
		path: "/cells.ipynb",
		source: JSON.stringify({
			nbformat: 4,
			nbformat_minor: 5,
			metadata: {},
			cells: [
				{ cell_type: "markdown", metadata: {}, source: ["# Cells\n", "\n", "<details open><summary>Query</summary>\n", "\n", "hidden *text*\n", "\n", "</details>\n"] },
				{
					cell_type: "code", execution_count: 1, metadata: {}, source: ["display(x)"],
					outputs: [{ output_type: "display_data", metadata: {}, data: { "text/html": ["<details open><summary>from output</summary>payload</details>"] } }],
				},
			],
		}),
		probe: `async () => ({
			cell: [...document.querySelectorAll("main .md details")].map((d) => [d.querySelector("summary").textContent, d.open, d.querySelector("em") && d.querySelector("em").textContent]),
			output: document.querySelectorAll("main .output details, main .output summary").length,
			outputText: document.querySelector("main .output").textContent.trim(),
		})`,
		check: ({ cell, output, outputText, errors }) => {
			assert.deepEqual(errors, []);
			assert.deepEqual(cell, [["Query", true, "text"]], "the cell's toggle survives hydration, open and with its markdown inside");
			assert.equal(output, 0, "an output's <details> is unwrapped");
			assert.equal(outputText, "from outputpayload", "to its text");
		},
	},

	// The parser alone, in this process, on the shapes where a toggle meets
	// another container — the ground an earlier draft's line scan got
	// wrong — and on the shape that was quadratic there: openers that
	// never close. Not a page, because the headless page's virtual clock
	// stands still while script runs, so nothing timed there means
	// anything; and the container cases need no DOM.
	parser: {
		unit: () => {
			const sandbox = {};
			sandbox.window = sandbox;
			sandbox.globalThis = sandbox;
			sandbox.atob = atob; // markdown-it 15 needs it at load; see md2html.mjs
			const context = createContext(sandbox);
			for (const lib of ["markdown-it.min.js", "details.js"]) {
				runInContext(readFileSync(join(ROOT, lib), "utf8"), context, { filename: lib });
			}
			const md = sandbox.markdownit({ html: false });
			sandbox.markdownDetails(md);
			// 150,000: past the argument limit a spread into push() hit.
			const t0 = performance.now();
			const html = md.render("<details>\n".repeat(150000));
			const render = (src) => md.render(src).replace(/\n/g, "");
			return {
				unclosedMs: performance.now() - t0,
				html,
				// The same level is not the same container: a closer in the
				// next item, or the next quote, has nothing to close.
				nextItem: render("- <details>\n\n- </details>\n"),
				nextQuote: render("> <details>\n\n> </details>\n"),
				// A closer inside a quote cannot close a toggle opened outside it.
				quotedCloser: render("<details><summary>s</summary>\n\n> </details>\n\nbody\n\n</details>\n"),
				// An opener left unclosed inside a quote is text, and does not
				// stop the outer toggle from closing after the quote.
				deadInner: render("<details><summary>A</summary>\n\n> <details><summary>B</summary>\n> b\n\nafter\n\n</details>\n"),
				// A toggle behind a list marker, closed at four spaces — inside
				// the item, not indented code.
				listedDeep: render("<details>\n\n- <details>\n\n  in\n\n    </details>\n\nout\n\n</details>\n"),
				// Not a fence in markdown-it (a backtick in the info string),
				// so not a fence here either: the closer still closes.
				notAFence: render("<details>\n\n```a`b\ntext\n\n</details>\n"),
				// A closer straight after a list item ends the list instead
				// of lazily continuing the item.
				afterItem: render("<details>\n\n- item\n</details>\n"),
				// A stray closer with nothing open is text.
				stray: render("> </details>\n"),
			};
		},
		check: ({ unclosedMs, html, nextItem, nextQuote, quotedCloser, deadInner, listedDeep, notAFence, afterItem, stray }) => {
			assert.ok(unclosedMs < 3000, `150,000 unclosed openers took ${Math.round(unclosedMs)} ms; parsing has gone quadratic`);
			assert.ok(!html.includes("<details>"), "and every one of them is text");
			assert.equal(nextItem, "<ul><li><p>&lt;details&gt;</p></li><li><p>&lt;/details&gt;</p></li></ul>");
			assert.equal(nextQuote, "<blockquote><p>&lt;details&gt;</p></blockquote><blockquote><p>&lt;/details&gt;</p></blockquote>");
			assert.equal(quotedCloser, "<details><summary>s</summary><blockquote><p>&lt;/details&gt;</p></blockquote><p>body</p></details>");
			assert.equal(deadInner, "<details><summary>A</summary><blockquote><p>&lt;details&gt;&lt;summary&gt;B&lt;/summary&gt;</p><p>b</p></blockquote><p>after</p></details>");
			assert.equal(listedDeep, "<details><ul><li><details><p>in</p></details></li></ul><p>out</p></details>");
			assert.equal(notAFence, "<details><p>```a`btext</p></details>");
			assert.equal(afterItem, "<details><ul><li>item</li></ul></details>");
			assert.equal(stray, "<blockquote><p>&lt;/details&gt;</p></blockquote>");
		},
	},

	// links.js alone, in this process: the exact HTML a run renders, which
	// must be what the Markdown form renders, and which links it marks for
	// the zoom viewer. No DOM needed, so no page.
	linksParser: {
		unit: () => {
			const sandbox = {};
			sandbox.window = sandbox;
			sandbox.globalThis = sandbox;
			sandbox.atob = atob;
			const context = createContext(sandbox);
			for (const lib of ["markdown-it.min.js", "images.js", "links.js"]) {
				runInContext(readFileSync(join(ROOT, lib), "utf8"), context, { filename: lib });
			}
			const md = sandbox.markdownit({ html: false, linkify: true });
			sandbox.markdownImages(md);
			sandbox.markdownLinks(md);
			const render = (src) => md.render(src).replace(/\n/g, "");
			return Object.fromEntries(Object.entries({
				html: `<a href="x.png"><img src="x.png" alt="a" width="20"></a>`,
				markdown: `[<img src="x.png" alt="a" width="20">](x.png)`,
				image: "[![a](x.png)](x.png)",
				elsewhere: `<a href='y.png' title='T'> <img src="x.png"> </a>`,
				caption: "[![a](x.png) caption](x.png)",
				lines: `<a href="x.png">\n<img src="x.png">\n</a>`,
				inLabel: `[<a href="x.png"><img src="x.png"></a>](z.png)`,
				code: '`<a href="x.png"><img src="x.png"></a>`',
				...Object.fromEntries([
					'<a href="x" target="_blank"><img src="x"></a>',
					'<a href="x" rel="nofollow"><img src="x"></a>',
					'<a href="x" id="y"><img src="x"></a>',
					'<a href="x" name="y"><img src="x"></a>',
					'<a href="x" style="color:red"><img src="x"></a>',
					'<a href="x" onclick="y()"><img src="x"></a>',
					'<a href="x" href="y"><img src="x"></a>',
					'<a href=x><img src="x"></a>',
					'<a href=""><img src="x"></a>',
					'<a title="t"><img src="x"></a>',
					'<a href="vbscript:x"><img src="x"></a>',
					'<a href="x"></a>',
					'<a href="x"><img src="x"><img src="x"></a>',
					'<a href="x">see <img src="x"></a>',
					'<a href="x"><img src="x" onload="y()"></a>',
					'<a href="x"><img src="x">',
				].map((src, i) => [`reject${i}`, src])),
			}).map(([name, src]) => [name, render(src)]));
		},
		check: (out) => {
			const linked = '<p><a href="x.png" data-zoom=""><img src="x.png" alt="a" width="20"></a></p>';
			assert.equal(out.html, linked, "a link to its own image, marked for the viewer");
			assert.equal(out.markdown, out.html, "byte for byte what the Markdown form renders");
			assert.equal(out.image, linked.replace(' width="20"', ""), "plain image syntax is marked too");
			assert.equal(out.elsewhere, '<p><a href="y.png" title="T"><img src="x.png" alt=""></a></p>', "single quotes, a title, spaces; not marked");
			assert.ok(!out.caption.includes("data-zoom"), "a link holding more than the image is not marked");
			assert.equal(out.lines, '<p><a href="x.png" data-zoom=""><img src="x.png" alt=""></a></p>', "across a paragraph's lines");
			assert.equal(out.inLabel.match(/<a /g).length, 1, "inside a link's text it stays text");
			assert.equal(out.code, '<p><code>&lt;a href=&quot;x.png&quot;&gt;&lt;img src=&quot;x.png&quot;&gt;&lt;/a&gt;</code></p>');
			for (const [name, html] of Object.entries(out).filter(([n]) => n.startsWith("reject"))) {
				assert.ok(!/<a /.test(html), `${name} stays text: ${html}`);
			}
		},
	},

	// comments.js alone, in this process, for the same reasons as `parser`:
	// openers that never close, which were quadratic before the search was
	// remembered, and the block shapes the page case does not reach.
	commentsParser: {
		unit: () => {
			const sandbox = {};
			sandbox.window = sandbox;
			sandbox.globalThis = sandbox;
			sandbox.atob = atob;
			const context = createContext(sandbox);
			for (const lib of ["markdown-it.min.js", "comments.js"]) {
				runInContext(readFileSync(join(ROOT, lib), "utf8"), context, { filename: lib });
			}
			const md = sandbox.markdownit({ html: false });
			sandbox.markdownComments(md);
			const timed = (src) => {
				const t0 = performance.now();
				const html = md.render(src);
				return [performance.now() - t0, html];
			};
			const render = (src) => md.render(src).replace(/\n/g, "");
			return {
				lines: timed("<!-- x\n".repeat(50000)),
				inline: timed("<!-- ".repeat(50000)),
				// Nothing inside a comment block is parsed, up to its closing
				// line, and text after the `-->` is a paragraph of its own.
				trailing: render("<!--\n# hidden\n--> tail\nnext"),
				sameLine: render("<!-- a --> <!-- b\nstill b --> tail"),
				interrupts: render("before\n<!-- hidden --> after"),
				// A comment in a list item or a quote stays in it.
				inItem: render("- one\n  <!-- c\n  c -->\n- two"),
				inQuote: render("> <!-- c -->\n> quoted\n\nout"),
				short: render("<!--> a\n\nb <!---> c"),
				halfClosed: render("<!-- a --> <!-- open"),
			};
		},
		check: ({ lines, inline, trailing, sameLine, interrupts, inItem, inQuote, short, halfClosed }) => {
			for (const [label, [ms, html]] of Object.entries({ lines, inline })) {
				assert.ok(ms < 3000, `50,000 unclosed ${label} openers took ${Math.round(ms)} ms; parsing has gone quadratic`);
				assert.ok(html.includes("&lt;!--"), "and every one of them is text");
			}
			assert.equal(trailing, "<p>tail</p><p>next</p>");
			assert.equal(sameLine, "<p>tail</p>");
			assert.equal(interrupts, "<p>before</p><p>after</p>");
			assert.equal(inItem, "<ul><li>one</li><li>two</li></ul>");
			assert.equal(inQuote, "<blockquote><p>quoted</p></blockquote><p>out</p>");
			assert.equal(short, "<p>a</p><p>b  c</p>");
			assert.equal(halfClosed, "<p>&lt;!-- open</p>");
		},
	},

	// frontmatter.js alone, in this process: where front matter starts and
	// ends, and that what it holds is escaped and never parsed.
	frontMatterParser: {
		unit: () => {
			const sandbox = {};
			sandbox.window = sandbox;
			sandbox.globalThis = sandbox;
			sandbox.atob = atob;
			const context = createContext(sandbox);
			for (const lib of ["markdown-it.min.js", "frontmatter.js"]) {
				runInContext(readFileSync(join(ROOT, lib), "utf8"), context, { filename: lib });
			}
			const md = sandbox.markdownit({ html: false });
			sandbox.markdownFrontMatter(md);
			const hidden = sandbox.markdownit({ html: false });
			sandbox.markdownFrontMatter(hidden, { show: false });
			const render = (src) => md.render(src).replace(/\n/g, "");
			const code = (body, lang = "yaml") => `<details class="frontmatter"><summary>Front matter</summary><pre><code class="language-${lang}">${body}</code></pre></details>`;
			return {
				code: [code("a: 1"), code("a = 1", "toml")],
				crlf: render("---\r\na: 1\r\n---\r\n# T"),
				eof: render("---\na: 1\n---"),
				trailing: render("---  \na: 1\n--- \nx"),
				hostile: render("---\n<script>x</script>\n---"),
				toml: render("+++\na = 1\n+++"),
				empty: render("---\n---\n# T"),
				unclosed: render("---\na: 1\n\n# T"),
				blankFirst: render("\n---\na: 1\n---"),
				long: render("----\na: 1\n----"),
				text: render("--- x\na: 1\n---"),
				indentedClose: render("---\na: 1\n ---\n---"),
				mixed: render("---\na = 1\n+++"),
				quote: render("> ---\n> a: 1\n> ---"),
				fence: render("```\n---\na: 1\n---\n```"),
				hidden: hidden.render("---\na: 1\n---\nbody"),
			};
		},
		check: ({ code: [yaml, toml], crlf, eof, trailing, hostile, toml: tomlOut, empty, unclosed, blankFirst, long, text, indentedClose, mixed, quote, fence, hidden }) => {
			assert.equal(crlf, yaml.replace("a: 1", "a: 1\n").replace(/\n/g, "") + "<h1>T</h1>");
			assert.equal(eof, yaml);
			assert.equal(trailing, yaml + "<p>x</p>", "trailing spaces on either fence");
			assert.equal(hostile, yaml.replace("a: 1", "&lt;script&gt;x&lt;/script&gt;"), "escaped");
			assert.equal(tomlOut, toml);
			assert.equal(empty, "<h1>T</h1>", "an empty block renders nothing");
			assert.equal(unclosed, "<hr><p>a: 1</p><h1>T</h1>", "no closer: the file renders as before");
			assert.equal(blankFirst, "<hr><h2>a: 1</h2>", "not on the first line: a rule and a heading, as before");
			assert.equal(long, "<hr><h2>a: 1</h2>", "only exactly three");
			assert.equal(text, "<h2>--- xa: 1</h2>", "text after the fence: not front matter");
			assert.equal(indentedClose, yaml.replace("a: 1", "a: 1 ---"), "an indented `---` does not close it");
			assert.equal(mixed, "<hr><p>a = 1+++</p>", "the closer matches the opener");
			assert.equal(quote, "<blockquote><hr><h2>a: 1</h2></blockquote>", "a container's first line is not the file's");
			assert.equal(fence, "<pre><code>---a: 1---</code></pre>", "an example in a fence stays code");
			assert.equal(hidden, "<p>body</p>\n", "show: false renders nothing");
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
				toc: [...document.querySelectorAll(".toc a")].map((a) => a.dataset.href),
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

	// The exporter's output argument, run as the CLI in a scratch directory.
	// An existing directory takes <name>.html; a directory-shaped argument —
	// trailing slash, `.` or `..` — must already be a directory, because
	// resolve() would otherwise turn `newdir/` into a file named newdir and
	// `notes.txt/` into an overwrite of notes.txt.
	md2html: {
		unit: () => {
			const dir = mkdtempSync(join(tmpdir(), "md2html-"));
			try {
				writeFileSync(join(dir, "notes.md"), "# Hi\n");
				writeFileSync(join(dir, "keep.txt"), "keep");
				mkdirSync(join(dir, "out"));
				const run = (out) => {
					const r = spawnSync(process.execPath, [join(ROOT, "md2html.mjs"), "notes.md", ...(out === undefined ? [] : [out])], { cwd: dir, encoding: "utf8" });
					return { status: r.status, stderr: r.stderr };
				};
				const isFile = (p) => existsSync(join(dir, p)) && statSync(join(dir, p)).isFile();
				return {
					beside: [run(undefined).status, isFile("notes.html")],
					intoDir: [run("out").status, isFile("out/notes.html")],
					intoDirSlash: [run("out/").status, isFile("out/notes.html")],
					intoDirDots: [run("out/sub/..").status, run("out/.").status],
					file: [run("x.html").status, isFile("x.html")],
					bare: [run("bare").status, isFile("bare")],
					missingSlash: [run("newdir/"), existsSync(join(dir, "newdir"))],
					missingDot: [run("missing/.").status, existsSync(join(dir, "missing"))],
					fileSlash: [run("keep.txt/").status, readFileSync(join(dir, "keep.txt"), "utf8")],
					missingParent: [run("nope/x.html").status, existsSync(join(dir, "nope"))],
					self: [run("notes.md").status, readFileSync(join(dir, "notes.md"), "utf8")],
				};
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		check: (r) => {
			assert.deepEqual(r.beside, [0, true], "no output: <name>.html beside the input");
			assert.deepEqual(r.intoDir, [0, true], "an existing directory takes <name>.html");
			assert.deepEqual(r.intoDirSlash, [0, true], "with a trailing slash too");
			assert.deepEqual(r.intoDirDots, [1, 0], "`..` and `.` are checked as typed: out/sub does not exist, out does");
			assert.deepEqual(r.file, [0, true], "anything else is the output file");
			assert.deepEqual(r.bare, [0, true], "even without an extension");
			assert.equal(r.missingSlash[0].status, 1, "a missing directory is an error");
			assert.match(r.missingSlash[0].stderr, /not an existing directory: newdir\//);
			assert.equal(r.missingSlash[1], false, "and nothing is written in its place");
			assert.deepEqual(r.missingDot, [1, false], "`missing/.` likewise");
			assert.deepEqual(r.fileSlash, [1, "keep"], "a file with a trailing slash is not a directory, and is left alone");
			assert.deepEqual(r.missingParent, [1, false], "a missing parent is not created");
			assert.deepEqual(r.self, [1, "# Hi\n"], "the source is never the output");
		},
	},

	// The same captions as `captions`, from the exporter's string passes.
	md2htmlCaptions: {
		unit: () => {
			const dir = mkdtempSync(join(tmpdir(), "md2html-"));
			try {
				writeFileSync(join(dir, "doc.md"), CAPTIONS.source());
				const r = spawnSync(process.execPath, [join(ROOT, "md2html.mjs"), "doc.md"], { cwd: dir, encoding: "utf8" });
				return { status: r.status, stderr: r.stderr, html: readFileSync(join(dir, "doc.html"), "utf8") };
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		check: ({ status, stderr, html }) => {
			assert.equal(status, 0, stderr);
			const captions = [...html.matchAll(/<p class="caption">([\s\S]*?)<\/p>/g)].map((m) =>
				m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
			assert.deepEqual(captions, CAPTIONS.expected);
			assert.equal((html.match(/<\/table><\/div>\s*<p class="caption">/g) || []).length, 3, "a source note follows its panel");
		},
	},

	// The same cells marked in an export; and none in a notebook, where an
	// aligned cell's text-align becomes a class of its own.
	md2htmlNowrap: {
		unit: () => {
			const dir = mkdtempSync(join(tmpdir(), "md2html-"));
			try {
				writeFileSync(join(dir, "doc.md"), NOWRAP.source());
				writeFileSync(join(dir, "nb.ipynb"), JSON.stringify({
					cells: [{ cell_type: "markdown", metadata: {}, source: ["| # | Due |\n", "|---|---:|\n", "| OD-1 | 2026-10-31 |\n"] }],
					metadata: {}, nbformat: 4, nbformat_minor: 5,
				}));
				const run = (file) => spawnSync(process.execPath, [join(ROOT, "md2html.mjs"), file], { cwd: dir, encoding: "utf8" });
				const md = run("doc.md");
				const nb = run("nb.ipynb");
				return {
					status: [md.status, nb.status], stderr: md.stderr + nb.stderr,
					html: readFileSync(join(dir, "doc.html"), "utf8"),
					nbHtml: readFileSync(join(dir, "nb.html"), "utf8"),
				};
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		check: ({ status, stderr, html, nbHtml }) => {
			assert.deepEqual(status, [0, 0], stderr);
			const marked = [...html.matchAll(/<t[dh]\b[^>]*\bclass="nowrap"[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) =>
				m[1].replace(/<[^>]*>/g, ""));
			assert.deepEqual(marked, NOWRAP.expected);
			assert.ok(nbHtml.includes('<td class="ta-r">2026-10-31</td>'), "a notebook cell keeps its alignment class");
			assert.ok(!/class="[^"]*\bnowrap\b/.test(nbHtml), "and is not marked");
		},
	},

	// The same headers dropped in an export, and in a notebook's markdown.
	md2htmlEmptyHead: {
		unit: () => {
			const dir = mkdtempSync(join(tmpdir(), "md2html-"));
			try {
				writeFileSync(join(dir, "doc.md"), EMPTY_HEAD.source());
				writeFileSync(join(dir, "nb.ipynb"), JSON.stringify({
					cells: [{ cell_type: "markdown", metadata: {}, source: ["| | |\n", "|---|---|\n", "| a | b |\n"] }],
					metadata: {}, nbformat: 4, nbformat_minor: 5,
				}));
				const run = (file) => spawnSync(process.execPath, [join(ROOT, "md2html.mjs"), file], { cwd: dir, encoding: "utf8" });
				const md = run("doc.md");
				const nb = run("nb.ipynb");
				return {
					status: [md.status, nb.status], stderr: md.stderr + nb.stderr,
					html: readFileSync(join(dir, "doc.html"), "utf8"),
					nbHtml: readFileSync(join(dir, "nb.html"), "utf8"),
				};
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		check: ({ status, stderr, html, nbHtml }) => {
			assert.deepEqual(status, [0, 0], stderr);
			const tables = [...html.matchAll(/<table[\s>]([\s\S]*?)<\/table>/g)].map((m) =>
				[m[1].includes("<thead>"), (m[1].match(/<tr>/g) || []).length]);
			assert.deepEqual(tables, EMPTY_HEAD.expected);
			// The table itself: the inlined notebook.js mentions <thead> in a comment.
			const nbTable = /<table>[\s\S]*?<\/table>/.exec(nbHtml)?.[0] ?? "";
			assert.ok(nbTable.includes("<td>a</td>"), "the notebook's table is rendered");
			assert.ok(!nbTable.includes("<thead>"), "and its empty header is dropped too");
		},
	},

	// The same grids marked in an export, each still in its panel.
	md2htmlGrid: {
		unit: () => {
			const dir = mkdtempSync(join(tmpdir(), "md2html-"));
			try {
				writeFileSync(join(dir, "doc.md"), GRID.source());
				const r = spawnSync(process.execPath, [join(ROOT, "md2html.mjs"), "doc.md"], { cwd: dir, encoding: "utf8" });
				return { status: r.status, stderr: r.stderr, html: readFileSync(join(dir, "doc.html"), "utf8") };
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		check: ({ status, stderr, html }) => {
			assert.equal(status, 0, stderr);
			assert.deepEqual([...html.matchAll(/<table( class="grid")?>/g)].map((m) => !!m[1]), GRID.expected);
			assert.equal((html.match(/<div class="tablewrap"><table[\s>]/g) || []).length, GRID.expected.length, "every table in its panel");
		},
	},

	// The exporter leaves a link's text as written, as the extension does, and
	// drops the same trailing <wbr>.
	md2htmlMarker: {
		unit: () => {
			const dir = mkdtempSync(join(tmpdir(), "md2html-"));
			try {
				writeFileSync(join(dir, "doc.md"), MARKER.source());
				writeFileSync(join(dir, "nb.ipynb"), MARKER.notebook());
				const run = (file) => spawnSync(process.execPath, [join(ROOT, "md2html.mjs"), file], { cwd: dir, encoding: "utf8" });
				const md = run("doc.md");
				const nb = run("nb.ipynb");
				return {
					status: [md.status, nb.status], stderr: md.stderr + nb.stderr,
					html: readFileSync(join(dir, "doc.html"), "utf8"),
					nbHtml: readFileSync(join(dir, "nb.html"), "utf8"),
				};
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		check: ({ status, stderr, html, nbHtml }) => {
			assert.deepEqual(status, [0, 0], stderr);
			const main = /<main\b[\s\S]*<\/main>/.exec(html)[0];
			const links = [...main.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);
			// As in the extension, but for what it leaves as written: a remote
			// image stays an image, and a data: link stays a link.
			assert.deepEqual(links, [
				"sketch-cg-weekly-tv-update.md", "notes.md", "bold.md", "https://example.com/a/long/path", "https://bare.example.com/page",
				"#links", "other.md#links", "https://example.com/linked", "data:image/png;base64,iVBORw0KGgo=", "summary.md", "body.md",
				"reader-notes/", "sketch-cg-weekly-tv-update.md", "inventory.md", "notes/",
			]);
			assert.ok(!main.includes('class="link-label"'), "no link text is rewrapped");
			assert.ok(main.includes("<code>reader-notes/</code>") && main.includes("<code>a/<wbr>b/</code>") && main.includes("<code>snake_<wbr>case_</code>"),
				"no <wbr> after a separator that ends the chip");
			const nbMain = /<main\b[\s\S]*<\/main>/.exec(nbHtml)[0];
			assert.ok(nbMain.includes('<a href="cell.md">cell link</a>'), "a Markdown cell's link is as written");
		},
	},

	// The exporter takes the sized <img> through the same inliner as ![](…):
	// a local file travels as data:, with its width and height intact, and a
	// sized image alone in its paragraph is a figure here too.
	md2htmlImages: {
		unit: () => {
			const dir = mkdtempSync(join(tmpdir(), "md2html-"));
			try {
				const png = /!\[small figure\]\(data:image\/png;base64,([^)]*)\)/.exec(fixture("tables.md"))[1];
				mkdirSync(join(dir, "img"));
				writeFileSync(join(dir, "img", "shot.png"), Buffer.from(png, "base64"));
				writeFileSync(join(dir, "doc.md"), [
					"| A |", "|---|", '| <img src="img/shot.png" alt="cell" width="120"> |', "",
					'<img src="img/shot.png" alt="fig" width="150" height="100">', "",
					'<img src="img/shot.png" onload="x()">', "",
					'| B |', "|---|", '| <a href="img/shot.png"><img src="img/shot.png" alt="linked" width="120"></a> |', "",
				].join("\n"));
				const r = spawnSync(process.execPath, [join(ROOT, "md2html.mjs"), "doc.md"], { cwd: dir, encoding: "utf8" });
				return { status: r.status, stderr: r.stderr, html: readFileSync(join(dir, "doc.html"), "utf8") };
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		check: ({ status, stderr, html }) => {
			assert.equal(status, 0, stderr);
			assert.match(html, /<td><img src="data:image\/png;base64,[^"]+" alt="cell" width="120"><\/td>/, "a cell image is inlined, width kept");
			assert.match(html, /<p class="figure"><img src="data:image\/png;base64,[^"]+" alt="fig" width="150" height="100"><\/p>/, "a standalone one is a figure");
			// The href is left as written; only the src is inlined. The mark
			// was made before that, so the viewer still opens it in place.
			assert.match(html, /<td><a href="img\/shot.png" data-zoom=""><img src="data:image\/png;base64,[^"]+" alt="linked" width="120"><\/a><\/td>/,
				"a linked image keeps its href and its mark for the viewer");
			assert.ok(!/src="img\/shot.png"/.test(html), "no relative src survives");
			assert.ok(html.includes("onload=&quot;x()&quot;"), "a disallowed attribute leaves the tag as text");
			assert.ok(html.includes("window.imageViewer = (main) =>") && html.includes("window.imageViewer(main);"),
				"the image viewer travels with an export that has images");
		},
	},

	// The exporter renders front matter the way the extension does.
	md2htmlFrontMatter: {
		unit: () => {
			const dir = mkdtempSync(join(tmpdir(), "md2html-"));
			try {
				writeFileSync(join(dir, "doc.md"), ["---", "a: 1", "---", "<!-- confluence-page-id: 1 -->", "# Title", ""].join("\n"));
				const r = spawnSync(process.execPath, [join(ROOT, "md2html.mjs"), "doc.md"], { cwd: dir, encoding: "utf8" });
				return { status: r.status, stderr: r.stderr, html: readFileSync(join(dir, "doc.html"), "utf8") };
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		check: ({ status, stderr, html }) => {
			assert.equal(status, 0, stderr);
			assert.ok(html.includes("<title>Title</title>"), "the heading below the front matter names the document");
			assert.match(html, /<details class="frontmatter"><summary>Front matter<\/summary>/);
			assert.ok(!html.includes("<hr>") && !/<h2[^>]*>a: 1/.test(html), "no rule or heading from it");
		},
	},

	// The exporter hides a comment the way the extension does, and keeps one
	// in a fence as text.
	md2htmlComments: {
		unit: () => {
			const dir = mkdtempSync(join(tmpdir(), "md2html-"));
			try {
				writeFileSync(join(dir, "doc.md"), [
					"<!-- confluence-page-id: 5702746886 -->", "# Title", "",
					"Before <!-- inline --> after.", "",
					"```", "<!-- in a fence -->", "```", "",
				].join("\n"));
				const r = spawnSync(process.execPath, [join(ROOT, "md2html.mjs"), "doc.md"], { cwd: dir, encoding: "utf8" });
				return { status: r.status, stderr: r.stderr, html: readFileSync(join(dir, "doc.html"), "utf8") };
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		check: ({ status, stderr, html }) => {
			assert.equal(status, 0, stderr);
			assert.ok(html.includes("<title>Title</title>"), "the heading below the comment names the document");
			assert.ok(!html.includes("confluence-page-id") && !html.includes("inline -->"), "both comments are hidden");
			assert.ok(html.includes("<p>Before  after.</p>"));
			assert.ok(html.includes("&lt;!-- in a fence --&gt;"), "a fence keeps it as text");
		},
	},
};

// The exporter inlines Mermaid only for a document with a diagram, and the
// page it writes draws them. Opened in Chrome rather than read as a string:
// what matters is that 5.5 MB of inlined script leaves the page parsing, so
// the scripts after it (the copy buttons, the rail's spy) still run.
cases.md2htmlMermaid = {
	unit: () => {
		const dir = mkdtempSync(join(tmpdir(), "md2html-"));
		const profile = mkdtempSync(join(tmpdir(), "local-viewer-test-"));
		try {
			writeFileSync(join(dir, "doc.md"), fixture("diagrams.md"));
			writeFileSync(join(dir, "plain.md"), "# Plain\n\n```js\nconst x = 1;\n```\n");
			const run = (file) => spawnSync(process.execPath, [join(ROOT, "md2html.mjs"), file], { cwd: dir, encoding: "utf8" });
			const md = run("doc.md");
			const plain = run("plain.md");
			const dom = spawnSync(CHROME, [
				"--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`,
				"--window-size=1200,1000", "--virtual-time-budget=5000", "--dump-dom", "file://" + join(dir, "doc.html"),
			], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 60000 }).stdout;
			return {
				status: [md.status, plain.status], stderr: md.stderr + plain.stderr,
				html: readFileSync(join(dir, "doc.html"), "utf8"),
				plainHtml: readFileSync(join(dir, "plain.html"), "utf8"),
				dom,
			};
		} finally {
			rmSync(dir, { recursive: true, force: true });
			rmSync(profile, { recursive: true, force: true });
		}
	},
	check: ({ status, stderr, html, plainHtml, dom }) => {
		assert.deepEqual(status, [0, 0], stderr);
		const bundle = "__esbuild_esm_mermaid_nm";
		assert.ok(html.includes(bundle) && html.includes("window.mermaidDiagrams(main"), "a document with a diagram carries Mermaid");
		assert.ok(!plainHtml.includes(bundle) && !plainHtml.includes("mermaidDiagrams"), "one without does not");
		const drawn = dom.match(/<div class="codeblock diagram"><svg [^>]*aria-roledescription="[\w-]+"/g) || [];
		assert.equal(drawn.length, 7, "seven diagrams drawn in the exported page");
		assert.equal((dom.match(/<p class="diagram-error">Mermaid: not drawn, as it would load /g) || []).length, 4, "and none that would load a far file, on file:// a scheme-relative one too");
		assert.match(dom, /<p class="diagram-error">Mermaid: Parse error on line 3:/, "and the broken one left as code, with the message");
		// In the drawings, that is: each fence's source stays beside it.
		const drawings = dom.match(/<svg id="lvMermaid[\s\S]*?<\/svg>/g) || [];
		assert.ok(drawings.length >= 7 && !drawings.some((svg) => svg.includes("beacon-")), "a diagram's own CSS is kept out of an export too");
		// Scripts after the bundle ran: the copy pass and the rail's spy.
		assert.match(dom, /<button type="button" class="copy"/, "the copy buttons were added");
		assert.match(dom, /<a [^>]*class="active"/, "the spy lit a rail entry");
	},
};

// ---------------------------------------------------------------- Run
const only = process.argv[2];
if (only && !cases[only]) {
	console.error(`no such case: ${only} (have ${Object.keys(cases).join(", ")})`);
	process.exit(2);
}
const names = Object.keys(cases).filter((n) => !only || n === only);
const pages = Object.fromEntries(names.filter((n) => !cases[n].unit).map((n) => [`/__${n}.html`, page(cases[n])]));
const server = await serve(pages);
const { port } = server.address();
let failed = 0;
for (const name of names) {
	try {
		const { unit, check, width } = cases[name];
		check(unit ? unit() : await dump(`http://127.0.0.1:${port}/__${name}.html`, width));
		console.log(`ok    ${name}`);
	} catch (e) {
		failed++;
		console.log(`FAIL  ${name}\n${e.stack || e}`);
	}
}
server.close();
process.exit(failed ? 1 : 0);
