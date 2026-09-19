// Safe legacy fragment targets, shared by the extension and HTML exporter.
// Only a standalone, empty anchor with one quoted ID is accepted. Markdown
// remains html:false; code blocks and every other HTML form stay literal.
(() => {
	const anchor = (state, start, end, silent) => {
		if (state.sCount[start] - state.blkIndent >= 4) return false;
		const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
		const match = /^<a id=(["'])([A-Za-z][A-Za-z0-9_.:-]*)\1><\/a>\s*$/.exec(line);
		if (!match) return false;
		if (silent) return true;
		const token = state.push("legacy_anchor", "a", 0);
		token.attrSet("id", match[2]);
		token.attrSet("class", "legacy-anchor");
		token.map = [start, start + 1];
		state.line = start + 1;
		return true;
	};
	const plugin = (md) => {
		md.block.ruler.before("fence", "legacy_anchor", anchor, {
			alt: ["paragraph", "reference", "blockquote", "list"],
		});
		md.renderer.rules.legacy_anchor = (tokens, i, options, env, self) =>
			`<a${self.renderAttrs(tokens[i])}></a>\n`;
	};
	if (typeof window !== "undefined") window.markdownAnchors = plugin;
	if (typeof globalThis !== "undefined") globalThis.markdownAnchors = plugin;
})();
