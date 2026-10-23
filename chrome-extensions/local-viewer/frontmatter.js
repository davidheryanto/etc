// Front matter, shared by the extension and HTML exporter. A Markdown file
// may open with a block of metadata for a tool: md2conf reads
// `properties: content-appearance-published: full-width` from one to make
// its Confluence page full width, and Jekyll, Hugo and Obsidian read theirs
// the same way. Without this, the opening `---` rendered as a rule and the
// closing one as a setext underline, so the metadata became a heading, in
// the outline too.
//
// The envelope is gray-matter's: `---` as the file's first line, through the
// next line that is `---` again (`+++` for TOML, as Hugo writes it). Only at
// the very start of the file, with nothing before it, not even a blank line
// (Chrome and the exporter both drop a BOM first). Further down, `---` is a
// rule or an underline, as before. An opener that never closes is not front
// matter either, so the file renders as it always did.
//
// The delimiters alone decide, not what is between them: nothing here parses
// YAML, so malformed metadata cannot fail, and a guess at what looks like
// YAML would hand the next unusual file back to the heading bug. The cost is
// that a file opening with a rule, a paragraph and another rule shows that
// paragraph as front matter, as gray-matter and GitHub also read it.
//
// It renders as a closed disclosure holding the text as a code block, so the
// metadata stays one click away without a heading the outline could pick up.
// With show: false, in email mode, it renders as nothing, so it is never
// copied into an email. Not for notebooks: every cell is rendered on its own,
// and each would have a first line.
(() => {
	const OPEN = { "---": "yaml", "+++": "toml" };

	const plugin = (md, { show = true } = {}) => {
		const rule = (state, start, end, silent) => {
			if (start !== 0 || state.level !== 0 || state.blkIndent !== 0) return false;
			// A container's first line has a moved bMarks; the file's has none.
			if (state.bMarks[0] !== 0 || state.tShift[0] !== 0) return false;
			const marker = state.src.slice(0, state.eMarks[0]).trimEnd();
			const lang = OPEN[marker];
			if (!lang) return false;
			let close = 1;
			for (; close < end; close++) {
				if (state.src.slice(state.bMarks[close], state.eMarks[close]).trimEnd() === marker) break;
			}
			if (close >= end) return false;
			if (silent) return true;
			const token = state.push("front_matter", "", 0);
			token.block = true;
			token.markup = marker;
			token.info = lang;
			token.content = state.src.slice(state.bMarks[1], state.bMarks[close]);
			token.map = [0, close + 1];
			state.line = close + 1;
			return true;
		};
		md.block.ruler.before("table", "front_matter", rule);

		md.renderer.rules.front_matter = (tokens, idx, options) => {
			const { content, info } = tokens[idx];
			if (!show || !content.trim()) return "";
			let code = "";
			try {
				code = options.highlight ? options.highlight(content, info, "") : "";
			} catch {}
			code ||= md.utils.escapeHtml(content);
			return `<details class="frontmatter"><summary>Front matter</summary>\n<pre><code class="language-${info}">${code}</code></pre>\n</details>\n`;
		};
	};
	if (typeof window !== "undefined") window.markdownFrontMatter = plugin;
	if (typeof globalThis !== "undefined") globalThis.markdownFrontMatter = plugin;
})();
