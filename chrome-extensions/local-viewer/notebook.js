// Jupyter .ipynb → HTML. Shared verbatim by the extension (content.js, as a
// content script) and the exporter (md2html.mjs, loaded into its vm sandbox
// the same way markdown-it is) so a notebook cannot render two ways. It is a
// plain script assigning one global on purpose: content scripts have no module
// loader, and the sandbox has no `require`.
//
// Two halves, and the split is the security design:
//
//   render()  runs anywhere, DOM or not, and returns an HTML STRING — the
//             exporter runs in Node, where there is no parser to hand it. So
//             it never inlines untrusted markup: an output's text/html goes
//             out base64-encoded in a data attribute, an alphabet that cannot
//             end an attribute or change how anything around it parses.
//
//   hydrate() runs in a browser, on the built tree, and is where that payload
//             is expanded — in a real parser, inside an inert <template>, and
//             through an element/attribute allowlist. Both readers call it:
//             the extension directly, the exporter by serialising the
//             function into the page it writes. One boundary, one copy.
//
// The earlier design sanitised the string instead. Four independent review
// passes each found a different way through it — a slash where a space was
// expected, an entity-encoded scheme, an unterminated tag completed by the
// wrapper's own </div>. That is the known failure mode of matching markup
// with regexes, and this split removes the need to try.
(() => {
	// A notebook cell's `source`/`text`/mime payload may be a string or an
	// array of lines; nbformat allows both and pandas/ipykernel emit both.
	const txt = (v) => (Array.isArray(v) ? v.join("") : typeof v === "string" ? v : "");

	const esc = (s) =>
		s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

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
				// Boxed, not inlined. base64 has no "<", no quote and no "&",
				// so this payload cannot end the attribute, close the wrapper
				// or alter the parse of a single character around it. It is
				// opened by hydrate(), which has a parser to open it with.
				return `<div class="out-html" data-nb-html="${b64(payload)}"></div>`;
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
			// Which outputs are worth a copy button is decided by hydrate(),
			// from the built tree: a table arrives here as opaque base64, so
			// there is nothing to look at from this side any more.
			parts.push(
				'<section class="cell">' +
					`<div class="codeblock"><pre><code class="hljs">${code}</code></pre></div>` +
					(outputs ? `<div class="output">${outputs}</div>` : "") +
					"</section>"
			);
		}
		return parts.join("\n");
	};

	// ------------------------------------------------------------- hydrate
	// The security boundary, and the reason nothing above tries to sanitise
	// markup with regexes any more. An output's text/html is emitted as
	// base64 in a data attribute — an alphabet with no "<", no quote and no
	// "&", so it cannot end an attribute, close a tag or change how the
	// surrounding markup parses. It is expanded HERE, in a real parser,
	// inside an inert <template>, and passed through an element/attribute
	// allowlist before it is ever attached to a document.
	//
	// Written as one self-contained function on purpose: the exporter has no
	// DOM at build time, so md2html.mjs serialises this very function into
	// the exported page with toString() and calls it on load. That is what
	// gives an export the same allowlist the extension has, instead of the
	// string-level clean it used to settle for — so it must not close over
	// anything outside itself.
	const hydrate = (root) => {
		// Anything not named here is UNWRAPPED — its text survives — so a
		// table inside an unknown element still reads. Only the elements that
		// carry their payload in their own text are removed outright.
		const ALLOWED_TAGS = new Set([
			"A", "ABBR", "B", "BLOCKQUOTE", "BR", "CAPTION", "CODE", "COL", "COLGROUP",
			"DD", "DIV", "DL", "DT", "EM", "H1", "H2", "H3", "H4", "H5", "H6", "HR",
			"I", "IMG", "LI", "OL", "P", "PRE", "S", "SECTION", "SMALL", "SPAN",
			"STRONG", "SUB", "SUP", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD",
			"TR", "U", "UL", "WBR",
		]);
		const VOID_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "TITLE", "TEXTAREA"]);
		// No `style`: a style attribute reaches the network through url(),
		// which is the one thing opening a local file must never do.
		const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title", "colspan", "rowspan", "class"]);
		// The scaffolding pass allows one more. Heading ids are what the ToC
		// links to, and the exporter bakes them into the markup before this
		// ever runs — without them every ToC entry in an exported notebook
		// scrolls nowhere. They stay out of the payload set on purpose: an id
		// chosen by an output can shadow a global (DOM clobbering) and can
		// hijack a ToC link by colliding with a real heading's.
		const TRUSTED_ATTRS = new Set([...ALLOWED_ATTRS, "id"]);
		// Schemes where following a link is inert. data: is absent on purpose:
		// navigating to an SVG opens it as a document, where script DOES run.
		const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "file:"]);
		// An <img> renders SVG in the secure static mode — no script, no
		// subresource loads — so data: images are allowed where data: links
		// are not.
		const OK_DATA = /^data:image\/(gif|png|jpeg|webp|avif|svg\+xml)[;,]/i;

		const protocolOf = (value) => {
			try {
				return new URL(value, document.baseURI).protocol;
			} catch {
				return "";
			}
		};

		const sanitize = (scope, allowed) => {
			for (const el of [...scope.querySelectorAll("*")]) {
				if (!ALLOWED_TAGS.has(el.tagName)) {
					if (VOID_TAGS.has(el.tagName)) el.remove();
					else el.replaceWith(...el.childNodes);
					continue;
				}
				for (const attr of [...el.attributes]) {
					if (!allowed.has(attr.name.toLowerCase())) {
						el.removeAttribute(attr.name);
					}
				}
				// URL attributes are checked by the URL parser rather than by
				// matching text: "java&#x73;cript:" and "java\tscript:" are
				// both live once the markup parser has decoded them, and both
				// are already decoded by the time this sees them.
				const href = el.getAttribute("href");
				if (href !== null && !SAFE_PROTOCOLS.has(protocolOf(href))) {
					el.removeAttribute("href");
				}
				const src = el.getAttribute("src");
				if (src !== null) {
					const proto = protocolOf(src);
					const ok = proto === "data:" ? OK_DATA.test(src.trim()) : SAFE_PROTOCOLS.has(proto);
					if (!ok) el.removeAttribute("src");
				}
			}
		};

		// pandas emits the column-index name as its own header row —
		// <th>month</th> followed by empty <th>s — which renders as a blank
		// band under the labels. Fold it into the first column's header.
		const tidyHead = (table) => {
			const head = table.tHead;
			if (!head) return;
			const rows = [...head.rows];
			let nameRow = null;
			for (const row of rows) {
				const text = [...row.cells].map((c) => c.textContent.trim());
				if (text.length > 1 && text[0] && text.slice(1).every((t) => !t)) nameRow = row;
			}
			const keep = rows.filter((row) => row !== nameRow);
			if (!nameRow || !keep.length) return;
			const name = nameRow.cells[0].textContent.trim();
			nameRow.remove();
			const last = keep[keep.length - 1].cells[0];
			if (last) last.textContent = name;
		};

		// Alignment is a property of the COLUMN, decided from the body rows,
		// and the header then follows its own column. Deciding per cell is
		// what produces a right-aligned header over left-aligned text.
		const NUMERIC = /^-?[\d,]*\.?\d+\s*%?$/;
		const NULLISH = /^(nan|none|null)$/i; // a numeric column wearing a word
		const alignColumns = (table) => {
			const body = table.tBodies[0];
			if (!body) return;
			const stat = [];
			for (const row of body.rows) {
				[...row.cells].forEach((cell, i) => {
					const text = cell.textContent.trim();
					stat[i] = stat[i] || { numeric: 0, total: 0 };
					stat[i].total++;
					if (NUMERIC.test(text) || NULLISH.test(text)) stat[i].numeric++;
				});
			}
			const isNum = stat.map((c) => !!c && c.total > 0 && c.numeric / c.total > 0.6);
			const mark = (row) => {
				[...row.cells].forEach((cell, i) => {
					if (isNum[i]) cell.classList.add("num");
				});
			};
			for (const row of body.rows) mark(row);
			// Only the last header row lines up with the columns; the rows
			// above it are MultiIndex spanners.
			const head = table.tHead;
			if (head && head.rows.length) mark(head.rows[head.rows.length - 1]);
		};

		// A 46-character snake_case label blows its column out to 400px and
		// will not wrap on its own. <wbr> offers a break at each underscore.
		const breakLabels = (table) => {
			for (const th of table.querySelectorAll("th")) {
				if (th.children.length) continue; // not a plain-text label
				const text = th.textContent;
				if (!text.includes("_")) continue;
				th.textContent = "";
				text.split("_").forEach((part, i) => {
					if (i) {
						th.append("_");
						th.append(document.createElement("wbr"));
					}
					th.append(part);
				});
			}
		};

		const decode = (value) => {
			const binary = atob(value);
			const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
			return new TextDecoder().decode(bytes);
		};

		for (const host of [...root.querySelectorAll("[data-nb-html]")]) {
			const encoded = host.getAttribute("data-nb-html");
			host.removeAttribute("data-nb-html");
			const template = document.createElement("template");
			try {
				template.innerHTML = decode(encoded);
			} catch {
				continue; // not decodable; an empty output beats a broken page
			}
			// Sanitised BEFORE it is attached. In the exporter's page `root`
			// is the live <main>, and attaching first would let a remote
			// <img> phone home in the instant before the allowlist ran.
			sanitize(template.content, ALLOWED_ATTRS);
			for (const table of template.content.querySelectorAll("table")) {
				tidyHead(table);
				alignColumns(table);
				breakLabels(table);
			}
			host.replaceChildren(template.content);
		}

		// The scaffolding is built from escaped text and is trusted by
		// construction; this second pass is the cheap outer net that means a
		// mistake up there is still not a hole down here. It runs AFTER the
		// payloads, so its wider attribute set can never reach one: by now
		// every untrusted subtree has already been through the narrow pass.
		sanitize(root, TRUSTED_ATTRS);

		// Decided from the built tree, not guessed from a string: only mark
		// an output that has something worth putting on the clipboard. An
		// image or a widget placeholder would copy "" and still flash Copied.
		for (const box of root.querySelectorAll(".output")) {
			if (box.querySelector("table, pre")) box.classList.add("copyable");
		}
	};

	const api = { render, hydrate };
	if (typeof window !== "undefined") window.notebookRender = api;
	if (typeof globalThis !== "undefined") globalThis.notebookRender = api;
})();
