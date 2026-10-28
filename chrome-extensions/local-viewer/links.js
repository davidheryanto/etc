// Linked images, shared by the extension and HTML exporter. A README written
// for GitHub links a screenshot to its file with
// `<a href="x.png"><img src="x.png" width="260"></a>`, since the <img> tag
// that images.js accepts is the only way Markdown can size one. The Markdown
// form [<img src="x.png" width="260">](x.png) already renders the same; this
// accepts the HTML spelling of that one shape and nothing wider.
// Markdown remains html:false. Only a lowercase <a> with a double- or
// single-quoted href and optionally a title, each at most once, around
// exactly one <img> that images.js accepts, with nothing but whitespace
// between the tags. Any other attribute (target, rel, id, name, style, …),
// text or a second image inside, a missing </a>, or an href that
// validateLink refuses leaves the run as literal text, and the <img> in it
// renders on its own, as before. No id or name: an author's one could
// clobber a global the page's own scripts read.
//
// The run becomes markdown-it's own link_open, image and link_close tokens,
// so it is byte for byte what the Markdown form renders, and every pass that
// already handles a linked image handles this one: the unsafe-link unwrap
// and the figure pass in content.js, and md2html.mjs's figure regex.
//
// A link to the very image it holds, in any spelling — this one,
// [<img src="x.png" width="260">](x.png) or [![](x.png)](x.png) — leads
// where image-viewer.js would take a click anyway, so it is marked
// data-zoom, and the viewer opens it over the page instead of leaving it.
// Decided here, on the two addresses as written, rather than in the page:
// an export inlines the image as data: and leaves the href as it was, so by
// then the two no longer match.
(() => {
	const ATTR = /\s+(href|title)=(?:"([^"<>]*)"|'([^'<>]*)')/y;
	const OPEN_END = /\s*>\s*/y;
	const CLOSE = /\s*<\/a>/y;
	const link = (state, silent) => {
		// Already inside a link's text, as in [<a href…>…</a>](…): a link in
		// a link is not one a browser keeps, so this one stays text.
		if (state.linkLevel > 0) return false;
		const src = state.src;
		let pos = state.pos;
		if (!src.startsWith("<a", pos)) return false;
		pos += 2;
		const attrs = {};
		for (;;) {
			ATTR.lastIndex = pos;
			const match = ATTR.exec(src);
			if (!match) break;
			if (match[1] in attrs) return false;
			attrs[match[1]] = match[2] !== undefined ? match[2] : match[3];
			pos = ATTR.lastIndex;
		}
		OPEN_END.lastIndex = pos;
		if (!OPEN_END.exec(src)) return false;
		if (!attrs.href) return false;
		const images = globalThis.markdownImages;
		const image = images.read(state, OPEN_END.lastIndex);
		if (!image) return false;
		CLOSE.lastIndex = image.end;
		if (!CLOSE.exec(src)) return false;
		// The same gate markdown-it's own link rule puts its href through.
		const md = state.md;
		const href = md.normalizeLink(md.utils.unescapeAll(attrs.href));
		if (!md.validateLink(href)) return false;
		if (!silent) {
			const open = state.push("link_open", "a", 1);
			open.attrs = [["href", href]];
			if (attrs.title) open.attrSet("title", md.utils.unescapeAll(attrs.title));
			images.push(state, image);
			state.push("link_close", "a", -1);
		}
		state.pos = CLOSE.lastIndex;
		return true;
	};
	const zoom = (state) => {
		for (const block of state.tokens) {
			if (block.type !== "inline" || !block.children) continue;
			const t = block.children;
			for (let i = 0; i + 2 < t.length; i++) {
				if (
					t[i].type === "link_open" &&
					t[i + 1].type === "image" &&
					t[i + 2].type === "link_close" &&
					t[i].attrGet("href") === t[i + 1].attrGet("src")
				) {
					t[i].attrSet("data-zoom", "");
				}
			}
		}
	};
	const plugin = (md) => {
		md.inline.ruler.after("image", "linked_image", link);
		md.core.ruler.push("image_link_zoom", zoom);
	};
	if (typeof window !== "undefined") window.markdownLinks = plugin;
	if (typeof globalThis !== "undefined") globalThis.markdownLinks = plugin;
})();
