// <details>/<summary> for markdown-it with html:false. Shared verbatim by
// the extension (content.js) and the exporter (md2html.mjs, into its vm
// sandbox), the way notebook.js is, so the two readers cannot disagree about
// which lines are a disclosure. A plain script assigning one global for the
// same reason: no module loader in a content script, no require in the
// sandbox.
//
// Why this exists: GitHub-flavored markdown has no syntax for a collapsed
// section, so a long query or log tucked behind a toggle is written as the
// raw HTML pair — and with html:false that pair rendered as literal text
// above and below an always-open block. This is not html:true by another
// name. It is an allowlist of two tags, on their own lines, with the one
// attribute (`open`) that has no side effect; anything else — an attribute,
// a tag mid-paragraph, an opener that is never closed — falls through to
// the paragraph rule and stays escaped text, exactly as before.
//
// Two block rules and a core rule, and no look-ahead. The opener emits its
// token and steps aside; markdown-it parses what follows as it always does,
// so a fence, a list or a quote inside the toggle is parsed by the rule
// that owns it — a literal </details> inside a fence is never seen here
// at all. The closer emits its token only for a toggle opened in the same
// container — the one still open at the same nesting level, markdown-it's
// own record of where a line is — so a </details> inside a blockquote
// cannot close a toggle opened outside it, and one in the next list item
// cannot close a toggle opened in the last. What that leaves — an opener
// whose closer never came, or came after its container had ended — is
// unwound by the core rule below, back into the paragraph of text the
// paragraph rule would have made of it. An earlier draft scanned ahead
// for the closer on physical lines and had to re-derive container
// boundaries, fence extents and list indentation to do it, and got each
// of them subtly wrong; this one asks the parser instead.
(() => {
	// Lowercase and whole-line only, up to three leading spaces the way every
	// block construct allows. The summary may share the opener's line
	// (`<details><summary>Title</summary>`), the shape most files use, or
	// follow on its own. Its text is parsed as inline markdown, so a
	// backticked name in a summary renders as a chip. That is this viewer's
	// own convention, not GitHub's: CommonMark makes <details> a raw HTML
	// block, so GitHub shows markdown in a summary literally and renders
	// inline tags like <b> instead, which here stay visible as text (see
	// README, Markdown).
	const OPEN = /^<details( open)?>(?:\s*<summary>(.*)<\/summary>)?\s*$/;
	const SUMMARY = /^<summary>(.*)<\/summary>\s*$/;
	const CLOSE = /^<\/details>\s*$/;

	const lineOf = (state, n) =>
		state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
	// Four spaces past the block's indent is an indented code block, whose
	// lines are content and never markers. Same test markdown-it's own
	// container rules apply.
	const marker = (state, n) => state.sCount[n] - state.blkIndent < 4;

	// The toggles open so far in this parse, innermost last, each as the
	// nesting level it was opened at. On the parser state, which is one
	// object per document — nested tokenize() calls for a list item or a
	// quote share it — so a closer inside one of those can see what was
	// opened outside.
	//
	// That level counts markdown-it's containers only. A toggle's own tokens
	// are pushed without moving state.level (see push below): if they
	// moved it, an opener left unclosed inside a quote would leave the
	// level one too high when the quote ends — nothing ever pushes the
	// matching close — and every closer after it would be refused.
	const stackOf = (state) => state.detailsOpen || (state.detailsOpen = []);
	// state.push() moves state.level by the token's nesting; this puts it
	// back, so the token still renders as an open or a close tag while the
	// level stays the container's.
	const push = (state, type, tag, nesting) => {
		if (nesting < 0) state.level++;
		const token = state.push(type, tag, nesting);
		if (nesting > 0) state.level--;
		token.block = true;
		return token;
	};
	// A toggle whose container has ended is dead: its closer can no longer
	// arrive, and a </details> in the next list item or the next quote —
	// at the same level, but not the same container — must not be taken
	// for it. The container's end is on record as the close token that
	// ended it, at a level below the toggle's, so the tokens pushed since
	// the last look are read once each, and every close at a lower level
	// retires the toggles opened above it. The core rule unwinds those
	// into text; here they are just out of the way.
	const live = (state) => {
		const stack = stackOf(state);
		const tokens = state.tokens;
		for (let i = state.detailsSeen || 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (token.nesting >= 0) continue;
			while (stack.length && stack[stack.length - 1] > token.level) stack.pop();
		}
		state.detailsSeen = tokens.length;
		return stack;
	};

	const open = (state, startLine, endLine, silent) => {
		if (!marker(state, startLine)) return false;
		const match = OPEN.exec(lineOf(state, startLine));
		if (!match) return false;
		if (silent) return true;

		let summary = match[2];
		let summaryLine = -1;
		let bodyStart = startLine + 1;
		if (summary === undefined) {
			let n = bodyStart;
			while (n < endLine && state.isEmpty(n)) n++;
			const own =
				n < endLine && state.sCount[n] >= state.blkIndent && marker(state, n)
					? SUMMARY.exec(lineOf(state, n))
					: null;
			if (own) {
				summary = own[1];
				summaryLine = n;
				bodyStart = n + 1;
			}
		}

		let token = push(state, "details_open", "details", 1);
		token.map = [startLine, bodyStart];
		// The source lines, kept for the unwind: if no closer ever comes,
		// this is the text the reader sees instead.
		token.meta = { raw: lineOf(state, startLine) };
		if (match[1]) token.attrSet("open", "");
		if (summary !== undefined) {
			token = state.push("summary_open", "summary", 1);
			token.block = true;
			if (summaryLine >= 0) token.meta = { raw: lineOf(state, summaryLine) };
			token = state.push("inline", "", 0);
			token.content = summary.trim();
			token.children = [];
			token.map = [summaryLine >= 0 ? summaryLine : startLine, bodyStart];
			token = state.push("summary_close", "summary", -1);
			token.block = true;
		}
		live(state).push(state.level);
		state.line = bodyStart;
		return true;
	};

	const close = (state, startLine, endLine, silent) => {
		if (!marker(state, startLine)) return false;
		if (!CLOSE.test(lineOf(state, startLine))) return false;
		const stack = live(state);
		// As a terminator (silent): any enclosing toggle makes this line a
		// closer, so the paragraph or list item it would otherwise join as
		// text ends here and the containers unwind to the level the closer
		// belongs to — where the real call below finds it on top. Inside a
		// container with no toggle open around it at all, the line is text.
		if (silent) return stack.some((level) => level <= state.level);
		if (!stack.length || stack[stack.length - 1] !== state.level) return false;
		stack.pop();
		const token = push(state, "details_close", "details", -1);
		token.map = [startLine, startLine + 1];
		state.line = startLine + 1;
		return true;
	};

	// After the block parse, before inline: every details_open still without
	// its details_close becomes the paragraph the paragraph rule would have
	// made of its source lines. The same reading of the stream as live():
	// a close token at a level below an open retires it, and a
	// details_close pairs with the innermost open left. No spread: the
	// dead can number in the hundreds of thousands, past what a call can
	// take as arguments.
	const unwind = (state) => {
		const tokens = state.tokens;
		const stack = [];
		const dead = [];
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (token.type === "details_open") {
				stack.push(i);
				continue;
			}
			if (token.nesting >= 0) continue;
			while (stack.length && tokens[stack[stack.length - 1]].level > token.level) {
				dead.push(stack.pop());
			}
			if (token.type === "details_close") stack.pop();
		}
		for (const i of stack) dead.push(i);
		if (!dead.length) return;
		const revert = new Set(dead);
		const out = [];
		for (let i = 0; i < tokens.length; i++) {
			if (!revert.has(i)) {
				out.push(tokens[i]);
				continue;
			}
			const open = tokens[i];
			let raw = open.meta.raw;
			if (tokens[i + 1] && tokens[i + 1].type === "summary_open") {
				const summary = tokens[i + 1];
				if (summary.meta) raw += "\n" + summary.meta.raw;
				i += 3;
			}
			const p = new state.Token("paragraph_open", "p", 1);
			p.block = true;
			p.level = open.level;
			p.map = open.map;
			const inline = new state.Token("inline", "", 0);
			inline.content = raw;
			inline.children = [];
			inline.level = open.level + 1;
			inline.map = open.map;
			const close = new state.Token("paragraph_close", "p", -1);
			close.block = true;
			close.level = open.level;
			out.push(p, inline, close);
		}
		state.tokens = out;
	};

	// Before the fence rule, where markdown-it-container sits, and both able
	// to interrupt a paragraph or a list: a <details> line straight after
	// prose starts the section rather than joining the paragraph as text,
	// and a </details> after a list item ends the list rather than lazily
	// continuing the item.
	const plugin = (md) => {
		const alt = ["paragraph", "reference", "blockquote", "list"];
		md.block.ruler.before("fence", "details_open", open, { alt });
		md.block.ruler.before("fence", "details_close", close, { alt });
		md.core.ruler.after("block", "details_unwind", unwind);
	};
	if (typeof window !== "undefined") window.markdownDetails = plugin;
	if (typeof globalThis !== "undefined") globalThis.markdownDetails = plugin;
})();
