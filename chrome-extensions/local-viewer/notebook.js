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
	// Entity-decoding enough to judge a URL scheme. "java&#x73;cript:" is
	// decoded by the parser but not by a naive string test, and an exported
	// file has neither the DOM protocol allowlist nor a CSP behind it — so a
	// plausible-looking link would run notebook-controlled script on click.
	const NAMED = { colon: ":", tab: "\t", newline: "\n", sol: "/", lpar: "(", rpar: ")" };
	// A browser substitutes U+FFFD for an out-of-range numeric entity. Throwing
	// instead would fail the whole render, which the caller reads as "not a
	// notebook" — one bad entity would hide an otherwise readable file.
	const codePoint = (n) => {
		try {
			return String.fromCodePoint(n);
		} catch {
			return "\ufffd";
		}
	};
	const decodeEntities = (v) =>
		v
			.replace(/&#x([0-9a-f]+);?/gi, (m, hex) => codePoint(parseInt(hex, 16)))
			.replace(/&#(\d+);?/g, (m, dec) => codePoint(Number(dec)))
			.replace(/&([a-z]+);?/gi, (m, name) =>
				Object.prototype.hasOwnProperty.call(NAMED, name.toLowerCase())
					? NAMED[name.toLowerCase()]
					: m
			);

	const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "file:"]);
	// No scheme at all means relative, and relative is safe. Whitespace and
	// control characters are dropped first: the parser ignores them inside a
	// scheme, so "java\tscript:" is live.
	const safeHref = (raw) => {
		const flat = decodeEntities(raw)
			.replace(/[\u0000-\u0020\u007f]+/g, "")
			.toLowerCase();
		const scheme = /^([a-z][a-z0-9+.\-]*):/.exec(flat);
		return !scheme || SAFE_SCHEMES.has(scheme[1] + ":");
	};

	// Attribute work happens ONLY inside a start tag. Run loose over the whole
	// string these patterns eat ordinary prose: "<p>Keep style=compact and
	// onclick=demo</p>" lost both words. The matcher tolerates a quoted
	// attribute value containing ">".
	const TAG = /<[a-z][a-z0-9:-]*(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
	const cleanTag = (tag) =>
		tag
			// [\s/] not \s: the parser treats a slash after a tag name as an
			// attribute delimiter, so <svg/onload="..."> carries a live handler.
			.replace(/[\s/]on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, " ")
			.replace(/[\s/]style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, " ")
			// pandas ships <table border="1">, which Chrome draws as a 1px
			// outset frame. The extension drops it with the attribute
			// allowlist; the exporter has only this pass.
			.replace(/[\s/]border\s*=\s*"?\d+"?/gi, " ")
			.replace(
				/([\s/]href\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
				(m, lead, dq, sq, bare) => {
					const value = dq !== undefined ? dq : sq !== undefined ? sq : bare;
					return safeHref(value) ? m : " ";
				}
			);

	// Elements that change how the PARSER reads what follows. <plaintext> has
	// no end tag and turns everything after it — later cells, and in an export
	// the closing markup — into text. Sanitising the parsed tree cannot undo
	// that, because by then the structure is already gone.
	const DROP =
		"script|style|iframe|object|embed|link|meta|base|form|plaintext|xmp|listing|" +
		"noembed|noframes|noscript|textarea|title|template|svg|math|animate|set";

	// A "<" with no closing ">" is not a tag yet — but the markup this output
	// is concatenated into supplies one, so an unterminated
	// `<img src=x onerror="...">` would be completed by the wrapper's own
	// </div> and come back to life. Anything after the last ">" that still
	// contains "<" is escaped rather than emitted.
	const sealTail = (html) => {
		const cut = html.lastIndexOf(">");
		const head = cut === -1 ? "" : html.slice(0, cut + 1);
		const tail = cut === -1 ? html : html.slice(cut + 1);
		return tail.includes("<") ? head + tail.replace(/</g, "&lt;") : html;
	};

	const preClean = (html) =>
		sealTail(html)
			.replace(new RegExp("<\\s*(" + DROP + ")\\b[\\s\\S]*?<\\s*/\\s*\\1\\s*>", "gi"), "")
			.replace(new RegExp("<\\s*/?\\s*(" + DROP + ")\\b[^>]*>", "gi"), "")
			.replace(TAG, cleanTag);

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
			// Merged into any existing class rather than appended as a second
			// class attribute: the parser keeps only the first, so emitting two
			// silently loses `num` on exactly the cells that already have one.
			const mark = (row) => {
				let i = 0;
				return row.replace(/<(td|th)(\b[^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, inner) => {
					if (!isNum[i++]) return m;
					const merged = /\sclass\s*=\s*"([^"]*)"/i.test(attrs)
						? attrs.replace(/\sclass\s*=\s*"([^"]*)"/i, (a, cls) => ` class="${cls} num"`)
						: `${attrs} class="num"`;
					return `<${tag}${merged}>${inner}</${tag}>`;
				});
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
	// Escapes that are not colour would print as literal noise.
	const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

	const ansiToHtml = (raw) => {
		let out = "";
		let open = 0;
		const parts = raw.split(/\x1b\[([0-9;]*)m/);
		for (let i = 0; i < parts.length; i++) {
			if (i % 2 === 0) {
				// Non-SGR escapes (cursor moves, erase-line) would print as
				// literal noise; strip them here, per text run, rather than
				// up front where they would take the colour codes with them.
				out += esc(stripAnsi(parts[i]));
				continue;
			}
			// Codes apply in order, and a reset can be followed by more in the
			// same sequence — "0;31" is reset-then-red, which is exactly what a
			// Python traceback emits. Treating any 0 as "this whole sequence is
			// a reset" swallowed the colour that came after it.
			const codes = parts[i].split(";").filter((c) => c !== "").map(Number);
			const classes = [];
			for (const code of codes.length ? codes : [0]) {
				if (code === 0) {
					out += "</span>".repeat(open);
					open = 0;
					classes.length = 0;
				} else if (code === 1) {
					classes.push("ansi-bold");
				} else if (ANSI[code]) {
					classes.push("ansi-" + ANSI[code]);
				}
			}
			if (!classes.length) continue;
			out += `<span class="${classes.join(" ")}">`;
			open++;
		}
		return out + "</span>".repeat(open) + "";
	};
	// --------------------------------------------------------------- outputs
	// Richest first. text/html is the reason this view exists (a DataFrame);
	// SVG deliberately sits BELOW the raster types and is emitted as an <img>
	// data: URI, never inline — an <img> loads SVG in the secure static mode
	// where script does not run and subresources are not fetched, which is the
	// same reasoning content.js already applies to markdown images.
	const MIMES = [
		"text/html",
		"image/png",
		"image/jpeg",
		"image/gif",
		"image/webp",
		"image/avif",
		"image/svg+xml",
		"text/plain",
	];

	// Strict: length a multiple of 4, only the base64 alphabet, padding last.
	const isBase64 = (v) =>
		v.length > 0 && v.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(v);

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
				const stripped = payload.replace(/\s+/g, "");
				const encoded = isBase64(stripped) ? stripped : b64(payload);
				return `<img class="out-img" alt="output image" src="data:image/svg+xml;base64,${encoded}">`;
			}
			if (mime.startsWith("image/")) {
				const encoded = payload.replace(/\s+/g, "");
				// Validated, not escaped: base64 has a fixed alphabet, so
				// anything outside it is not an image, and interpolating it
				// would let a payload containing a quote close the src
				// attribute and write its own markup. The extension's CSP
				// would stop the script; an export has no CSP.
				if (!isBase64(encoded)) continue;
				return `<img class="out-img" alt="output image" src="data:${mime};base64,${encoded}">`;
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
				return `<pre class="out-stream stderr">${ansiToHtml(body)}</pre>`;
			}
			case "execute_result":
			case "display_data":
				return renderData(output.data || {}, b64);
			default:
				return "";
		}
	};

	// A markdown cell may reference an image the notebook carries itself:
	// ![alt](attachment:plot.png), with the bytes in cell.attachments. Left
	// unresolved the extension turns it into a plain link and the exporter
	// writes a broken image, so the picture is missing from both readers.
	const resolveAttachments = (src, attachments) => {
		if (!attachments || typeof attachments !== "object") return src;
		return src.replace(/attachment:([^)\s"'>\]]+)/g, (whole, rawName) => {
			let name = rawName;
			try {
				name = decodeURIComponent(rawName);
			} catch {}
			const bundle = attachments[name] || attachments[rawName];
			if (!bundle || typeof bundle !== "object") return whole;
			for (const mime of Object.keys(bundle)) {
				// Restricted to what the callers' validateLink actually passes:
				// offering a mime markdown-it will refuse renders the literal
				// ![alt](data:…) source text instead of an image.
				if (!/^image\/(gif|png|jpeg|webp|avif|svg\+xml)$/.test(mime)) continue;
				const data = txt(bundle[mime]).replace(/\s+/g, "");
				// Same rule as an output image: outside the base64 alphabet it
				// is not an image, and interpolating it would write markup.
				if (isBase64(data)) return `data:${mime};base64,${data}`;
			}
			return whole;
		});
	};

	// ----------------------------------------------------------------- cells
	const render = (source, deps) => {
		try {
			return build(source, deps);
		} catch {
			// Same contract as a parse failure: the caller keeps what it has.
			return null;
		}
	};

	const build = (source, deps) => {
		// b64 is injected rather than assumed: the extension has btoa, the
		// exporter's vm sandbox has neither btoa nor Buffer unless handed one.
		const { md, hljs, b64 } = deps;
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
		const parts = [];
		for (const cell of nb.cells) {
			// A notebook is a file on disk that anything may have written.
			// A null or non-object entry is legal JSON and must not take the
			// refresh loop down with it.
			if (!cell || typeof cell !== "object") continue;
			const src = txt(cell.source);
			if (cell.cell_type === "markdown") {
				if (src.trim()) {
					const resolved = resolveAttachments(src, cell.attachments);
					parts.push(`<section class="md">${md.render(resolved)}</section>`);
				}
				continue;
			}
			if (cell.cell_type !== "code") continue; // raw cells are input, not reading matter
			const code = known
				? hljs.highlight(src, { language: known, ignoreIllegals: true }).value
				: esc(src);
			const list = Array.isArray(cell.outputs) ? cell.outputs : [];
			const rendered = list
				.filter((o) => o && typeof o === "object")
				.map((o) => renderOutput(o, b64))
				.filter(Boolean);
			const outputs = rendered.join("");
			// Marked, not decided here: the caller adds the control, and only
			// where there is something to put on the clipboard. An image or a
			// widget placeholder would copy an empty string and still flash
			// "Copied".
			const copyable = /<table|<pre/.test(outputs);
			parts.push(
				'<section class="cell">' +
					`<div class="codeblock"><pre><code class="hljs">${code}</code></pre></div>` +
					(outputs
						? `<div class="output${copyable ? " copyable" : ""}">${outputs}</div>`
						: "") +
					"</section>"
			);
		}
		return parts.join("\n");
	};

	const api = { render };
	if (typeof window !== "undefined") window.notebookRender = api;
	if (typeof globalThis !== "undefined") globalThis.notebookRender = api;
})();
