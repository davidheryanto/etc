// HTML tables, shared by the extension and HTML exporter. A pipe table cannot
// put a label under each picture, so a README written for GitHub lays out a
// captioned gallery as raw HTML:
//
//   <table>
//   <tr><td align="center"><img src="a.jpg" width="260"><br><b>Voxel</b></td>…</tr>
//   </table>
//
// With html:false every tag of it rendered as literal text around the
// images. Markdown remains html:false: this accepts that one shape and
// nothing wider. <table>, <thead>, <tbody> and <tr> without attributes;
// <td> and <th> with only align (left, center, right), valign (top, middle,
// bottom) and width (pixels or a percentage), lowercase, quoted, each at
// most once; every tag closed. The run starts with <table> at the start of a
// line, ends with </table> at the end of one, and has no blank line in it,
// which is also where GitHub's own HTML block would end. Anything else — an
// attribute such as style or colspan, a stray tag between cells, a missing
// closer, a blank line — leaves the whole run as the text it was, as before.
//
// The run becomes markdown-it's own table tokens, so a gallery is the table
// a pipe table would make: in its panel, marked a grid of pictures when its
// cells are images (content.js), stepped through by image-viewer.js. align
// is written the way markdown-it writes `|:-:|`, as style="text-align:…",
// which a notebook restates as a class; valign stays an attribute; width is
// dropped, since the panel decides a table's width. A header is the
// <thead>, or a first row made only of <th>.
//
// A cell's contents are parsed as inline Markdown, so the sized <img>
// (images.js), a linked one (links.js) and <br> (breaks.js) work in it. In
// these cells only, <b>/<strong> and <i>/<em> are bold and italic: a caption
// under an image has no other spelling in HTML, and outside a cell those
// tags stay text, as before. That pass runs after the inline parse, on the
// text tokens of the cells marked here: an inline rule cannot tell which
// block it is in. Unlike GitHub, a cell's Markdown is parsed too (GitHub
// shows **x** in an HTML cell literally); the same convention <summary>
// follows in details.js.
(() => {
	const OPEN = /^<table>/;
	const CLOSE = /<\/table>\s*$/;
	const TAG = /\s*<(\/?)(table|thead|tbody|tr|td|th)((?:\s+[a-z]+=(?:"[^"<>]*"|'[^'<>]*'))*)\s*>/y;
	const ATTR = /\s+([a-z]+)=(?:"([^"<>]*)"|'([^'<>]*)')/g;
	const VALID = {
		align: /^(left|center|right)$/,
		valign: /^(top|middle|bottom)$/,
		width: /^[1-9][0-9]{0,3}%?$/,
	};
	// A structure tag inside a cell: a nested table, or a cell or row whose
	// closer is missing. Either way not this shape.
	const STRUCTURE = /<\/?(?:table|thead|tbody|tr|td|th)\b/;
	const INLINE_TAG = /<(\/?)(b|strong|i|em)>/g;
	const EMPHASIS = { b: "strong", strong: "strong", i: "em", em: "em" };

	const lineOf = (state, n) =>
		state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
	// Four spaces past the block's indent is an indented code block.
	const marker = (state, n) => state.sCount[n] - state.blkIndent < 4;

	const attrsOf = (text) => {
		const attrs = {};
		ATTR.lastIndex = 0;
		let match;
		while ((match = ATTR.exec(text))) {
			const name = match[1];
			const value = match[2] !== undefined ? match[2] : match[3];
			if (!(name in VALID) || name in attrs || !VALID[name].test(value)) return null;
			attrs[name] = value;
		}
		return attrs;
	};

	// The joined run → { head, body }, each a list of rows of
	// { tag, attrs, content }, or null when it is not the accepted shape.
	const parse = (text) => {
		const head = [];
		const body = [];
		let section = null; // "thead" | "tbody" | null
		let row = null;
		let pos = 0;
		TAG.lastIndex = 0;
		const first = TAG.exec(text);
		if (!first || first[1] || first[2] !== "table" || first[3]) return null;
		pos = TAG.lastIndex;
		for (;;) {
			TAG.lastIndex = pos;
			const match = TAG.exec(text);
			if (!match) return null;
			pos = TAG.lastIndex;
			const [, closing, name, attrText] = match;
			if (name !== "td" && name !== "th" && attrText) return null;
			if (name === "table") {
				if (!closing || row || section || pos !== text.trimEnd().length) return null;
				break;
			}
			if (name === "thead" || name === "tbody") {
				if (row) return null;
				if (!closing) {
					if (section) return null;
					section = name;
				} else {
					if (section !== name) return null;
					section = null;
				}
				continue;
			}
			if (name === "tr") {
				if (!closing) {
					if (row) return null;
					row = [];
				} else {
					if (!row || !row.length) return null;
					(section === "thead" ? head : body).push(row);
					row = null;
				}
				continue;
			}
			// td or th: its contents run to its own closer.
			if (closing || !row) return null;
			const attrs = attrsOf(attrText);
			if (!attrs) return null;
			const end = text.indexOf(`</${name}>`, pos);
			if (end < 0) return null;
			const content = text.slice(pos, end);
			if (STRUCTURE.test(content)) return null;
			row.push({ tag: name, attrs, content: content.trim() });
			pos = end + name.length + 3;
		}
		if (!head.length && !body.length) return null;
		// No <thead>: a first row of nothing but <th> is the header.
		if (!head.length && body[0].every((cell) => cell.tag === "th")) head.push(body.shift());
		return { head, body };
	};

	const table = (state, startLine, endLine, silent) => {
		if (!marker(state, startLine)) return false;
		if (!OPEN.test(lineOf(state, startLine))) return false;
		const lines = [];
		let last = -1;
		for (let n = startLine; n < endLine; n++) {
			if (state.isEmpty(n) || state.sCount[n] < state.blkIndent) return false;
			const line = lineOf(state, n);
			lines.push(line);
			if (CLOSE.test(line)) {
				last = n;
				break;
			}
		}
		if (last < 0) return false;
		const parsed = parse(lines.join("\n"));
		if (!parsed) return false;
		if (silent) return true;

		const map = [startLine, last + 1];
		const cell = (data, inHead) => {
			const tag = inHead ? "th" : data.tag;
			const open = state.push(`${tag}_open`, tag, 1);
			open.map = map;
			if (data.attrs.align) open.attrs = [["style", `text-align:${data.attrs.align}`]];
			if (data.attrs.valign) open.attrSet("valign", data.attrs.valign);
			const inline = state.push("inline", "", 0);
			inline.content = data.content;
			inline.map = map;
			inline.children = [];
			inline.meta = { htmlCell: true };
			state.push(`${tag}_close`, tag, -1);
		};
		const rows = (list, inHead) => {
			for (const row of list) {
				state.push("tr_open", "tr", 1).map = map;
				for (const data of row) cell(data, inHead);
				state.push("tr_close", "tr", -1);
			}
		};
		state.push("table_open", "table", 1).map = map;
		if (parsed.head.length) {
			state.push("thead_open", "thead", 1).map = map;
			rows(parsed.head, true);
			state.push("thead_close", "thead", -1);
		}
		if (parsed.body.length) {
			state.push("tbody_open", "tbody", 1).map = map;
			rows(parsed.body, false);
			state.push("tbody_close", "tbody", -1);
		}
		state.push("table_close", "table", -1);
		state.line = last + 1;
		return true;
	};

	// <b>, <strong>, <i> and <em> in a cell's text, paired innermost first,
	// become markdown-it's strong and em tokens. A tag left unpaired, or
	// closed out of order, stays the text it was.
	const emphasis = (state) => {
		for (const block of state.tokens) {
			if (block.type !== "inline" || !block.meta || !block.meta.htmlCell || !block.children) continue;
			const out = [];
			const stack = [];
			const text = (content) => {
				if (!content) return;
				const token = new state.Token("text", "", 0);
				token.content = content;
				out.push(token);
			};
			for (const child of block.children) {
				if (child.type !== "text") {
					out.push(child);
					continue;
				}
				let at = 0;
				INLINE_TAG.lastIndex = 0;
				let match;
				while ((match = INLINE_TAG.exec(child.content))) {
					text(child.content.slice(at, match.index));
					at = INLINE_TAG.lastIndex;
					const kind = EMPHASIS[match[2]];
					if (!match[1]) {
						const token = new state.Token(`${kind}_open`, kind, 1);
						token.markup = match[0];
						stack.push({ name: match[2], index: out.length });
						out.push(token);
						continue;
					}
					const top = stack[stack.length - 1];
					if (top && top.name === match[2]) {
						stack.pop();
						const token = new state.Token(`${kind}_close`, kind, -1);
						token.markup = match[0];
						out.push(token);
					} else {
						text(match[0]);
					}
				}
				text(child.content.slice(at));
			}
			// Openers never closed go back to text.
			for (const { index } of stack) {
				const token = new state.Token("text", "", 0);
				token.content = out[index].markup;
				out[index] = token;
			}
			// Adjacent text pieces merged again, as text_join leaves them.
			block.children = out.reduce((merged, token) => {
				const prev = merged[merged.length - 1];
				if (token.type === "text" && prev && prev.type === "text") prev.content += token.content;
				else merged.push(token);
				return merged;
			}, []);
		}
	};

	// Before the paragraph rule and able to interrupt one, as GitHub's HTML
	// block can: a <table> line straight after prose starts the table.
	const plugin = (md) => {
		md.block.ruler.before("paragraph", "html_table", table, { alt: ["paragraph", "reference", "blockquote", "list"] });
		md.core.ruler.push("html_table_emphasis", emphasis);
	};
	if (typeof window !== "undefined") window.markdownTables = plugin;
	if (typeof globalThis !== "undefined") globalThis.markdownTables = plugin;
})();
