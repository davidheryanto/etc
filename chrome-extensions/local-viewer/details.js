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
// A block rule, not a token filter: markdown-it parses the lines between
// the pair as ordinary markdown, so a fence, a table or a list inside the
// toggle renders as it would outside it. The renderer needs no rule of its
// own — an unknown block token renders as its tag, which is all a <details>
// is.
(() => {
	// Lowercase and whole-line only, up to three leading spaces the way every
	// block construct allows. The summary may share the opener's line
	// (`<details><summary>Title</summary>`), the shape most files use, or
	// follow on its own. Its text is parsed as inline markdown, so a
	// backticked name in a summary renders as a chip the way it does on
	// GitHub.
	const OPEN = /^<details( open)?>(?:\s*<summary>(.*)<\/summary>)?\s*$/;
	const SUMMARY = /^<summary>(.*)<\/summary>\s*$/;
	const CLOSE = /^<\/details>\s*$/;
	const FENCE = /^(`{3,}|~{3,})/;

	const lineOf = (state, n) =>
		state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
	// Four spaces past the block's indent is an indented code block, whose
	// lines are content and never markers. Same test markdown-it's own
	// container rules apply.
	const marker = (state, n) => state.sCount[n] - state.blkIndent < 4;

	// The line of the </details> that closes the one opened at `start`, or
	// -1. Counts nested openers so the outer pair encloses the inner one,
	// and steps over fenced code so a literal </details> quoted inside a
	// fence — a document about this very syntax — does not end the section.
	const closerOf = (state, start, endLine) => {
		let depth = 1;
		for (let n = start + 1; n < endLine; n++) {
			if (state.isEmpty(n)) continue;
			// Dedented past the enclosing list item: the item ended and took
			// the section with it, unclosed.
			if (state.sCount[n] < state.blkIndent) return -1;
			if (!marker(state, n)) continue;
			const text = lineOf(state, n);
			const fence = FENCE.exec(text);
			if (fence) {
				const mark = fence[1];
				const shut = new RegExp(`^${mark[0]}{${mark.length},}\\s*$`);
				for (n++; n < endLine; n++) {
					if (marker(state, n) && shut.test(lineOf(state, n))) break;
				}
				continue;
			}
			if (OPEN.test(text)) depth++;
			else if (CLOSE.test(text) && --depth === 0) return n;
		}
		return -1;
	};

	const details = (state, startLine, endLine, silent) => {
		if (!marker(state, startLine)) return false;
		const open = OPEN.exec(lineOf(state, startLine));
		if (!open) return false;
		const closeLine = closerOf(state, startLine, endLine);
		if (closeLine < 0) return false;
		if (silent) return true;

		let summary = open[2];
		let bodyStart = startLine + 1;
		if (summary === undefined) {
			let n = bodyStart;
			while (n < closeLine && state.isEmpty(n)) n++;
			const own = n < closeLine && marker(state, n) ? SUMMARY.exec(lineOf(state, n)) : null;
			if (own) {
				summary = own[1];
				bodyStart = n + 1;
			}
		}

		const oldParent = state.parentType;
		const oldLineMax = state.lineMax;
		state.parentType = "details";
		state.lineMax = closeLine;

		let token = state.push("details_open", "details", 1);
		token.block = true;
		token.map = [startLine, closeLine + 1];
		if (open[1]) token.attrSet("open", "");
		if (summary !== undefined) {
			token = state.push("summary_open", "summary", 1);
			token.block = true;
			token = state.push("inline", "", 0);
			token.content = summary.trim();
			token.children = [];
			token.map = [startLine, bodyStart];
			token = state.push("summary_close", "summary", -1);
			token.block = true;
		}
		state.md.block.tokenize(state, bodyStart, closeLine);
		token = state.push("details_close", "details", -1);
		token.block = true;

		state.parentType = oldParent;
		state.lineMax = oldLineMax;
		state.line = closeLine + 1;
		return true;
	};

	// Before the fence rule, where markdown-it-container sits, and able to
	// interrupt a paragraph: a <details> line straight after prose starts
	// the section rather than joining the paragraph as text.
	const plugin = (md) => {
		md.block.ruler.before("fence", "details", details, {
			alt: ["paragraph", "reference", "blockquote", "list"],
		});
	};
	if (typeof window !== "undefined") window.markdownDetails = plugin;
	if (typeof globalThis !== "undefined") globalThis.markdownDetails = plugin;
})();
