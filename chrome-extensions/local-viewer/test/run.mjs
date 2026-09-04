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
const dump = async (url) => {
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
			return {
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
		check: ({ title, railLabel, toc, meta, bigId, link, empty, weird, ranges, nestedOpen, longLen, clip, reopened, expanded, errors }) => {
			assert.deepEqual(errors, []);
			assert.equal(title, "data.json");
			assert.equal(railLabel, "Keys");
			assert.deepEqual(toc, ["#", "#k-name", "#k-big_id", "#k-site", "#k-empty_obj", "#k-empty_arr", "#k-flags", "#k-long", "#k-weird-key", "#k-items"]);
			assert.match(meta, /^Object · 9 keys · [\d.]+ KB$/);
			assert.equal(bigId, "12345678901234567890", "an integer past 2^53 keeps its digits");
			assert.equal(link, "https://example.com/path?q=1");
			assert.deepEqual(empty, ["empty_obj: {}", "empty_arr: []"]);
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
	// regex, path-mode, Enter to step, a refresh that keeps the query.
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
			const marks = () => [...main.querySelectorAll("mark.m")].map((m) => m.parentElement.closest(".jn").dataset.path + ":" + m.textContent);
			const first = { count: count(), hit: hit(), rows: main.querySelectorAll(".jn").length, marks: marks() };
			enter(); enter();
			const third = { count: count(), hit: hit(), marks: marks() };
			enter(true);
			const back = { count: count(), hit: hit() };
			const opened249 = !!main.querySelector(".jn[data-path='items[249]']");
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
			const kept = { value: again.querySelector(".find input").value, count: again.querySelector(".find .count").textContent, hit: !!again.querySelector(".row.hit") };
			// "/" focuses the box; Ctrl+F too, and is prevented.
			input.blur();
			document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));
			const slashFocus = document.activeElement === input || document.activeElement === again.querySelector(".find input");
			const ctrl = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
			document.body.dispatchEvent(ctrl);
			return { rowsBefore, first, third, back, opened249, pathMode, bare, regex, literal, none, kept, slashFocus, ctrlPrevented: ctrl.defaultPrevented };
		}`,
		check: ({ rowsBefore, first, third, back, opened249, pathMode, bare, regex, literal, none, kept, slashFocus, ctrlPrevented, errors }) => {
			assert.deepEqual(errors, []);
			// tag "t2" on items 2, 5, 8 … 248: 83 of them.
			assert.equal(first.count, "1 of 83");
			assert.equal(first.hit, "items[2].tag");
			assert.ok(first.rows <= rowsBefore + 10, "the first jump opened at most the way to one match, not the whole file");
			assert.deepEqual(first.marks, ["items[2].tag:t2"], "the matched text is marked on the current row");
			assert.equal(third.count, "3 of 83");
			assert.equal(third.hit, "items[8].tag");
			assert.deepEqual(third.marks, ["items[8].tag:t2"], "the previous row's mark is gone");
			assert.equal(back.count, "2 of 83");
			assert.equal(back.hit, "items[5].tag");
			assert.equal(opened249, false, "the last range stayed closed");
			assert.equal(pathMode.count, "1 of 250");
			assert.equal(pathMode.hit, "items[0].nested.x");
			assert.equal(bare, "1 of 1", "a bare word matches keys and values, never paths");
			assert.equal(regex.count, "1 of 1");
			assert.equal(regex.hit, "long");
			assert.equal(regex.len, 1000, "the current match unclips its string");
			assert.equal(regex.markLen, 900, "the regex match is marked at its true extent");
			assert.deepEqual(literal, { count: "1 of 1", marks: ["site:q=1"] }, "a plain query is literal, and marks inside a link's text");
			assert.deepEqual(none, { count: "no matches", hit: null });
			assert.deepEqual(kept, { value: "t2", count: "0 of 83", hit: false }, "a refresh keeps the query and count without jumping");
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
			const again = window.jsonRender.render(${JSON.stringify(fixture("data.jsonl"))}, { jsonl: true, expanded: null, query: "msg", icons: { copy: "", done: "" } });
			document.body.appendChild(again);
			again.querySelector(".find .prev").click();
			const wrapped = again.querySelector(".find .count").textContent + " " + again.querySelector(".row.hit").parentElement.dataset.path;
			// An empty first paint: the root says so, and nothing throws.
			const empty = window.jsonRender.render("", { jsonl: true, expanded: null, icons: { copy: "", done: "" } }).querySelector(".jn.root .row").textContent;
			let emptyJson = "";
			try { window.jsonRender.render("", { jsonl: false, expanded: null, icons: { copy: "", done: "" } }); } catch (e) { emptyJson = "threw"; }
			return {
				badHit, wrapped, empty, emptyJson,
				meta: main.querySelector(".meta").textContent,
				fields: [...main.querySelectorAll(".fields .f")].map((f) => f.textContent),
				records: [...main.querySelectorAll(".jn.root > .kids > .jn")].map((n) => n.dataset.path),
				bad: rowOf("[3]").className + " | " + rowOf("[3]").querySelector(".err").textContent,
				tags: rowOf("[0].tags") && rowOf("[0].tags").querySelector(".sum").textContent,
				railLabel: document.querySelector(".toc-label").textContent,
				copied: window.__clip[0],
			};
		}`,
		check: ({ badHit, wrapped, empty, emptyJson, meta, fields, records, bad, tags, railLabel, copied, errors }) => {
			assert.deepEqual(errors, []);
			assert.equal(badHit, "[3]", "a bad line is found by its own text");
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
		cases[name].check(await dump(`http://127.0.0.1:${port}/__${name}.html`));
		console.log(`ok    ${name}`);
	} catch (e) {
		failed++;
		console.log(`FAIL  ${name}\n${e.stack || e}`);
	}
}
server.close();
process.exit(failed ? 1 : 0);
