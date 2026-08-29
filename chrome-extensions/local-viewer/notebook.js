// Jupyter .ipynb → HTML. Shared verbatim by the extension (content.js, as a
// content script) and the exporter (md2html.mjs, loaded into its vm sandbox
// the same way markdown-it is) so a notebook cannot render two ways. It is a
// plain script assigning one global on purpose: content scripts have no module
// loader, and the sandbox has no `require`.
//
// It returns an HTML STRING, not DOM, because the exporter runs in Node where
// there is no DOM. That is also why the string-level clean below is not the
// real sanitizer: content.js parses this into an inert <template> and runs a
// DOM allowlist over it, which is the pass that actually decides what renders.
// See SANITIZE in content.js. The exporter deliberately stops at the string
// clean — an export is your own document, published on purpose.
(() => {
	// A notebook cell's `source`/`text`/mime payload may be a string or an
	// array of lines; nbformat allows both and pandas/ipykernel emit both.
	const txt = (v) => (Array.isArray(v) ? v.join("") : typeof v === "string" ? v : "");

	const esc = (s) =>
		s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

	// Structural pre-clean. Removes the constructs that carry executable or
	// network-reaching payloads before the markup is ever parsed. content.js
	// re-checks all of this against an element allowlist afterwards; this pass
	// exists so the exporter, which has no DOM, is not defenceless.
	const preClean = (html) =>
		html
			.replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
			.replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*\/?>/gi, "")
			.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
			.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
			.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
			.replace(/\sstyle\s*=\s*"[^"]*"/gi, "")
			.replace(/\sstyle\s*=\s*'[^']*'/gi, "");

	// ---------------------------------------------------------------- tables
	// pandas emits the column-index name as its own header row — <th>month</th>
	// followed by empty <th>s — which renders as a blank band under the labels.
	// Fold it into the first column's header instead.
	const tidyHead = (html) =>
		html.replace(/<thead>([\s\S]*?)<\/thead>/i, (whole, inner) => {
			const rows = inner.match(/<tr[\s\S]*?<\/tr>/gi) || [];
			const keep = [];
			let indexName = "";
			for (const row of rows) {
				const cells = row.match(/<th\b[^>]*>[\s\S]*?<\/th>/gi) || [];
				const text = cells.map((c) => c.replace(/<[^>]*>/g, "").trim());
				if (text.length > 1 && text[0] && text.slice(1).every((t) => !t)) {
					indexName = text[0];
					continue;
				}
				keep.push(row);
			}
			if (!indexName || !keep.length) return whole;
			const last = keep.length - 1;
			keep[last] = keep[last].replace(/<th(\b[^>]*)>[\s\S]*?<\/th>/i, `<th$1>${indexName}</th>`);
			return `<thead>${keep.join("")}</thead>`;
		});

	// Alignment is a property of the column, decided from the body rows, and
	// the header then follows its own column. Deciding per cell instead is what
	// produces a right-aligned header sitting over left-aligned text.
	const alignColumns = (html) =>
		html.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
			const body = (table.match(/<tbody>[\s\S]*?<\/tbody>/i) || [""])[0];
			const cellsOf = (row) => row.match(/<(td|th)\b[^>]*>[\s\S]*?<\/\1>/gi) || [];
			const stat = [];
			for (const row of body.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
				cellsOf(row).forEach((cell, i) => {
					const text = cell.replace(/<[^>]*>/g, "").trim();
					stat[i] = stat[i] || { numeric: 0, total: 0 };
					stat[i].total++;
					// NaN and None are numeric columns wearing a word.
					if (/^-?[\d,]*\.?\d+\s*%?$/.test(text) || /^(nan|none|null)$/i.test(text)) {
						stat[i].numeric++;
					}
				});
			}
			const isNum = stat.map((c) => !!c && c.total > 0 && c.numeric / c.total > 0.6);
			const mark = (row) => {
				let i = 0;
				return row.replace(/<(td|th)(\b[^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, inner) =>
					isNum[i++] ? `<${tag}${attrs} class="num">${inner}</${tag}>` : m
				);
			};
			let out = table.replace(/<tbody>[\s\S]*?<\/tbody>/i, (b) =>
				b.replace(/<tr[\s\S]*?<\/tr>/gi, mark)
			);
			// Only the last header row lines up with the columns; the rows above
			// it are MultiIndex spanners.
			out = out.replace(/<thead>([\s\S]*?)<\/thead>/i, (m, inner) => {
				const rows = inner.match(/<tr[\s\S]*?<\/tr>/gi) || [];
				if (rows.length) rows[rows.length - 1] = mark(rows[rows.length - 1]);
				return `<thead>${rows.join("")}</thead>`;
			});
			// A 46-character snake_case label blows its column out to 400px and
			// will not wrap on its own. <wbr> offers a break at each underscore.
			return out.replace(/<th(\b[^>]*)>([^<]*)<\/th>/gi, (m, attrs, text) =>
				text.includes("_") ? `<th${attrs}>${text.replace(/_/g, "_<wbr>")}</th>` : m
			);
		});

	// ----------------------------------------------------------------- ANSI
	// Tracebacks arrive wrapped in SGR escapes. Keep the eight basic colours
	// and bold; drop everything else, including the cursor-movement sequences
	// that would otherwise show up as literal gibberish.
	const ANSI = {
		30: "k", 31: "r", 32: "g", 33: "y", 34: "b", 35: "m", 36: "c", 37: "w",
		90: "k", 91: "r", 92: "g", 93: "y", 94: "b", 95: "m", 96: "c", 97: "w",
	};
	const ansiToHtml = (raw) => {
		let out = "";
		let open = 0;
		const parts = raw.split(/\[([0-9;]*)m/);
		for (let i = 0; i < parts.length; i++) {
			if (i % 2 === 0) {
				out += esc(parts[i]);
				continue;
			}
			const codes = parts[i].split(";").filter(Boolean).map(Number);
			if (!codes.length || codes.includes(0)) {
				out += "</span>".repeat(open);
				open = 0;
				continue;
			}
			const classes = [];
			for (const code of codes) {
				if (code === 1) classes.push("ansi-bold");
				else if (ANSI[code]) classes.push("ansi-" + ANSI[code]);
			}
			if (!classes.length) continue;
			out += `<span class="${classes.join(" ")}">`;
			open++;
		}
		return out + "</span>".repeat(open) + "";
	};
	// Escapes that are not colour (cursor moves, erase-line) would print as
	// literal noise once the colour ones are consumed.
	const stripAnsi = (s) => s.replace(/\[[0-9;?]*[A-Za-z]/g, "");

	// --------------------------------------------------------------- outputs
	// Richest first. text/html is the reason this view exists (a DataFrame);
	// SVG deliberately sits BELOW the raster types and is emitted as an <img>
	// data: URI, never inline — an <img> loads SVG in the secure static mode
	// where script does not run and subresources are not fetched, which is the
	// same reasoning content.js already applies to markdown images.
	const MIMES = ["text/html", "image/png", "image/jpeg", "image/svg+xml", "text/plain"];

	const renderData = (data, b64) => {
		for (const mime of MIMES) {
			if (!(mime in data)) continue;
			const payload = txt(data[mime]);
			if (mime === "text/html") {
				return `<div class="out-html">${alignColumns(tidyHead(preClean(payload)))}</div>`;
			}
			if (mime === "image/svg+xml") {
				// nbformat lets svg arrive as raw markup or as base64; only the
				// latter is safe to pass through untouched.
				const looksB64 = /^[A-Za-z0-9+/=\s]+$/.test(payload) && payload.includes("=");
				const encoded = looksB64 ? payload.replace(/\s+/g, "") : b64(payload);
				return `<img class="out-img" alt="output image" src="data:image/svg+xml;base64,${encoded}">`;
			}
			if (mime.startsWith("image/")) {
				return `<img class="out-img" alt="output image" src="data:${mime};base64,${payload.replace(/\s+/g, "")}">`;
			}
			return `<pre class="out-stream">${esc(stripAnsi(payload))}</pre>`;
		}
		// A widget needs a live kernel and a comm channel; from a file there is
		// nothing to render and never will be. Say so rather than show nothing.
		if (Object.keys(data).some((m) => m.startsWith("application/vnd.jupyter.widget"))) {
			return '<div class="out-note">interactive widget — needs a running kernel</div>';
		}
		return "";
	};

	const renderOutput = (output, b64) => {
		switch (output.output_type) {
			case "stream": {
				const cls = output.name === "stderr" ? "out-stream stderr" : "out-stream";
				return `<pre class="${cls}">${esc(stripAnsi(txt(output.text)))}</pre>`;
			}
			case "error": {
				const trace = (output.traceback || []).map(txt).join("\n");
				const body = trace || `${output.ename || "Error"}: ${output.evalue || ""}`;
				return `<pre class="out-stream stderr">${ansiToHtml(stripAnsi(body))}</pre>`;
			}
			case "execute_result":
			case "display_data":
				return renderData(output.data || {}, b64);
			default:
				return "";
		}
	};

	// ----------------------------------------------------------------- cells
	const COPY_CODE = '<button type="button" class="copy" aria-label="Copy code" title="Copy">%ICON%</button>';
	const COPY_OUT = '<button type="button" class="copy out" aria-label="Copy result" title="Copy result">%ICON%</button>';

	const render = (source, deps) => {
		// b64 is injected rather than assumed: the extension has btoa, the
		// exporter's vm sandbox has neither btoa nor Buffer unless handed one.
		const { md, hljs, copyIcon, b64 } = deps;
		let nb;
		try {
			nb = JSON.parse(source);
		} catch {
			return null; // mid-save or not a notebook; the caller keeps its last good render
		}
		if (!nb || !Array.isArray(nb.cells)) return null;

		const lang =
			(nb.metadata && nb.metadata.kernelspec && nb.metadata.kernelspec.language) ||
			(nb.metadata && nb.metadata.language_info && nb.metadata.language_info.name) ||
			"python";
		const known = hljs && hljs.getLanguage(lang) ? lang : null;
		const codeButton = copyIcon ? COPY_CODE.replace("%ICON%", copyIcon) : "";
		const outButton = copyIcon ? COPY_OUT.replace("%ICON%", copyIcon) : "";

		const parts = [];
		for (const cell of nb.cells) {
			const src = txt(cell.source);
			if (cell.cell_type === "markdown") {
				if (src.trim()) parts.push(`<section class="md">${md.render(src)}</section>`);
				continue;
			}
			if (cell.cell_type !== "code") continue; // raw cells are input, not reading matter
			const code = known
				? hljs.highlight(src, { language: known, ignoreIllegals: true }).value
				: esc(src);
			const outputs = (cell.outputs || [])
				.map((o) => renderOutput(o, b64))
				.filter(Boolean)
				.join("");
			parts.push(
				'<section class="cell">' +
					`<div class="codeblock">${codeButton}<pre><code class="hljs">${code}</code></pre></div>` +
					(outputs ? `<div class="output">${outButton}${outputs}</div>` : "") +
					"</section>"
			);
		}
		return parts.join("\n");
	};

	const api = { render };
	if (typeof window !== "undefined") window.notebookRender = api;
	if (typeof globalThis !== "undefined") globalThis.notebookRender = api;
})();
