// Injected on demand by the popup — never on page load, never on a tab you
// did not click. Walks the live DOM and *builds* the canonical document out of
// allowlisted nodes, rather than cloning the page and deleting from it: the
// only way a node reaches the output is by being constructed here, which is
// what makes "no scripts, no handlers, no remote references" a property of the
// design instead of a list of things to remember.
//
// Nothing on the page is modified except the scroll position, and that is put
// back.
//
// Everything here builds nodes with createElement/appendChild and only *reads*
// innerHTML at the end. That is not a style preference: sites which enforce
// Trusted Types (YouTube, and a growing number of others) reject innerHTML and
// DOMParser assignment outright, so a capture written the other way throws on
// them. Parsing back into a document happens in the popup, where the page's
// CSP does not reach.
(() => {
	// The popup injects this file every time it opens; a second run would
	// otherwise redefine everything under it.
	if (window.__singleFile) return;

	// ---------------------------------------------------------------------
	// The allowlist. Nothing outside these tables survives.
	// ---------------------------------------------------------------------

	// Removed with their subtrees. Semantic page furniture (nav/header/footer/
	// aside) and anything that carries behaviour rather than content.
	const DROP = new Set([
		"script", "style", "noscript", "link", "meta", "template", "object",
		"embed", "input", "button", "select", "textarea", "dialog",
		"nav", "header", "footer", "aside",
	]);

	// ARIA equivalents of the same furniture, for sites that use <div role=…>.
	//
	// "complementary" is deliberately absent, though <aside> is dropped above.
	// The tag is a considered authoring decision; the role gets applied loosely
	// — YouTube marks the wrapper around its video player complementary, so
	// honouring it dropped the entire player and the page's whole point with
	// it. A sidebar that survives is noise you can see and ignore; primary
	// content that vanishes is unrecoverable, and faithful content is the
	// priority. The rest of these roles are unambiguous enough to trust.
	const DROP_ROLES = new Set(["navigation", "banner", "contentinfo", "search"]);

	// Kept, with the attributes listed below and nothing else.
	const KEEP = new Set([
		"h1", "h2", "h3", "h4", "h5", "h6",
		"p", "ul", "ol", "li", "dl", "dt", "dd",
		"blockquote", "pre", "code", "hr", "br",
		"table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
		"a", "strong", "em", "b", "i", "u", "s", "sup", "sub", "mark", "small",
		"abbr", "kbd", "samp", "var", "time",
		"img", "figure", "figcaption", "details", "summary",
	]);

	// Per-tag attribute allowlist. `id` is handled separately (kept only when
	// something links to it), `lang` and `dir` are allowed everywhere.
	// img is absent on purpose: its attributes are set where the element is
	// built, since src becomes a placeholder rather than the page's value.
	const ATTRS = {
		a: ["href"],
		th: ["colspan", "rowspan", "headers"],
		td: ["colspan", "rowspan", "headers"],
		ol: ["start", "reversed"],
		li: ["value"],
		code: ["class"],
		time: ["datetime"],
		abbr: ["title"],
	};

	const GLOBAL_ATTRS = ["lang", "dir"];

	// Used to decide whether an unwrapped block can become a <p>: if a
	// converted subtree already contains one of these, it is not a paragraph.
	const BLOCK = new Set([
		"p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl",
		"table", "blockquote", "pre", "figure", "hr", "details",
	]);

	// Link targets that are safe to keep. Everything else — javascript:, data:,
	// blob: — becomes plain text.
	const SAFE_LINK = /^(https?:|mailto:|#)/i;

	// Elements that carry their whole meaning in the tag and so survive the
	// empty-node pass. A blank table cell is what holds the column grid in
	// place — dropping one shifts every cell after it out of its column.
	const EMPTY_OK = new Set(["img", "hr", "br", "svg", "td", "th"]);

	// The same argument one level up: inside an <ol>, an item's *position* is
	// content. Dropping a blank one renumbers every item below it, and a page
	// that writes <li value="5"></li> hands the number to the item after it,
	// so the loss is not even confined to the blank row. A blank bullet in a
	// <ul> carries nothing, and is pruned like anything else.
	const numbered = (el) =>
		el.tagName === "LI" && el.parentElement && el.parentElement.tagName === "OL";

	// Images smaller than this in both directions are icons, spacers and
	// tracking pixels, never content.
	const MIN_IMAGE = 100;

	// Iframes smaller than this are ads and trackers; bigger ones get a link.
	const MIN_FRAME = 100;

	// ---------------------------------------------------------------------

	const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

	// Lazy-loaded images and IntersectionObserver content only exist once they
	// have been scrolled past. This is the single step that makes listing and
	// product pages work at all; without it the capture is mostly placeholders.
	async function autoScroll() {
		const startX = window.scrollX;
		const startY = window.scrollY;
		// behavior: instant, because a site with `scroll-behavior: smooth`
		// makes the numeric overload animate: the steps would then land
		// somewhere short of where they were aimed, missing the lazy-load
		// triggers the scroll exists for, and the restore would still be
		// gliding when the capture reads the page.
		const jump = (top) => window.scrollTo({ top, left: startX, behavior: "instant" });
		for (let step = 1; step <= 5; step++) {
			jump((document.documentElement.scrollHeight * step) / 5);
			await sleep(250);
		}
		// Images that started loading on the last step have not arrived yet.
		await sleep(500);
		jump(startY);
		await sleep(50);
	}

	// Assets are collected as URLs and fetched by the popup, which can read
	// cross-origin with host_permissions where the page itself cannot. The
	// document carries `asset:N` placeholders until then.
	//
	// Per capture, not per injection: the file guards against being injected
	// twice, so a popup reopened on the same tab reuses this closure. State
	// that outlived a capture would hand the second one a populated `seen` and
	// an empty document.
	let assets = [];
	let seen = new WeakSet();
	// A canvas rasterizes to a data: URI here, before the popup's budget can
	// weigh it. A wall-sized or noisy canvas produces tens of megabytes of
	// base64 that would be held in the page and shipped through executeScript
	// before anything got the chance to reject it.
	const MAX_INLINE_DATA = 2 * 1024 * 1024;

	const asset = (url) => {
		assets.push(url);
		return `asset:${assets.length - 1}`;
	};

	// What an asset URL may be. Everything else — blob: (dead outside the page
	// that minted it), chrome-extension:, view-source: — is dropped rather than
	// fetched.
	//
	// file: is allowed only when the page being captured is itself a local
	// file, where its own images are legitimate content. A remote page cannot
	// load a file:// image, but it can still *name* one, and the popup fetches
	// with privileges the page does not have — so without this an http page
	// could have a local file base64'd into the output by asking for it.
	const SAFE_ASSET =
		location.protocol === "file:" ? /^(https?:|data:|file:)/i : /^(https?:|data:)/i;

	// A figure + caption, so a thing that could not be saved says so in the
	// document's own voice instead of vanishing. Both tags are allowlisted, so
	// markers pass through normalization unchanged and reach Markdown as an
	// image plus an italic line.
	function marker(caption, href, imageUrl) {
		const figure = document.createElement("figure");
		if (imageUrl && SAFE_ASSET.test(imageUrl)) {
			const img = document.createElement("img");
			img.setAttribute("src", asset(imageUrl));
			img.setAttribute("alt", caption);
			figure.appendChild(img);
		}
		const figcaption = document.createElement("figcaption");
		if (href && SAFE_LINK.test(href)) {
			figcaption.appendChild(document.createTextNode(caption + " — "));
			const link = document.createElement("a");
			link.setAttribute("href", href);
			link.textContent = href;
			figcaption.appendChild(link);
		} else {
			figcaption.textContent = caption;
		}
		figure.appendChild(figcaption);
		return figure;
	}

	// currentSrc is only set once the browser has picked a source, which it has
	// not on the common preload="none" player — and the raw attribute is
	// usually relative, which SAFE_LINK rejects, so the marker would link to
	// the page rather than the media. A <source> child is the other everyday
	// shape and has no currentSrc at all.
	function mediaSource(node) {
		const raw =
			node.currentSrc ||
			node.getAttribute("src") ||
			(node.querySelector("source") &&
				node.querySelector("source").getAttribute("src")) ||
			"";
		if (!raw) return "";
		try {
			return new URL(raw, location.href).href;
		} catch {
			return "";
		}
	}

	// Media and interactive elements, converted before normalization so that
	// everything they produce is itself allowlisted. Runs against the live
	// element because that is the only place the pixels exist: a cloned canvas
	// is blank, and a cloned video has no poster resolved.
	function convertMedia(node, tag) {
		if (tag === "canvas") {
			// Charting libraries that draw to canvas survive as a PNG. A canvas
			// tainted by cross-origin drawing throws on read instead — there is
			// no way around that, so it degrades to a marker.
			try {
				if (node.width < MIN_IMAGE && node.height < MIN_IMAGE) return null;
				// "Canvas graphic", not "Chart": most of these are charts, but a
				// caption that asserts what it cannot know is worse than a plain
				// one — a video player's internal canvases would be labelled
				// charts too.
				const raster = node.toDataURL("image/png");
				if (raster.length > MAX_INLINE_DATA) {
					return marker("Canvas graphic (too large to save)", null, null);
				}
				return marker("Canvas graphic", null, raster);
			} catch {
				return marker("Canvas graphic (not saved)", null, null);
			}
		}
		if (tag === "video") {
			// Never the video itself: a 40MB inline media file is not a single
			// file in any useful sense. The poster frame plus a link is what an
			// offline copy can honestly carry.
			// Resolved against the page, then checked: a poster is a
			// page-supplied string and `new URL` will happily produce a
			// javascript: one.
			let poster = null;
			try {
				const raw = node.getAttribute("poster");
				if (raw) poster = new URL(raw, location.href).href;
			} catch {}
			const src = mediaSource(node);
			// Streaming players hand their <video> a blob: URL backed by Media
			// Source Extensions. There is no fetchable address behind it, so
			// the marker names the page instead of pretending otherwise.
			const usable = SAFE_LINK.test(src);
			return marker(
				usable ? "Video" : "Video (not saved) — see the source page",
				usable ? src : location.href,
				poster
			);
		}
		if (tag === "audio") {
			const src = mediaSource(node);
			return marker("Audio", SAFE_LINK.test(src) ? src : location.href, null);
		}
		if (tag === "math") {
			// MathML has no place in the allowlist, and unwrapping it runs the
			// symbols together into soup that reads as neither prose nor an
			// equation. Most MathML on the web is generated and carries its own
			// TeX source in an <annotation>, which is both faithful and legible.
			const annotation = node.querySelector("annotation");
			const tex = annotation && /tex/i.test(annotation.getAttribute("encoding") || "")
				? annotation.textContent.trim()
				: "";
			if (!tex) return marker("Equation (not saved)", null, null);
			const code = document.createElement("code");
			code.textContent = tex;
			return code;
		}
		if (tag === "iframe") {
			const box = node.getBoundingClientRect();
			if (box.width < MIN_FRAME || box.height < MIN_FRAME) return null;
			const src = node.getAttribute("src");
			if (!src) return null;
			// Cross-origin frame content is unreadable by design, so a link is
			// the most that is available. A malformed src ("http://[") makes
			// new URL throw, and one bad frame must not abort the capture of
			// the whole page.
			let resolved = null;
			try {
				resolved = new URL(src, location.href).href;
			} catch {
				return null;
			}
			return marker(node.getAttribute("title") || "Embedded frame", resolved, null);
		}
		return undefined;
	}

	// Inline SVG gets its own allowlist rather than an exception to the main
	// one. A denylist here was tried and is not defensible: <desc> and <title>
	// are HTML integration points, so an <iframe>/<img>/<link> inside one parses
	// as HTML and sails past an SVG-shaped filter; an SVG <style> is a
	// document-wide stylesheet that can pull `@import url(…)` on open, and being
	// a raw-text element it survives a serialize/reparse round trip as live
	// markup; and <image>, <use>, <feImage> and any `url(…)` in a presentation
	// attribute are remote references in their own right.
	//
	// So: shapes, text, structure, and paint. No <style>, <desc>, <title>,
	// <image>, <foreignObject>, <script>, <animate*>, and no filter primitives.
	// Local names are case-sensitive in SVG — linearGradient, not lineargradient.
	const SVG_KEEP = new Set([
		"svg", "g", "defs", "symbol", "use", "switch",
		"path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
		"text", "tspan", "textPath",
		"marker", "linearGradient", "radialGradient", "stop",
		"clipPath", "mask", "pattern",
	]);

	// Any attribute whose value can name something *outside* the document.
	// `url(#gradient)` is explicitly not that: internal references are how a
	// legitimate diagram wires its shapes to its own defs, and rejecting them
	// silently strips every gradient, mask and marker on the page.
	//
	// The backslash clause is the one that stops this being a string-matching
	// game: a presentation attribute is parsed as CSS, and CSS escapes are
	// resolved before the value means anything, so `fill="u\72 l(https://…)"`
	// computes to a live url() while matching no literal spelling of it
	// (verified in Chrome). Nothing in a captured diagram has any business
	// carrying a backslash, so any value with one is dropped rather than
	// unescaped and re-checked.
	const SVG_EXTERNAL = /\\|url\(\s*['"]?(?!#)|javascript:|data:|[a-z][a-z0-9+.-]*:\/\//i;

	function scrubSvg(node, depth = 0) {
		// Same cap as the HTML walk: a deep enough nest of <g> would otherwise
		// overflow the stack and take the whole capture down with it.
		if (depth > MAX_DEPTH) return null;
		if (node.nodeType === Node.TEXT_NODE) {
			return document.createTextNode(node.nodeValue);
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return null;

		const local = node.localName;

		// A linked shape keeps the shape and loses the link, rather than losing
		// both — the diagram is the content, the link was navigation.
		if (local === "a") {
			const unwrapped = document.createDocumentFragment();
			for (const child of node.childNodes) {
				const converted = scrubSvg(child, depth + 1);
				if (converted) unwrapped.appendChild(converted);
			}
			return unwrapped;
		}
		if (!SVG_KEEP.has(local)) return null;

		const el = document.createElementNS("http://www.w3.org/2000/svg", local);
		for (const attribute of node.attributes) {
			const name = attribute.name;
			const value = attribute.value;
			if (/^on/i.test(name)) continue;
			// style can carry url(); there is no reason to keep it when
			// presentation attributes do the same job inertly.
			if (name.toLowerCase() === "style") continue;
			// The only references kept are internal ones: <use href="#gradient">
			// is how a legitimate diagram refers to its own defs.
			if (/(^|:)href$/i.test(name)) {
				if (!value.startsWith("#")) continue;
			} else if (SVG_EXTERNAL.test(value)) {
				continue;
			}
			el.setAttribute(name, value);
		}
		// A <use> whose href pointed outside the document has just lost it, and
		// an empty <use> is nothing but noise in the output.
		if (local === "use" && !el.hasAttribute("href") && !el.hasAttribute("xlink:href")) {
			return null;
		}
		for (const child of node.childNodes) {
			const converted = scrubSvg(child, depth + 1);
			if (converted) el.appendChild(converted);
		}
		return el;
	}

	// Guards for a walk that runs on pages nobody here wrote. Slot assignment
	// makes the traversal a graph rather than a tree — a node can be reachable
	// both as a light child and through the slot it is assigned to — so a
	// visited set is what keeps a pathological component from looping forever
	// (`seen` is declared with the other per-capture state above). The depth cap
	// catches the other shape of the same problem; 200 is far past any real
	// document's nesting.
	const MAX_DEPTH = 200;

	// The core. Returns a node, a fragment (unwrapped), or null (dropped).
	function convert(node, depth = 0) {
		if (depth > MAX_DEPTH) return null;
		if (node.nodeType === Node.ELEMENT_NODE) {
			if (seen.has(node)) return null;
			seen.add(node);
		}
		return build(node, depth);
	}

	function build(node, depth) {
		if (node.nodeType === Node.TEXT_NODE) {
			return document.createTextNode(node.nodeValue);
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return null;

		const tag = node.tagName.toLowerCase();
		if (DROP.has(tag)) return null;
		// role takes a space-separated list in priority order, and the values
		// are case-insensitive.
		const roles = (node.getAttribute("role") || "").toLowerCase().split(/\s+/);
		if (roles.some((role) => DROP_ROLES.has(role))) return null;
		if (
			(node.getAttribute("aria-hidden") || "").toLowerCase() === "true" ||
			node.hasAttribute("hidden")
		) {
			return null;
		}

		// If it was not visible, it was not content. Deterministic where a
		// class-name heuristic is not, and it takes out cookie banners, closed
		// modals and inactive tab panels without naming any of them.
		const style = getComputedStyle(node);
		if (style.display === "none" || style.visibility === "hidden") return null;

		if (tag === "svg") return scrubSvg(node, depth);

		// A <slot> renders whatever light-DOM nodes were assigned to it, not its
		// own children — so following assignedNodes is what puts composed
		// content back in the order it is actually displayed in.
		if (tag === "slot") {
			const slotted = document.createDocumentFragment();
			for (const assigned of node.assignedNodes({ flatten: true })) {
				const converted = convert(assigned, depth + 1);
				if (converted) slotted.appendChild(converted);
			}
			return slotted;
		}

		const media = convertMedia(node, tag);
		if (media !== undefined) return media;

		if (tag === "img") {
			// currentSrc is the browser's own resolution of srcset/sizes/DPR,
			// so there is nothing to reimplement. An image that never loaded
			// has no dimensions yet and is kept — it may still fetch.
			const src = node.currentSrc || node.src;
			if (!src || !SAFE_ASSET.test(src)) return null;
			if (
				node.naturalWidth &&
				node.naturalWidth < MIN_IMAGE &&
				node.naturalHeight < MIN_IMAGE
			) {
				return null;
			}
			const img = document.createElement("img");
			img.setAttribute("src", asset(src));
			// Built here rather than through the ATTRS loop, because src is a
			// placeholder rather than the page's value. Width and height are
			// carried so a saved page does not reflow as its images decode.
			for (const name of ["alt", "width", "height"]) {
				if (node.hasAttribute(name)) img.setAttribute(name, node.getAttribute(name));
			}
			return img;
		}

		// An open shadow root is what the element actually renders; its light
		// children are only the raw material, reached from here through the
		// slots that place them. Walking childNodes instead would silently lose
		// every web component's content — MDN's code examples, most design
		// systems, a growing share of the web. A closed root is unreachable by
		// design and there is nothing to be done about it.
		const source = node.shadowRoot || node;
		const children = document.createDocumentFragment();
		for (const child of source.childNodes) {
			const converted = convert(child, depth + 1);
			if (converted) children.appendChild(converted);
		}

		if (!KEEP.has(tag)) {
			// Div-soup sites mark up paragraphs as block-level divs. Unwrapping
			// those would run every paragraph on the page together, so a block
			// holding only inline content becomes a <p> instead. Everything
			// else — layout scaffolding — is replaced by its children.
			const inlineOnly = ![...children.children].some((el) =>
				BLOCK.has(el.tagName.toLowerCase())
			);
			const blockish = /^(block|flow-root|list-item|flex|grid|table)/.test(
				style.display
			);
			if (blockish && inlineOnly && children.textContent.trim()) {
				const p = document.createElement("p");
				if (node.id) p.setAttribute("id", node.id);
				p.appendChild(children);
				return p;
			}
			// A fragment link often targets a wrapper div rather than the
			// heading inside it. Unwrapping loses the id, and the link that
			// survives the id pass below then points at nothing — so it moves
			// to the first element that took the wrapper's place.
			if (node.id && children.firstElementChild && !children.firstElementChild.id) {
				children.firstElementChild.setAttribute("id", node.id);
			}
			return children;
		}

		const el = document.createElement(tag);
		const allowed = ATTRS[tag] || [];
		for (const name of [...allowed, ...GLOBAL_ATTRS]) {
			if (!node.hasAttribute(name)) continue;
			let value = node.getAttribute(name);
			if (tag === "a" && name === "href") {
				// A fragment link stays a fragment link: absolutizing it would
				// point the saved document back at the live site for its own
				// table of contents, and would leave the id pass below with
				// nothing to match, stripping every anchor in the file.
				// Everything else takes the property, which is already absolute
				// — a relative href would break once the file sits in Downloads.
				if (!value.startsWith("#")) {
					value = node.href;
					if (!SAFE_LINK.test(value)) continue;
				}
			}
			if (tag === "code" && name === "class") {
				// Only the language token survives, for a future highlighter.
				const language = value.split(/\s+/).find((c) => /^language-/.test(c));
				if (!language) continue;
				value = language;
			}
			el.setAttribute(name, value);
		}
		// Anchors are kept only where the document links to them; carrying every
		// framework-generated id would be noise.
		if (node.id) el.setAttribute("id", node.id);
		// Collapsed content is still content, and <details> is declarative
		// enough to open without clicking anything.
		if (tag === "details") el.setAttribute("open", "");
		el.appendChild(children);
		return el;
	}

	async function runCapture() {
		// Reset per capture, not per injection — see the note where these are
		// declared.
		assets = [];
		seen = new WeakSet();

		await autoScroll();

		const root = document.createElement("div");
		// A document with no body is not a page worth capturing, but it must
		// report that rather than throw.
		const converted = document.body ? convert(document.body) : null;
		if (converted) root.appendChild(converted);

		// Second pass for ids: keep the ones some in-document link points at,
		// drop the rest. Inside an <svg> every id is left alone — a diagram
		// refers to its own defs by id through fill="url(#grad)" and
		// href="#icon", which this scan cannot see, and pruning them breaks
		// every gradient, mask and marker in the drawing.
		const targets = new Set(
			[...root.querySelectorAll('a[href^="#"]')].map((a) =>
				a.getAttribute("href").slice(1)
			)
		);
		for (const el of root.querySelectorAll("[id]")) {
			if (el.closest("svg")) continue;
			if (!targets.has(el.id)) el.removeAttribute("id");
		}

		// Third pass: drop what ended up empty. An <a> that wrapped nothing but
		// an icon under the size floor, a <p> that held only a button — both
		// leave a hollow tag behind, invisible in the HTML and a stray blank
		// line in the Markdown. Not doable during the walk, where "ended up
		// empty" is not yet knowable, and not before the id pass, where an id
		// still means "the page had one" rather than "something links here" —
		// an empty element that is a live anchor target is a landing place.
		//
		// Reverse document order is children-before-parents, so a wrapper is
		// judged after the descendants that might have emptied it.
		for (const el of [...root.querySelectorAll("*")].reverse()) {
			const tag = el.tagName.toLowerCase();
			if (EMPTY_OK.has(tag) || numbered(el) || el.id) continue;
			// Inside a drawing there is no text and nothing is litter.
			if (el.closest("svg")) continue;
			if (el.textContent.trim()) continue;
			// Textless but not contentless: removing the wrapper would take the
			// picture, the rule, the table cell or the anchor target with it.
			// `[id]` matters as much as the exemption above — the id survived
			// the pass before this one, so something in the document links
			// there, and <p><a id="ref"></a></p> would otherwise lose the
			// landing place along with the paragraph wrapped around it.
			if (el.querySelector("img, svg, hr, td, th, [id]")) continue;
			// Whitespace is not nothing, and neither is a line break. A page
			// that writes <b>Senior</b><em> </em><b>Engineer</b> keeps the only
			// space between those words inside a tag, and one that writes
			// alpha<strong><br></strong>beta keeps the line break there;
			// dropping the tag runs the words together either way. So an inline
			// tag holding whitespace or a <br> is unwrapped rather than removed
			// — the tag goes, what it was carrying stays.
			//
			// A block holding the same thing is the blank paragraph this pass
			// exists for and goes entirely: a break inside an empty block breaks
			// nothing, and the blank line it would leave is what is being
			// removed.
			//
			// The children move one at a time rather than through
			// replaceWith(...el.childNodes): that spread passes every child as
			// a separate argument, and a generated page with tens of thousands
			// of them under one tag would overflow the call stack and take the
			// whole capture down at the last step.
			const carries = el.textContent || el.querySelector("br");
			const parent = el.parentNode;
			if (carries && !BLOCK.has(tag) && parent) {
				while (el.firstChild) parent.insertBefore(el.firstChild, el);
			}
			el.remove();
		}

		const text = root.textContent.replace(/\s+/g, " ").trim();
		return {
			title: document.title || location.hostname,
			url: location.href,
			// The page's own language, so the saved file does not claim English
			// for a document that is not.
			lang: document.documentElement.lang || "",
			html: root.innerHTML,
			assets,
			words: text ? text.split(" ").length : 0,
			images: root.querySelectorAll("img").length,
		};
	}

	// Close the popup during the auto-scroll and reopen it, and a second capture
	// starts while the first is still walking: they would reset each other's
	// `assets` and `seen` mid-flight, and their scroll restores would fight.
	// Overlapping captures of one page have no meaning, so the second call
	// joins the first instead of starting a rival.
	let running = null;
	const capture = () => {
		if (!running) {
			running = runCapture().finally(() => {
				running = null;
			});
		}
		return running;
	};

	window.__singleFile = { capture };
})();
