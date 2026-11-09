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
// tags stay text, as before, and so does an escaped one (\<b>, &lt;b&gt;).
// An inline rule reads the tags and a core rule pairs them in the cells
// marked here, since an inline rule cannot tell which block it is in.
// Unlike GitHub, a cell's Markdown is parsed too (GitHub shows **x** in an
// HTML cell literally); the same convention <summary> follows in details.js.
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
	const INLINE_TAG = /<(\/?)(b|strong|i|em)>/y;
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
			// A second <table> line would be a nested table, which the shape
			// refuses anyway. Stopping here also keeps the scan linear: the
			// paragraph rule asks this rule about every line that follows a
			// refused one, and without the stop each <table> line of a long
			// unclosed run would scan the whole rest of it again. That line is
			// remembered as part of the refused run, so when the paragraph
			// rule asks about it next, it is refused too rather than drawn as
			// a table between its outer run's literal tags.
			if (n > startLine && OPEN.test(line)) {
				state.htmlTableNested = n;
				return false;
			}
			lines.push(line);
			if (CLOSE.test(line)) {
				last = n;
				break;
			}
		}
		if (last < 0) return false;
		if (state.htmlTableNested === startLine) return false;
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

	// <b>, <strong>, <i> and <em> as written, read by an inline rule into a
	// marker token of their own. Only a tag in the source reaches it: the
	// escape and entity rules consume \<b> and &lt;b&gt; first, so those stay
	// the literal text they were written as. The rule runs in every inline
	// run, since it cannot tell which block it is in; the core rule below
	// turns the markers back into text everywhere but these cells.
	const tag = (state, silent) => {
		INLINE_TAG.lastIndex = state.pos;
		const match = INLINE_TAG.exec(state.src);
		if (!match) return false;
		if (!silent) {
			const token = state.push("html_emphasis_tag", "", 0);
			token.content = match[0];
			token.meta = { closing: !!match[1], name: match[2] };
		}
		state.pos = INLINE_TAG.lastIndex;
		return true;
	};

	// In a cell, markers paired innermost first become markdown-it's strong
	// and em tokens. A pair counts only inside one level of the cell's
	// Markdown: an opener in a link's text and a closer after the link, or
	// one either side of a *, would cross and make tags the browser has to
	// repair, so both stay text. So does a tag left unpaired or closed out
	// of order, and every marker outside these cells.
	const emphasis = (state) => {
		const literal = (marker) => {
			const token = new state.Token("text", "", 0);
			token.content = marker.content;
			return token;
		};
		for (const block of state.tokens) {
			if (block.type !== "inline" || !block.children) continue;
			// An image's alt text is parsed into the image's own children, at
			// any depth when one image holds another, and the alt renderer
			// drops any token it does not know, so a marker there goes back
			// to text wherever it is.
			const restore = (children) => children.map((c) => {
				if (c.children) c.children = restore(c.children);
				return c.type === "html_emphasis_tag" ? literal(c) : c;
			});
			for (const child of block.children) {
				if (child.children) child.children = restore(child.children);
			}
			const children = block.children;
			if (!children.some((c) => c.type === "html_emphasis_tag")) continue;
			if (!block.meta || !block.meta.htmlCell) {
				block.children = children.map((c) => (c.type === "html_emphasis_tag" ? literal(c) : c));
				continue;
			}
			const out = children.slice();
			const stack = []; // { name, index, depth }
			let depth = 0;
			for (let i = 0; i < out.length; i++) {
				const child = out[i];
				if (child.type !== "html_emphasis_tag") {
					if (child.nesting < 0) {
						depth--;
						// The Markdown span an opener sat in has ended.
						while (stack.length && stack[stack.length - 1].depth > depth) {
							const { index } = stack.pop();
							out[index] = literal(out[index]);
						}
					} else if (child.nesting > 0) depth++;
					continue;
				}
				const { closing, name } = child.meta;
				const kind = EMPHASIS[name];
				if (!closing) {
					stack.push({ name, index: i, depth });
					continue;
				}
				const top = stack[stack.length - 1];
				if (!top || top.name !== name || top.depth !== depth) {
					out[i] = literal(child);
					continue;
				}
				stack.pop();
				const open = new state.Token(`${kind}_open`, kind, 1);
				open.markup = out[top.index].content;
				out[top.index] = open;
				const close = new state.Token(`${kind}_close`, kind, -1);
				close.markup = child.content;
				out[i] = close;
			}
			for (const { index } of stack) out[index] = literal(out[index]);
			block.children = out;
		}
	};

	// Before the paragraph rule and able to interrupt one, as GitHub's HTML
	// block can: a <table> line straight after prose starts the table.
	const plugin = (md) => {
		md.block.ruler.before("paragraph", "html_table", table, { alt: ["paragraph", "reference", "blockquote", "list"] });
		md.inline.ruler.after("image", "html_emphasis_tag", tag);
		md.core.ruler.push("html_table_emphasis", emphasis);
		// Never reached, since the core rule converts every marker; if one
		// were, it is still only its own escaped text.
		md.renderer.rules.html_emphasis_tag = (tokens, idx) => md.utils.escapeHtml(tokens[idx].content);
	};
	if (typeof window !== "undefined") window.markdownTables = plugin;
	if (typeof globalThis !== "undefined") globalThis.markdownTables = plugin;
})();
