// HTML comments, shared by the extension and HTML exporter. A comment is how
// a Markdown file carries a note for a tool rather than a reader: md2conf ties
// a file to its Confluence page with `<!-- confluence-page-id: … -->` on the
// first line, and GitHub, GitLab and VS Code all render one as nothing. With
// html:false it rendered as the literal text. Markdown remains html:false:
// a comment renders nothing, and every other tag stays text, as before.
//
// Two rules. The block rule takes a line that starts with a comment, through
// the line its `-->` is on, the way CommonMark's comment block does: it may
// interrupt a paragraph, so a comment directly above `# Title` hides and the
// title stays a heading, and nothing inside it, a `#` line included, is
// parsed. Text after the last `-->` on that line becomes a paragraph of its
// own, where GitHub shows it as raw HTML. The inline rule takes a comment
// anywhere else, across soft line breaks too. Code spans and code blocks
// never reach either rule, so an example there stays text.
//
// A comment ends at the first `-->` after `<!--`, which also makes `<!-->`
// and `<!--->` comments, as in CommonMark. One that never ends stays
// visible as text, where GitHub hides the rest of the container from a
// `<!--` at the start of a line: a stray one should not make a file look
// empty.
(() => {
	// Just past the first `-->` at or after `from`, or -1. Remembered on the
	// parser state, whose src does not change during a parse: the same
	// answer holds for any later search that starts no further on than that
	// `-->`, and a miss holds for every later search. Without it, a file of
	// unclosed `<!--` lines scans to its end once per line.
	const closeOf = (state, from) => {
		const memo = state.commentClose;
		if (memo && from >= memo.from && (memo.close < 0 || from <= memo.close - 3)) return memo.close;
		const at = state.src.indexOf("-->", from);
		state.commentClose = { from, close: at < 0 ? -1 : at + 3 };
		return state.commentClose.close;
	};

	// For the comment opening at `open` on line `start`: the line its `-->`
	// is on and the position just past it, or line -1 if it does not close
	// inside this container. A line indented less than the block has left
	// the container, as in the fence rule.
	const closingLine = (state, open, start, end) => {
		const close = closeOf(state, open + 2);
		if (close < 0 || close > state.eMarks[end - 1]) return [-1, close];
		let line = start;
		for (; state.eMarks[line] < close; line++) {
			const n = line + 1;
			if (state.bMarks[n] + state.tShift[n] < state.eMarks[n] && state.sCount[n] < state.blkIndent) return [-1, close];
		}
		return [line, close];
	};

	const block = (state, start, end, silent) => {
		if (state.sCount[start] - state.blkIndent >= 4) return false;
		let open = state.bMarks[start] + state.tShift[start];
		if (!state.src.startsWith("<!--", open)) return false;
		let [line, close] = closingLine(state, open, start, end);
		if (line < 0) return false;
		// Further comments on the closing line are part of the block too;
		// the first thing after them that is not one is the trailing text.
		let tail = "";
		for (;;) {
			const rest = state.src.slice(close, state.eMarks[line]);
			const next = rest.search(/\S/);
			if (next < 0) break;
			open = close + next;
			const [to, after] = rest.startsWith("<!--", next) ? closingLine(state, open, line, end) : [-1];
			if (to < 0) {
				tail = state.src.slice(open, state.eMarks[line]).trim();
				break;
			}
			line = to;
			close = after;
		}
		if (silent) return true;
		if (tail) {
			state.push("paragraph_open", "p", 1).map = [line, line + 1];
			const inline = state.push("inline", "", 0);
			inline.content = tail;
			inline.map = [line, line + 1];
			inline.children = [];
			state.push("paragraph_close", "p", -1);
		}
		state.line = line + 1;
		return true;
	};

	const inline = (state, silent) => {
		if (!state.src.startsWith("<!--", state.pos)) return false;
		const close = closeOf(state, state.pos + 2);
		if (close < 0 || close > state.posMax) return false;
		state.pos = close;
		return true;
	};

	const plugin = (md) => {
		md.block.ruler.before("fence", "html_comment", block, {
			alt: ["paragraph", "reference", "blockquote", "list"],
		});
		md.inline.ruler.after("image", "html_comment", inline);
	};
	if (typeof window !== "undefined") window.markdownComments = plugin;
	if (typeof globalThis !== "undefined") globalThis.markdownComments = plugin;
})();
