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
		const start = window.scrollY;
		for (let step = 1; step <= 5; step++) {
			window.scrollTo(0, (document.documentElement.scrollHeight * step) / 5);
			await sleep(250);
		}
		// Images that started loading on the last step have not arrived yet.
		await sleep(500);
		window.scrollTo(0, start);
		await sleep(50);
	}

	// Assets are collected as URLs and fetched by the popup, which can read
	// cross-origin with host_permissions where the page itself cannot. The
	// document carries `asset:N` placeholders until then.
	const assets = [];
	const asset = (url) => {
		assets.push(url);
		return `asset:${assets.length - 1}`;
	};

	// A figure + caption, so a thing that could not be saved says so in the
	// document's own voice instead of vanishing. Both tags are allowlisted, so
	// markers pass through normalization unchanged and reach Markdown as an
	// image plus an italic line.
	function marker(caption, href, imageUrl) {
		const figure = document.createElement("figure");
		if (imageUrl) {
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
				return marker("Canvas graphic", null, node.toDataURL("image/png"));
			} catch {
				return marker("Canvas graphic (not saved)", null, null);
			}
		}
		if (tag === "video") {
			// Never the video itself: a 40MB inline media file is not a single
			// file in any useful sense. The poster frame plus a link is what an
			// offline copy can honestly carry.
			const poster = node.getAttribute("poster");
			const src = node.currentSrc || node.getAttribute("src") || "";
			// Streaming players hand their <video> a blob: URL backed by Media
			// Source Extensions. There is no fetchable address behind it, so
			// the marker names the page instead of pretending otherwise.
			const usable = SAFE_LINK.test(src);
			return marker(
				usable ? "Video" : "Video (not saved) — see the source page",
				usable ? src : location.href,
				poster ? new URL(poster, location.href).href : null
			);
		}
		if (tag === "audio") {
			const src = node.currentSrc || node.getAttribute("src") || "";
			return marker("Audio", SAFE_LINK.test(src) ? src : location.href, null);
		}
		if (tag === "iframe") {
			const box = node.getBoundingClientRect();
			if (box.width < MIN_FRAME || box.height < MIN_FRAME) return null;
			const src = node.getAttribute("src");
			if (!src) return null;
			// Cross-origin frame content is unreadable by design, so a link is
			// the most that is available.
			return marker(node.getAttribute("title") || "Embedded frame",
				new URL(src, location.href).href, null);
		}
		return undefined;
	}

	// Inline SVG is the one subtree handled by denylist rather than allowlist:
	// docs and engineering posts put real diagrams in it, and an allowlist over
	// SVG's ~80 element names would be a second spec. Everything executable is
	// removed; SVG presentation attributes are inert once it is gone.
	function scrubSvg(node) {
		const svg = node.cloneNode(true);
		for (const el of svg.querySelectorAll("script, foreignObject, a")) {
			el.remove();
		}
		const walk = (el) => {
			for (const attribute of [...el.attributes]) {
				const name = attribute.name.toLowerCase();
				const value = attribute.value.toLowerCase();
				if (name.startsWith("on") || value.includes("javascript:")) {
					el.removeAttribute(attribute.name);
				}
			}
			for (const child of el.children) walk(child);
		};
		walk(svg);
		return svg;
	}

	// Guards for a walk that runs on pages nobody here wrote. Slot assignment
	// makes the traversal a graph rather than a tree — a node can be reachable
	// both as a light child and through the slot it is assigned to — so a
	// visited set is what keeps a pathological component from looping forever.
	// The depth cap catches the other shape of the same problem; 200 is far
	// past any real document's nesting.
	const seen = new WeakSet();
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
		if (DROP_ROLES.has((node.getAttribute("role") || "").toLowerCase())) return null;
		if (node.getAttribute("aria-hidden") === "true" || node.hasAttribute("hidden")) {
			return null;
		}

		// If it was not visible, it was not content. Deterministic where a
		// class-name heuristic is not, and it takes out cookie banners, closed
		// modals and inactive tab panels without naming any of them.
		const style = getComputedStyle(node);
		if (style.display === "none" || style.visibility === "hidden") return null;

		if (tag === "svg") return scrubSvg(node);

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
			if (!src) return null;
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
				p.appendChild(children);
				return p;
			}
			return children;
		}

		const el = document.createElement(tag);
		const allowed = ATTRS[tag] || [];
		for (const name of [...allowed, ...GLOBAL_ATTRS]) {
			if (!node.hasAttribute(name)) continue;
			let value = node.getAttribute(name);
			if (tag === "a" && name === "href") {
				// The property, not the attribute: it is already absolute
				// against the page, which a relative href would not be once the
				// document is sitting in the downloads folder.
				value = node.href;
				if (!SAFE_LINK.test(value)) continue;
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

	async function capture() {
		await autoScroll();

		const root = document.createElement("div");
		const converted = convert(document.body);
		if (converted) root.appendChild(converted);

		// Second pass for ids: keep the ones some in-document link points at,
		// drop the rest.
		const targets = new Set(
			[...root.querySelectorAll('a[href^="#"]')].map((a) =>
				a.getAttribute("href").slice(1)
			)
		);
		for (const el of root.querySelectorAll("[id]")) {
			if (!targets.has(el.id)) el.removeAttribute("id");
		}

		const text = root.textContent.replace(/\s+/g, " ").trim();
		return {
			title: document.title || location.hostname,
			url: location.href,
			html: root.innerHTML,
			assets,
			words: text ? text.split(" ").length : 0,
			images: root.querySelectorAll("img").length,
		};
	}

	window.__singleFile = { capture };
})();
