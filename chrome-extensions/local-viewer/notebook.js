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
	// Colons as well as semicolons: "38:5:31" is the T.416 spelling of the
	// same extended colour, and a class that knew only ";" left the whole
	// escape on screen as literal control-sequence text.
	const stripAnsi = (s) => s.replace(/\x1b\[[0-9;:?]*[A-Za-z]/g, "");

	const ansiToHtml = (raw) => {
		// State, not a stack of open spans. A traceback resets selectively —
		// 39 restores the default foreground and 22 normal intensity — and a
		// model that only understands "close everything" (code 0) leaves the
		// rest of the traceback inside whichever colour was open, which is
		// what turned everything after an IPython \x1b[39m red.
		let bold = false;
		let colour = null;
		let out = "";
		const parts = raw.split(/\x1b\[([0-9;:]*)m/);
		for (let i = 0; i < parts.length; i++) {
			if (i % 2 === 0) {
				// Non-SGR escapes (cursor moves, erase-line) would print as
				// literal noise; strip them here, per text run, rather than
				// up front where they would take the colour codes with them.
				const text = esc(stripAnsi(parts[i]));
				if (!text) continue;
				const classes = [bold && "ansi-bold", colour && "ansi-" + colour]
					.filter(Boolean)
					.join(" ");
				out += classes ? `<span class="${classes}">${text}</span>` : text;
				continue;
			}
			// Codes apply in order, and a reset can be followed by more in the
			// same sequence — "0;31" is reset-then-red, which is exactly what a
			// Python traceback emits. Treating any 0 as "this whole sequence is
			// a reset" swallowed the colour that came after it.
			// A colon-form parameter stays one token, so Number() makes it NaN
			// and no branch claims it — an unsupported colour is ignored,
			// which is what the semicolon form does too.
			const codes = parts[i].split(";").filter((c) => c !== "").map(Number);
			for (let c = 0; c < (codes.length ? codes.length : 1); c++) {
				const code = codes.length ? codes[c] : 0;
				// 38 and 48 select an extended colour and CONSUME what follows
				// — "48;5;31" is one indexed-background instruction, not a
				// background followed by red. Read as three commands it
				// turned the text red. Neither form is supported, so skip the
				// whole sequence rather than obey its arguments.
				if (code === 38 || code === 48) {
					c += codes[c + 1] === 2 ? 4 : codes[c + 1] === 5 ? 2 : 0;
					continue;
				}
				if (code === 0) {
					bold = false;
					colour = null;
				} else if (code === 1) {
					bold = true;
				} else if (code === 22) {
					bold = false;
				} else if (code === 39) {
					colour = null;
				} else if (ANSI[code]) {
					colour = ANSI[code];
				}
			}
		}
		return out;
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
		// Asked BEFORE the mime loop: a widget bundle also carries a
		// text/plain repr ("IntSlider(value=0)"), and text/plain is in the
		// loop, so checking afterwards meant this branch never ran for an
		// ordinary widget — the reader got the repr instead of the reason.
		if (Object.keys(data).some((m) => m.startsWith("application/vnd.jupyter.widget"))) {
			// A widget needs a live kernel and a comm channel; from a file
			// there is nothing to render and never will be. Say so rather
			// than show the constructor call it happens to print.
			return '<div class="out-note">interactive widget — needs a running kernel</div>';
		}
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
	//
	// Applied to markdown-it's OUTPUT rather than to the cell source, which
	// is what makes it exact. Deciding from the source means deciding what is
	// an image, and every attempt at that missed a context: a fence, then
	// inline code, then an indented block, then an escaped "!", then an
	// ordinary [link](attachment:…) that is not an image at all. markdown-it
	// has already made that judgement by the time this runs — only a real
	// image token is an <img src="…"> — so the question does not arise.
	//
	// Safe as a pattern because this markup is markdown-it's own: html:false,
	// attribute values escaped, so "attachment:" inside a <code> sample can
	// never appear where this matches. markdown-it also percent-encodes the
	// destination, which attachmentData decodes.
	const ATTACH_SRC = /(<img\b[^>]*\ssrc=")attachment:([^"]*)(")/gi;

	// Reading a value back out of an attribute means undoing what writing it
	// in did. markdown-it percent-encodes the destination and THEN escapes it
	// for the attribute, so an attachment called "a&b.png" arrives here as
	// "a&amp;b.png" and matched no key. Unescaped in that order, &amp; last,
	// so "&amp;lt;" comes back as "&lt;" rather than as "<".
	const unescapeAttr = (value) =>
		value
			.replace(/&quot;/g, '"')
			.replace(/&#0*39;/g, "'")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&");

	const resolveAttachments = (rendered, attachments) => {
		if (!attachments || typeof attachments !== "object") return rendered;
		return rendered.replace(ATTACH_SRC, (whole, lead, rawName, tail) => {
			const data = attachmentData(unescapeAttr(rawName), attachments);
			return data === null ? whole : lead + data + tail;
		});
	};

	const attachmentData = (rawName, attachments) => {
		let name = rawName;
		try {
			name = decodeURIComponent(rawName);
		} catch {}
		const bundle = attachments[name] || attachments[rawName];
		if (!bundle || typeof bundle !== "object") return null;
		for (const mime of Object.keys(bundle)) {
			// Restricted to what the callers' validateLink actually passes:
			// offering a mime markdown-it will refuse renders the literal
			// ![alt](data:…) source text instead of an image.
			if (!/^image\/(gif|png|jpeg|webp|avif|svg\+xml)$/.test(mime)) continue;
			const data = txt(bundle[mime]).replace(/\s+/g, "");
			// Same rule as an output image: outside the base64 alphabet it is
			// not an image, and interpolating it would write markup.
			if (isBase64(data)) return `data:${mime};base64,${data}`;
		}
		return null;
	};

	// markdown-it writes `| ---: |` as style="text-align:right", and a style
	// attribute is the one thing the allowlist can never keep — it reaches
	// the network through url(). Restated as a class, which survives, so an
	// authored table in a notebook aligns the way the same table in a .md
	// file does. Only markdown-it's own three spellings are matched, on its
	// own output.
	const ALIGN = /(<t[dh]\b[^>]*)\sstyle="text-align:(left|center|right)"/gi;
	const alignMarkdownTables = (rendered) =>
		rendered.replace(ALIGN, (whole, lead, side) => `${lead} class="ta-${side[0]}"`);

	// ------------------------------------------------------------- the grid
	// A row's cells are not its columns. A MultiIndex DataFrame gives its
	// index headers a rowspan, so every continuation row is short by one and
	// reading `cells[i]` as column i shifts the whole row left — numbers
	// judged against the wrong column, and values landing under the wrong
	// heading when pasted into a spreadsheet. This lays each row out on the
	// real grid, carrying spans down from the rows above, and returns
	// column index → cell. A carried cell appears in EVERY row it covers, so
	// a caller that must count each cell once has to say so.
	//
	// Self-contained on purpose: md2html.mjs serialises this into the page it
	// writes, alongside the two functions below that use it. See api.inline.
	const gridOf = (rows) => {
		const carry = []; // [remaining rows, cell] still covered from above
		const grid = [];
		for (let r = 0; r < rows.length; r++) {
			const row = rows[r];
			const map = [];
			let col = 0;
			for (const cell of row.cells) {
				while (carry[col] && carry[col][0] > 0) {
					map[col] = carry[col][1];
					col++;
				}
				const across = Math.max(1, cell.colSpan || 1);
				// rowspan="0" is valid and means "every remaining row in this
				// group". Read as 1 it left the rows below it a cell short,
				// which is the shift this whole function exists to avoid.
				const down = cell.rowSpan === 0 ? rows.length - r : Math.max(1, cell.rowSpan || 1);
				for (let c = col; c < col + across; c++) {
					map[c] = cell;
					carry[c] = [down, cell];
				}
				col += across;
			}
			// Columns still spanned after the row's own cells ran out.
			for (let c = col; c < carry.length; c++) {
				if (carry[c] && carry[c][0] > 0) map[c] = carry[c][1];
			}
			grid.push(map);
			for (const slot of carry) if (slot && slot[0] > 0) slot[0]--;
		}
		return grid;
	};

	// Tab-separated rows, which is what pastes into a spreadsheet. Serialised
	// from the grid rather than from row.cells: a MultiIndex DataFrame omits
	// the cells a rowspan already covers, so pasting a continuation row put
	// every value one column to the left. A carried cell is written once, in
	// the row that declared it, and its continuation rows get an empty
	// column — the shape a spreadsheet expects from a merged cell.
	// A rowspan is clipped at its row group's edge — rowspan="0" means "the
	// rest of THIS group", not the rest of the table — so each group is laid
	// out on its own and the results are stacked. Passing table.rows whole ran
	// a thead's span down through the body and pushed every copied cell right.
	const ROW_SECTION = { THEAD: 1, TBODY: 1, TFOOT: 1 };
	// A table's row sections in the order the browser DRAWS them, which is
	// neither source order nor "heads, bodies, feet".
	//
	// Read off the table's own children rather than tHead/tFoot, which name
	// only the FIRST of each: a table may have two <thead>s and keeps both,
	// and asking for one silently dropped the other's rows. But only that
	// first head is promoted to the top and only the first foot sinks to the
	// bottom — CSS gives them table-header-group and table-footer-group.
	// Every LATER head or foot is an ordinary row group and stays exactly
	// where it was written, interleaved among the bodies. Sorting all heads
	// forward would have copied such a table in an order it is not shown in.
	//
	// Everything that walks a table walks it through here.
	const rowSections = (table) => {
		const sections = [...table.children].filter((el) => el.tagName in ROW_SECTION);
		const head = sections.find((el) => el.tagName === "THEAD");
		const foot = sections.find((el) => el.tagName === "TFOOT");
		const middle = sections.filter((el) => el !== head && el !== foot);
		return [head, ...middle, foot].filter(Boolean);
	};

	const rowGroups = (table) => {
		const groups = rowSections(table).map((group) => [...group.rows]);
		return groups.length ? groups : [[...table.rows]];
	};

	const tableToTsv = (table) => {
		const grid = rowGroups(table).flatMap((rows) => gridOf(rows));
		const seen = new Set();
		const width = grid.reduce((n, map) => Math.max(n, map.length), 0);
		return grid
			.map((map) => {
				const line = [];
				for (let c = 0; c < width; c++) {
					const cell = map[c];
					if (!cell || seen.has(cell)) {
						line.push("");
						continue;
					}
					seen.add(cell);
					line.push(cell.textContent.trim());
				}
				return line.join("\t");
			})
			.join("\n");
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
					const rendered = resolveAttachments(md.render(src), cell.attachments);
					parts.push(`<section class="md">${alignMarkdownTables(rendered)}</section>`);
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
		// No `class` either, and it costs nothing: the CSS that would have used
		// pandas' "dataframe" or a Styler's "col0 row1" is stripped with every
		// other <style>, so a payload class can only collide with one of the
		// viewer's own. class="toc" bound an export's scroll spy to a hostile
		// list instead of the real rail; class="codeblock" put a code-copy
		// button on an output in both readers. alignColumns adds `num` after
		// this pass, so what the view needs it still writes itself.
		const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title", "colspan", "rowspan"]);
		// The scaffolding is markdown-it output and this script's own markup —
		// a markdown cell cannot contain raw HTML, because markdown-it runs
		// with html:false — so its pass allows what a rendered document needs
		// and an output has no business supplying. Heading ids are what the
		// ToC links to and the exporter bakes them in before this runs;
		// without them every ToC entry in an exported notebook scrolls
		// nowhere. A task list is a disabled checkbox, and `start` is what
		// makes a list beginning at 7 begin at 7. All of it stays out of the
		// payload set: an id chosen by an output can shadow a global (DOM
		// clobbering) or collide with a real heading's and hijack its link.
		// NOSCRIPT belongs here rather than in VOID_TAGS: with scripting on, a
		// browser parses its contents as ONE TEXT NODE, so unwrapping it does
		// not drop a hidden element — it prints the message meant for readers
		// who have no script straight into the page.
		const TRUSTED_TAGS = new Set([...ALLOWED_TAGS, "INPUT", "NOSCRIPT"]);
		const TRUSTED_ATTRS = new Set([
			...ALLOWED_ATTRS, "class", "id", "type", "checked", "disabled", "start",
		]);
		// Two rules, because the two passes are reading different authors.
		// Output HTML gets an allowlist: nobody chose those links, so only the
		// schemes that are inert to follow survive. Scaffolding gets a denial,
		// because a markdown cell's links were written on purpose and tel:,
		// ftp: and ssh: are all things a document legitimately says. data: is
		// refused by both — navigating to an SVG opens it as a document, where
		// script DOES run.
		const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "file:"]);
		const UNSAFE_PROTOCOLS = new Set([
			"javascript:", "vbscript:", "data:", "blob:", "filesystem:",
		]);
		// An <img> renders SVG in the secure static mode — no script, no
		// subresource loads — so data: images are allowed where data: links
		// are not.
		const OK_DATA = /^data:image\/(gif|png|jpeg|webp|avif|svg\+xml)[;,]/i;

		const parseUrl = (value) => {
			try {
				return new URL(value, document.baseURI);
			} catch {
				return null;
			}
		};
		const protocolOf = (value) => {
			const url = parseUrl(value);
			return url ? url.protocol : "";
		};

		// `local` marks the payload pass, where an image source must resolve
		// to this machine. A remote <img> is a request the reader never asked
		// to make: in an export, which has no CSP and no later rewrite,
		// opening the file would hand a tracking pixel in a notebook's output
		// exactly the callback it wanted. A hosted file: URL is refused with
		// it — //host/share is a UNC path, which on Windows reaches the
		// network over SMB.
		const sanitize = (scope, { tags, attrs, local }) => {
			const srcOk = (value) => {
				const url = parseUrl(value);
				if (!url) return false;
				if (url.protocol === "data:") return OK_DATA.test(value.trim());
				if (local) return url.protocol === "file:" && url.hostname === "";
				return SAFE_PROTOCOLS.has(url.protocol);
			};
			for (const el of [...scope.querySelectorAll("*")]) {
				// Skip what an earlier unwrap or removal already detached:
				// its own subtree is still in this static list.
				if (!scope.contains(el)) continue;
				if (!tags.has(el.tagName)) {
					if (VOID_TAGS.has(el.tagName)) el.remove();
					else el.replaceWith(...el.childNodes);
					continue;
				}
				for (const attr of [...el.attributes]) {
					if (!attrs.has(attr.name.toLowerCase())) {
						el.removeAttribute(attr.name);
					}
				}
				// URL attributes are checked by the URL parser rather than by
				// matching text: "java&#x73;cript:" and "java\tscript:" are
				// both live once the markup parser has decoded them, and both
				// are already decoded by the time this sees them.
				const href = el.getAttribute("href");
				if (href !== null) {
					const proto = protocolOf(href);
					const ok = local ? SAFE_PROTOCOLS.has(proto) : !UNSAFE_PROTOCOLS.has(proto);
					if (!ok) el.removeAttribute("href");
				}
				const src = el.getAttribute("src");
				if (src === null || srcOk(src)) continue;
				// Only an <img> is replaced. Anything else carrying a src just
				// loses the attribute: swapping the element out takes its
				// children with it, and a <div src="https://…"> wrapping a
				// DataFrame would delete the table it wraps.
				if (!local || el.tagName !== "IMG") {
					el.removeAttribute("src");
					continue;
				}
				// Not dropped but demoted, the same way the extension treats a
				// remote image in a markdown document: the reader still sees
				// the label and can follow it deliberately.
				const label = el.getAttribute("alt") || src;
				let node;
				// The strict rule, not the lenient one: this link is being
				// made out of a payload's own src.
				if (SAFE_PROTOCOLS.has(protocolOf(src))) {
					node = document.createElement("a");
					node.setAttribute("href", src);
					node.textContent = label;
				} else {
					node = document.createTextNode(label);
				}
				el.replaceWith(node);
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
		// Scientific notation is how pandas prints a column the moment its
		// values get large or small enough, and a whole column of 1.03e+09
		// read as text stayed left-aligned.
		const NUMERIC = /^[+-]?[\d,]*\.?\d+(?:[eE][+-]?\d+)?\s*%?$/;
		// Numeric columns wearing a word. inf arrives from a division pandas
		// did not refuse; NaN/None/NA from one it could not do at all.
		const NULLISH = /^[+-]?(nan|none|null|na|n\/a|inf|infinity)$/i;

		const alignColumns = (table) => {
			// Every section of each kind, not the first of each: a table may
			// have several bodies, and taking one both judged the column on an
			// unrepresentative sample and left the rows below it unmarked.
			// Each group is laid out on its own grid, because a rowspan cannot
			// cross a group boundary.
			const sections = rowSections(table);
			const of = (tag) => sections.filter((el) => el.tagName === tag);
			const bodies = of("TBODY");
			if (!bodies.length) return;
			const stat = [];
			const bodyGrid = bodies.flatMap((body) => gridOf([...body.rows]));
			// A cell carried down by a rowspan appears in every row it covers.
			// Counted once per appearance it would weight its column by how
			// tall it happens to be, so each cell votes once.
			const counted = new Set();
			for (const map of bodyGrid) {
				map.forEach((cell, i) => {
					if (counted.has(cell)) return;
					counted.add(cell);
					const text = cell.textContent.trim();
					stat[i] = stat[i] || { numeric: 0, total: 0 };
					stat[i].total++;
					if (NUMERIC.test(text) || NULLISH.test(text)) stat[i].numeric++;
				});
			}
			const isNum = stat.map((c) => !!c && c.total > 0 && c.numeric / c.total > 0.6);
			const mark = (map) => {
				map.forEach((cell, i) => {
					if (isNum[i]) cell.classList.add("num");
				});
			};
			for (const map of bodyGrid) mark(map);
			// A foot is a totals row: same columns, so the same alignment. It
			// stays out of the stats above, which are what the DATA looks like.
			for (const foot of of("TFOOT")) {
				for (const map of gridOf([...foot.rows])) mark(map);
			}
			// Only the LAST row of a head lines up with the columns; the rows
			// above it are MultiIndex spanners. Every head, though — each one
			// labels the same columns, and marking just one left a numeric
			// column right-aligned under its mid-table header and
			// left-aligned under the one at the top.
			for (const head of of("THEAD")) {
				if (!head.rows.length) continue;
				const headGrid = gridOf([...head.rows]);
				mark(headGrid[headGrid.length - 1]);
			}
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
			sanitize(template.content, { tags: ALLOWED_TAGS, attrs: ALLOWED_ATTRS, local: true });
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
		sanitize(root, { tags: TRUSTED_TAGS, attrs: TRUSTED_ATTRS, local: false });

		// Decided from the built tree, not guessed from a string: only mark
		// an output that has something worth putting on the clipboard. An
		// image or a widget placeholder would copy "" and still flash Copied.
		for (const box of root.querySelectorAll(".output")) {
			if (box.querySelector("table, pre")) box.classList.add("copyable");
		}
	};

	// render() builds the page, hydrate() opens what it carried, tableToTsv()
	// serialises a table for the clipboard. md2html.mjs inlines this whole
	// file into the page it writes and calls the same three, so an export and
	// the extension are running the same code rather than two copies of it.
	const api = { render, hydrate, gridOf, tableToTsv, rowSections };
	if (typeof window !== "undefined") window.notebookRender = api;
	if (typeof globalThis !== "undefined") globalThis.notebookRender = api;
})();
