// <br> as a line break, shared by the extension and HTML exporter. A table
// cell is one line of Markdown, so `<br>` is how GitHub, GitLab and VS Code
// all put two lines in one; with html:false it rendered as the literal text.
// Markdown remains html:false: only lowercase <br>, <br/> and <br />, no
// attributes. Anything else (<BR>, <br class="x">, …) stays text, as before.
//
// The tag becomes markdown-it's own hardbreak token, the one a trailing
// backslash makes, so what comes out is exactly that break. An inline rule,
// so it works in a table cell, a list item, or mid-sentence; code spans and
// code blocks never reach inline rules, so an example there stays text.
(() => {
	const BR = /<br\s*\/?>/y;
	const plugin = (md) => {
		const br = (state, silent) => {
			BR.lastIndex = state.pos;
			if (!BR.exec(state.src)) return false;
			if (!silent) state.push("hardbreak", "br", 0);
			state.pos = BR.lastIndex;
			return true;
		};
		md.inline.ruler.after("image", "br_tag", br);
	};
	if (typeof window !== "undefined") window.markdownBreaks = plugin;
	if (typeof globalThis !== "undefined") globalThis.markdownBreaks = plugin;
})();
