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

import { readFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
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

const serve = (pages) =>
	new Promise((resolve) => {
		const server = createServer((req, res) => {
			const url = new URL(req.url, "http://x");
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
const dump = async (url) => {
	const { stdout: dom } = await promisify(execFile)(
		CHROME,
		["--headless=new", "--disable-gpu", "--no-first-run", "--virtual-time-budget=5000", "--dump-dom", url],
		{ encoding: "utf8", maxBuffer: 64 << 20, timeout: 60000 },
	);
	const match = /<textarea id="__out">([\s\S]*?)<\/textarea>/.exec(dom);
	if (!match) throw new Error("page produced no output; content.js did not finish\n" + dom.slice(0, 2000));
	const text = match[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
	return JSON.parse(text);
};

// ---------------------------------------------------------------- Cases
const fixture = (name) => readFileSync(join(HERE, "fixtures", name), "utf8");
const MD = { scripts: ["markdown-it.min.js", "highlight.min.js", "content.js"], css: ["theme.css"] };
const EMAIL = { scripts: ["markdown-it.min.js", "content.js"], css: ["email.css"] };

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
			// Mid-paragraph into the first list item: link, list and lines must survive.
			const range = document.createRange();
			range.setStart(lines[2].firstChild, 5);
			range.setEnd(li.firstChild, 2);
			const selection = window.__copySelection(range);
			document.querySelector(".copy-all").click();
			for (let i = 0; i < 100 && !window.__clip.length; i++) await new Promise((r) => setTimeout(r, 20));
			return { preview: main.innerHTML, all: window.__clip[0], selection };
		}`,
		check: ({ preview, all, selection, errors }) => {
			assert.deepEqual(errors, []);
			const html = all["text/html"];
			assert.ok(!/<p[\s>]/.test(html), "no <p> in the copy");
			assert.ok(!/<h[1-6]/.test(html), "no headings in the copy");
			assert.ok(!/ (id|class)=/.test(html), "no id or class in the copy");
			assert.match(html, /^<div><strong>Hello<\/strong><\/div><div><br><\/div>\n<div>This is a test\.<\/div><div><br><\/div>/);
			assert.match(html, /<div>From Dec 2024 to Apr 2025, time spent halved,<br>\nsecond line/, "breaks: true");
			assert.match(html, /<ul style="margin:0">/, "blocks that keep their tag carry margin:0");
			assert.match(html, /<li>☑ done<\/li>/, "task box as a character");
			assert.match(html, /<blockquote style="margin:0;[^"]*">\n<div>quoted line<\/div><div><br><\/div>\n<div>second quote para<\/div>\n<\/blockquote>/);
			assert.match(html, /<th style="[^"]*font-weight:bold;text-align:right">b<\/th>/, "authored alignment kept");
			assert.ok(!html.includes("attach in client"), "placeholder omitted from the copy");
			assert.ok(!html.includes("<img"), "no image in the copy");
			assert.ok(!/<div><br><\/div>\s*<div><br><\/div>/.test(html), "removing the image line leaves one blank line, not two");
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
					"- two",
					"  - nested",
					"- [x] done",
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
			assert.match(selection["text/html"], /^<div>is a test\.<\/div><div><br><\/div>\n<div>From Dec/);
			assert.match(selection["text/html"], /<ul style="margin:0">\n<li>on<\/li><\/ul>$/, "selection keeps its list");
			assert.equal(selection["text/plain"], "is a test.\n\nFrom Dec 2024 to Apr 2025, time spent halved,\nsecond line of same paragraph (second picture).\n\n- on\n");
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
			assert.equal(title, "Notes");
			assert.deepEqual(toc, ["#", "#first", "#second", "#third"]);
			// Served over http, a relative image is remote too; data: is the
			// one kind of local image the harness can show staying put.
			assert.deepEqual(imgs, ["data:image/png;base64,iVBORw0KGgo="], "the remote image is not on the page");
			assert.ok(links.includes("https://evil.example/pixel.png"), "the remote image became a link");
			assert.ok(!links.some((h) => /^javascript:/i.test(h)), "javascript: link stripped");
			assert.equal(copied.text, "print('hi')", "trailing newline trimmed");
			assert.equal(task, true);
		},
	},
};

// ---------------------------------------------------------------- Run
const only = process.argv[2];
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
