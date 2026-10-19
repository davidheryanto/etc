// Sized images, shared by the extension and HTML exporter. CommonMark has no
// image size syntax, so `<img src="x.png" width="260">` is how GitHub, GitLab,
// VS Code and Typora all size one; this accepts that tag and nothing wider.
// Markdown remains html:false. Only lowercase <img> with double- or
// single-quoted src, alt, title, width and height, each at most once, with
// width and height whole pixels from 1 to 9999. Any other attribute (onload,
// style, srcset, …), a bare value, a unit, or a src that validateLink refuses
// leaves the whole tag as literal text, as before.
//
// The tag becomes markdown-it's own image token, not an HTML string. So what
// comes out is exactly what ![alt](src "title") renders, plus width/height,
// and every pass that already handles a Markdown image handles this one: the
// remote-image-to-link guard and the figure and caption passes in content.js,
// and the inliner, textOf and figure regexes in md2html.mjs. An inline rule,
// so it works in a table cell, a list item, or mid-sentence; code spans and
// code blocks never reach inline rules, so an example there stays text.
(() => {
	const ATTR = /\s+(src|alt|title|width|height)=(?:"([^"<>]*)"|'([^'<>]*)')/y;
	const END = /\s*\/?>/y;
	const SIZE = /^[1-9][0-9]{0,3}$/;
	const plugin = (md) => {
		const image = (state, silent) => {
			const src = state.src;
			let pos = state.pos;
			if (!src.startsWith("<img", pos)) return false;
			pos += 4;
			const attrs = {};
			for (;;) {
				ATTR.lastIndex = pos;
				const match = ATTR.exec(src);
				if (!match) break;
				if (match[1] in attrs) return false;
				attrs[match[1]] = match[2] !== undefined ? match[2] : match[3];
				pos = ATTR.lastIndex;
			}
			END.lastIndex = pos;
			if (!END.exec(src)) return false;
			pos = END.lastIndex;
			if (!attrs.src) return false;
			if ("width" in attrs && !SIZE.test(attrs.width)) return false;
			if ("height" in attrs && !SIZE.test(attrs.height)) return false;
			// The same gate markdown-it's own image rule puts its href through.
			const href = md.normalizeLink(md.utils.unescapeAll(attrs.src));
			if (!md.validateLink(href)) return false;
			if (!silent) {
				const token = state.push("image", "img", 0);
				token.attrs = [["src", href], ["alt", ""]];
				// The default renderer writes alt from the children as plain
				// text, so alt is never parsed as Markdown.
				const alt = new state.Token("text", "", 0);
				alt.content = md.utils.unescapeAll(attrs.alt || "");
				token.children = [alt];
				token.content = alt.content;
				if (attrs.title) token.attrSet("title", md.utils.unescapeAll(attrs.title));
				if (attrs.width) token.attrSet("width", attrs.width);
				if (attrs.height) token.attrSet("height", attrs.height);
			}
			state.pos = pos;
			return true;
		};
		md.inline.ruler.after("image", "sized_image", image);
	};
	if (typeof window !== "undefined") window.markdownImages = plugin;
	if (typeof globalThis !== "undefined") globalThis.markdownImages = plugin;
})();
