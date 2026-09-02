// Chrome shows a file:// text/plain document as a single <pre> holding the
// raw source. Read it out, render, and replace the page.
(() => {
	// Email mode: *.email.md (manifest loads email.css instead of theme.css
	// and no highlight.js). The page is a plain preview of what a mail
	// composer will show, and anything copied from it carries clean HTML —
	// see the "Email mode" section at the bottom.
	const EMAIL = /\.email\.md$/.test(location.pathname);
	// Notebook mode: *.ipynb (the manifest loads notebook.css on top of
	// theme.css and no email stylesheet). The source is JSON rather than
	// markdown, so build() takes a different first step and the same
	// everything-else: the image guards, the copy buttons, the rail, the
	// live refresh.
	const NOTEBOOK = /\.ipynb$/i.test(location.pathname);

	// Fonts are declared here, not in theme.css: relative url() in
	// content-script CSS resolves against the page's file:// folder, so the
	// bundled files 404. chrome.runtime.getURL gives the correct absolute
	// chrome-extension:// URLs (the files are in web_accessible_resources).
	// Weight ranges must cover 700: <strong> asks for bold, and a declared
	// range that stops short makes Chrome smear a synthetic bold over the
	// clamped weight instead of instantiating the real one from the
	// variable font.
	const FONTS = [
		['"Merriweather"', "normal", "300 900", "fonts/merriweather-latin.woff2"],
		['"Merriweather"', "italic", "300 900", "fonts/merriweather-latin-italic.woff2"],
		['"DM Sans"', "normal", "100 1000", "fonts/dm-sans-latin.woff2"],
		['"DM Mono"', "normal", "400", "fonts/dm-mono-latin.woff2"],
		// DM Mono tops out at Medium; declaring it up to 700 hands bold
		// requests the real 500 cut instead of a synthetic smear.
		['"DM Mono"', "normal", "500 700", "fonts/dm-mono-latin-medium.woff2"],
		// Every code block, and notebook stream output. DM Mono is a display
		// mono — drawn as a companion to DM Sans for short labels, with a low
		// x-height and no weight above Medium — which is right for an inline
		// chip and tiring across a fence. Geist Mono is drawn for reading code,
		// and it is the one candidate that both ships no `calt` (browsers
		// force calt on, so a ligating face would render != and -> as glyphs
		// nobody typed) and reserves no font name, so a subset needs no
		// internal rename to satisfy the OFL. Declared for every page; a face
		// is only fetched when something asks for it.
		['"Geist Mono"', "normal", "100 900", "fonts/geist-mono-latin.woff2"],
	];
	const fontStyle = document.createElement("style");
	fontStyle.textContent =
		FONTS.map(
			([family, style, weight, path]) =>
				`@font-face{font-family:${family};font-style:${style};font-weight:${weight};` +
				`src:url("${chrome.runtime.getURL(path)}") format("woff2");}`
		).join("\n") +
		// Symbols slice of the full Merriweather: arrows, math, shapes,
		// fractions, superscripts — everything Google's script subsets strip,
		// so these glyphs would otherwise fall through to a system font at
		// the wrong optical position. Same family, declared last, and the
		// unicode-range is exactly the complement of the subsets' coverage
		// so common punctuation keeps the variable weights.
		`\n@font-face{font-family:"Merriweather";font-style:normal;font-weight:300 900;` +
		`unicode-range:U+02D8-02D9,U+02DB,U+0302,U+0306-0307,U+030A-030D,U+030F-0313,` +
		`U+0315,U+031B,U+0320,U+0324-0328,U+032D-0332,U+0334-0338,U+0358,U+035C-035D,` +
		`U+035F,U+0361-0362,U+0394,U+039B-039C,U+03A7,U+03A9,U+03BB-03BC,U+03C0,U+03C7,` +
		`U+058F,U+0E3F,U+1DC4-1DCA,U+2070-2071,U+2074-2079,U+207F-2089,U+2100-2101,` +
		`U+2105-2106,U+2117,U+2126,U+212E,U+2144,U+2150-2156,U+2158-215E,U+2183-2184,` +
		`U+2190,U+2192,U+2194-2199,U+2202,U+2205-2206,U+220F,U+2211,U+2219-221A,U+221E,` +
		`U+222B,U+2236,U+2248,U+2260,U+2264-2267,U+2317,U+24B6,U+24D0,U+25A0-25A1,` +
		`U+25AA-25AB,U+25B2-25B9,U+25BC-25C3,U+25C6-25C7,U+25C9-25CC,U+25CF,U+25E6,` +
		`U+25FC,U+2611-2612,U+2661,U+2665,U+27A1,U+27E8-27E9,U+2B05-2B0B,U+2B1B-2B1C,` +
		`U+2B98-2B9F,U+2E17,U+2E38,U+3003,U+A717-A71A,U+AB53,U+FB01-FB02;` +
		`src:url("${chrome.runtime.getURL("fonts/merriweather-symbols.woff2")}") format("woff2");}` +
		// Same trick for the heading/label sans: DM Sans's own arrows, math
		// and π stay in the sans drawing. What it genuinely lacks (shapes,
		// fractions) falls through to Merriweather next in the stacks, so a
		// bundled face still wins before any system font.
		// U+0300/0301/0303 are omitted although the slice file carries them:
		// the latin woff2's real cmap includes those three marks beyond its
		// advertised subset ranges, and listing them here would put two faces
		// on one grapheme and break mark attachment.
		`\n@font-face{font-family:"DM Sans";font-style:normal;font-weight:100 1000;` +
		`unicode-range:U+02D8-02D9,U+02DB,U+0302,U+0306-0307,U+030A-030C,U+0312,` +
		`U+0326-0328,U+03C0,U+1EBC-1EBD,U+2074,U+2126,U+212E,U+2190,U+2192,U+2194-2199,` +
		`U+2202,U+2206,U+220F,U+2211,U+221A,U+221E,U+222B,U+2248,U+2260,U+2264-2265,` +
		`U+25CA,U+FB01-FB02;` +
		`src:url("${chrome.runtime.getURL("fonts/dm-sans-symbols.woff2")}") format("woff2");}`;
	if (!EMAIL) document.head.appendChild(fontStyle);

	// Defence in depth for notebooks, whose outputs are HTML the file author
	// wrote. The allowlist below is the primary guard; this is the backstop
	// that does not depend on the allowlist being right. Verified in Chrome:
	// a meta CSP inserted after parsing still governs content injected after
	// it. Fonts must stay reachable — they are chrome-extension: URLs from
	// web_accessible_resources — and style-src must allow the inline <style>
	// this file just appended.
	if (NOTEBOOK) {
		const csp = document.createElement("meta");
		csp.httpEquiv = "Content-Security-Policy";
		csp.content =
			"default-src 'none'; img-src file: data:; style-src 'unsafe-inline'; " +
			"font-src chrome-extension:; base-uri 'none'; form-action 'none'";
		document.head.appendChild(csp);
	}


	const pre = document.body && document.body.querySelector("pre");
	const initial = pre ? pre.textContent : document.body && document.body.textContent;
	if (!initial) return;

	// html: false keeps raw HTML in the markdown escaped instead of executed;
	// markdown-it additionally refuses javascript: URLs in links by default.
	// Highlighting only when the fence declares a known language — no
	// auto-detection, so unlabeled blocks stay plain instead of guessing wrong.
	// breaks only in email mode: a newline in a draft is a line break, the
	// way Enter is in a composer; in a document it is a soft wrap.
	const md = window.markdownit({
		html: false,
		linkify: true,
		breaks: EMAIL,
		highlight: (code, lang) => {
			if (window.hljs && lang && hljs.getLanguage(lang)) {
				return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
			}
			return "";
		},
	});

	// markdown-it's default validateLink whitelists only gif/png/jpeg/webp
	// among data: URIs, so an SVG logo renders as raw ![…](data:…) text. An
	// <img> loads SVG in the secure static mode: no script execution, no
	// external subresource loads (verified in Chrome — a <script> inside the
	// SVG never runs and an <image href="https://…"> inside it is never
	// fetched), so the phone-home guarantee below still holds with SVG allowed.
	// This override cannot restrict itself to images: markdown-it calls
	// validateLink from every link rule too, so it also makes data: valid as
	// an <a href>. That half is taken back in the anchor pass below.
	const okData = /^data:image\/(gif|png|jpeg|webp|avif|svg\+xml)[;,]/;
	const badProto = /^(vbscript|javascript|file|data):/;
	md.validateLink = (url) => {
		const str = url.trim().toLowerCase();
		return badProto.test(str) ? okData.test(str) : true;
	};

	const COPY_ICON =
		'<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';
	const DONE_ICON =
		'<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.5"/></svg>';

	// The schemes where following a link is NOT inert: javascript: and
	// vbscript: run, and data: opens an SVG as a document, where script runs
	// too. Everything else a document might legitimately use — http, mailto,
	// but also tel:, ftp:, ssh: — is left alone, because unwrapping it would
	// take a working link away from a reader who wrote it on purpose.
	const UNSAFE_PROTOCOLS = new Set([
		"javascript:", "vbscript:", "data:", "blob:", "filesystem:",
	]);

	// Source → <main>. Pure in the sense that matters: touches nothing
	// outside the element it returns, so the first paint and every refresh
	// go through the same path and cannot drift apart.
	const build = (source) => {
		// Render into a <template> first: its content is inert, so nothing
		// loads while parsing. Assigning the HTML straight to a live (or even
		// detached) element would start fetching <img> sources immediately —
		// and with html:false, ![](https://…) is the one way a document could
		// still reach the network. Keep only file:/data: images; remote ones
		// become plain links the reader can open deliberately.
		const template = document.createElement("template");
		if (NOTEBOOK) {
			const html = window.notebookRender.render(source, {
				md,
				hljs: typeof hljs === "undefined" ? null : hljs,
				// Chunked on purpose: spreading a whole encoded buffer into
				// String.fromCharCode exceeds V8's argument limit somewhere
				// past ~125KB and throws RangeError. A matplotlib SVG reaches
				// that easily, and the throw would abort the mount — and on a
				// refresh tick, exit before the next poll is scheduled.
				b64: (str) => {
					const bytes = new TextEncoder().encode(str);
					let binary = "";
					for (let i = 0; i < bytes.length; i += 0x8000) {
						binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
					}
					return btoa(binary);
				},
			});
			// Unparseable mid-save, or simply not a notebook. Signal it rather
			// than paint a broken page; mount() keeps the last good render.
			if (html === null) return null;
			template.innerHTML = html;
			// The security boundary, and it lives in notebook.js so that the
			// exporter runs this exact function rather than a second, weaker
			// copy. What arrives here is scaffolding built from escaped text;
			// each output's real HTML is still base64 in an attribute, and
			// hydrate() is what opens it — through the browser's own parser,
			// inside an inert <template>, behind an element/attribute
			// allowlist. Nothing untrusted has been parsed as markup yet.
			//
			// This is also why notebook.js emits no copy buttons: an inline
			// <svg> icon would have to be allowlisted, and inline SVG is
			// exactly what should not be. The buttons are added below, after.
			window.notebookRender.hydrate(template.content);
		} else {
			template.innerHTML = md.render(source);
		}
		// Email mode first: every image, local or remote, becomes the
		// placeholder — before the pass below would turn a remote one into
		// a link, which a composer would then show as a link.
		if (EMAIL) emailPlaceholders(template.content);
		for (const img of template.content.querySelectorAll("img")) {
			const src = img.getAttribute("src") || "";
			let local = false;
			try {
				const url = new URL(src, location.href);
				// file: must also have no host: //host/share resolves to a UNC
				// file URL, which on Windows would reach the network over SMB.
				local =
					(url.protocol === "file:" && url.hostname === "") ||
					url.protocol === "data:";
			} catch {}
			if (local) continue;
			const link = document.createElement("a");
			link.href = src;
			link.textContent = img.getAttribute("alt") || src;
			img.replaceWith(link);
		}

		// The validateLink widening above is for <img> only. As an <a href> a
		// data: URI is a different animal: navigating to an SVG opens it as a
		// document, where script does run. Chrome blocks top-level data:
		// navigation, but that is the browser's backstop, not ours — so any
		// anchor left pointing at data: is unwrapped to its own text. Covers
		// the raster types markdown-it has always let through as links, too.
		// Parsed, not prefix-matched: validateLink lowercases before testing,
		// so [x](DATA:image/svg+xml,…) passes it, and a "data:" string test
		// would then miss the anchor it let through.
		// A denial, not an allowlist. This once listed the four schemes it
		// would keep, because a notebook's output did not pass through
		// markdown-it and an <a href="javascript:…"> in a DataFrame repr had
		// nothing else stopping it. hydrate() holds that ground now, with a
		// strict allowlist over output HTML, so this pass is back to the one
		// job it was written for — and an allowlist here was taking tel: and
		// ftp: links out of ordinary markdown, which markdown-it accepts and
		// md2html.mjs still writes.
		for (const anchor of template.content.querySelectorAll("a[href]")) {
			let proto = "";
			try {
				proto = new URL(anchor.getAttribute("href"), location.href).protocol;
			} catch {}
			if (UNSAFE_PROTOCOLS.has(proto)) anchor.replaceWith(...anchor.childNodes);
		}

		const main = document.createElement("main");
		main.className = NOTEBOOK ? "prose nb" : "prose";
		main.appendChild(template.content);

		// GitHub-style task lists: markdown-it core leaves "[ ]"/"[x]" as text.
		// Never inside an output: "[x] done" printed by a cell is a string a
		// program wrote, not a checkbox the author drew, and the exporter
		// does this substitution before any output is decoded — so shaping it
		// here would make the two readers disagree about the same notebook.
		for (const li of main.querySelectorAll("li")) {
			if (li.closest(".output")) continue;
			const target =
				li.firstElementChild && li.firstElementChild.tagName === "P"
					? li.firstElementChild
					: li;
			const node = target.firstChild;
			if (!node || node.nodeType !== Node.TEXT_NODE) continue;
			const match = /^\[([ xX])\] /.exec(node.nodeValue);
			if (!match) continue;
			node.nodeValue = node.nodeValue.slice(match[0].length);
			const box = document.createElement("input");
			box.type = "checkbox";
			box.disabled = true;
			box.checked = match[1] !== " ";
			target.insertBefore(box, node);
			li.classList.add("task");
		}
		// After the task-list pass, which looks for the <p> this replaces.
		if (EMAIL) emailShape(main);

		// Copy button on fenced blocks. The <pre> scrolls horizontally, so the
		// button lives on a wrapper: inside the <pre> it would scroll away with
		// the code. Copies the source text, not the highlighted markup. One
		// delegated listener on <main>; the icon flips to a check as feedback.
		// navigator.clipboard needs a secure context and a user gesture —
		// file:// is one, and a click is the other.
		for (const pre of EMAIL || NOTEBOOK ? [] : main.querySelectorAll("pre")) {
			const block = document.createElement("div");
			block.className = "codeblock";
			pre.replaceWith(block);
			block.appendChild(pre);
			const button = document.createElement("button");
			button.type = "button";
			button.className = "copy";
			button.setAttribute("aria-label", "Copy code");
			button.title = "Copy";
			button.innerHTML = COPY_ICON;
			block.appendChild(button);
		}
		// Added after sanitising, so the icon markup never has to survive the
		// allowlist. notebook.js marks which outputs have something copyable.
		if (NOTEBOOK) {
			const addButton = (host, cls, label, title) => {
				const button = document.createElement("button");
				button.type = "button";
				button.className = cls;
				button.setAttribute("aria-label", label);
				button.title = title;
				button.innerHTML = COPY_ICON;
				host.prepend(button);
			};
			for (const block of main.querySelectorAll(".codeblock")) {
				addButton(block, "copy", "Copy code", "Copy");
			}
			for (const box of main.querySelectorAll(".output.copyable")) {
				addButton(box, "copy out", "Copy result", "Copy result");
			}
		}

		main.addEventListener("click", (event) => {
			const button = event.target.closest("button.copy");
			if (!button) return;
			// Which block the button sits in decides what it copies — that is
			// the whole affordance, so there is no mode to pick. A result
			// copies as tab-separated rows, which is what pastes into a
			// spreadsheet; anything spanning both halves is a selection, and
			// the browser's own Ctrl+C already handles that.
			let text;
			if (button.classList.contains("out")) {
				// Every result in the cell, in document order — a cell can
				// print a table and then a summary line, or two frames, and
				// copying only the first reported success while dropping the
				// rest. A table becomes tab-separated rows, which is what
				// pastes into a spreadsheet; a stream keeps its own text.
				text = [...button.parentElement.querySelectorAll("table, pre")]
					.filter((el) => !el.parentElement.closest("table, pre"))
					.map((el) =>
						el.tagName === "TABLE"
							? window.notebookRender.tableToTsv(el)
							: el.textContent.replace(/\n$/, "")
					)
					.join("\n");
			} else {
				const pre = button.parentElement.querySelector("pre");
				text = pre.textContent.replace(/\n$/, "");
			}
			navigator.clipboard.writeText(text).then(
				() => flash(button, "done", "Copied"),
				() => flash(button, "failed", "Copy failed")
			);
		});
		// Only the transient state class is toggled. Assigning className wiped
		// the `out` marker with it, so a result button became a code button
		// after its first use — and then threw on a table, which has no <pre>.
		const flash = (button, state, title) => {
			button.classList.remove("done", "failed");
			button.classList.add(state);
			button.title = title;
			button.innerHTML = state === "done" ? DONE_ICON : COPY_ICON;
			clearTimeout(button.timer);
			button.timer = setTimeout(() => {
				button.classList.remove("done", "failed");
				button.title = button.classList.contains("out") ? "Copy result" : "Copy";
				button.innerHTML = COPY_ICON;
			}, 1500);
		};

		// Heading ids: h2/h3 only (h1 is the title, h4+ is noise). Scoped to
		// the new <main>, which is not in the document yet — so a refresh
		// cannot collide with ids the outgoing render still holds.
		const used = new Set();
		for (const heading of outlineHeadings(main)) {
			if (heading.id) continue;
			const base =
				heading.textContent
					.toLowerCase()
					.trim()
					.replace(/[^\w\s-]/g, "")
					.replace(/\s+/g, "-") || "section";
			let id = base;
			for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
			used.add(id);
			heading.id = id;
		}
		return main;
	};

	// An <h2> inside a cell's output is data a DataFrame happened to print,
	// not a section of the document, so it earns neither an id nor a ToC
	// entry. Stated here once because md2html.mjs cannot see inside an
	// output at all — it assigns ids before hydrate() has opened one — and
	// the two readers must agree on what a #fragment points at.
	const outlineHeadings = (main) =>
		[...main.querySelectorAll("h2, h3")].filter((h) => !h.closest(".output"));

	// Table of contents: a flat list with a scroll-spy, no collapsing. Only
	// when it earns its place; theme.css hides it entirely on narrow windows.
	// Every window/document listener is bound to `signal`, so a refresh can
	// tear the whole rail down in one abort() instead of tracking handlers.
	const buildToc = (main, signal) => {
		const headings = outlineHeadings(main);
		if (headings.length < 3) return null;
		const toc = document.createElement("nav");
		toc.className = "toc";
		const label = document.createElement("p");
		label.className = "toc-label";
		label.textContent = "On this page";
		toc.appendChild(label);
		const list = document.createElement("ul");
		// Synthetic first entry back to the top: the h1 and intro prose sit
		// above the first h2, so without this the rail has no way there and
		// the spy would claim section 1 while the reader is still in the intro.
		const overview = document.createElement("li");
		overview.className = "h2";
		const topLink = document.createElement("a");
		topLink.href = "#";
		topLink.textContent = "Overview";
		overview.appendChild(topLink);
		list.appendChild(overview);
		for (const heading of headings) {
			const item = document.createElement("li");
			item.className = heading.tagName.toLowerCase();
			const link = document.createElement("a");
			link.href = "#" + heading.id;
			link.textContent = heading.textContent;
			item.appendChild(link);
			list.appendChild(item);
		}
		toc.appendChild(list);

		const links = [...list.querySelectorAll("a")];
		let ticking = false;
		// A clicked entry stays active even when the jump leaves a later
		// heading as the spy's winner (an h3 packed right under its h2 also
		// ends up above the 120px line). The jump itself fires a scroll
		// event, so scrolling can't release the pin — only real user input
		// (wheel, touch, key, mousedown) does.
		let pinned = -1;
		const spy = () => {
			ticking = false;
			if (pinned >= 0) {
				links.forEach((link, i) =>
					link.classList.toggle("active", i === pinned)
				);
				return;
			}
			// Index 0 is the Overview entry; heading i maps to link i + 1, so
			// Overview stays active until the first h2 crosses the spy line.
			let current = 0;
			// A short final section may never cross the 120px line even at
			// maximum scroll, so at the document's bottom the last heading
			// wins — but only when there is somewhere to scroll to, or a
			// fits-in-one-viewport page would start on its last entry.
			if (atBottom()) {
				current = links.length - 1;
			} else {
				for (let i = 0; i < headings.length; i++) {
					if (headings[i].getBoundingClientRect().top <= 120) current = i + 1;
				}
			}
			links.forEach((link, i) => link.classList.toggle("active", i === current));
		};
		const schedule = () => {
			if (!ticking) {
				ticking = true;
				requestAnimationFrame(spy);
			}
		};
		document.addEventListener("scroll", schedule, { passive: true, signal });
		// Resize reflows headings and flips the bottom predicate without a
		// scroll event, so it must re-run the spy too.
		window.addEventListener("resize", schedule, { signal });
		list.addEventListener("click", (event) => {
			const link = event.target.closest("a");
			if (!link) return;
			pinned = links.indexOf(link);
			schedule();
		});
		const unpin = () => {
			if (pinned < 0) return;
			pinned = -1;
			schedule();
		};
		// Pointer input inside the rail is ignored: its overscroll-behavior
		// is contain, so wheel/touch there can only scroll the rail, and
		// browsing a long rail shouldn't release the pin. mousedown outside
		// covers page-scrollbar drags.
		const unpinOutsideToc = (event) => {
			if (!toc.contains(event.target)) unpin();
		};
		window.addEventListener("wheel", unpinOutsideToc, { passive: true, signal });
		window.addEventListener("touchstart", unpinOutsideToc, { passive: true, signal });
		window.addEventListener("mousedown", unpinOutsideToc, { signal });
		const scrollKeys = new Set([
			"ArrowUp",
			"ArrowDown",
			"PageUp",
			"PageDown",
			"Home",
			"End",
			" ",
		]);
		window.addEventListener(
			"keydown",
			(event) => {
				if (scrollKeys.has(event.key)) unpin();
			},
			{ signal }
		);
		spy();
		return toc;
	};

	const atBottom = () => {
		const doc = document.documentElement;
		return (
			doc.scrollHeight > window.innerHeight &&
			window.innerHeight + window.scrollY >= doc.scrollHeight - 2
		);
	};

	// Swap the page to a new render. Wholesale: <main> and the rail are
	// rebuilt, nothing inside them survives (selection, open <details>, a
	// copy button mid-flash). What does survive is the reader's place:
	// scrollY as a number, or the bottom edge if they were reading at the
	// bottom — appending to a file while watching its tail is the common
	// case, and a fixed offset would leave them one paragraph short of it.
	// All of this runs in one task, so nothing paints in between: no flash.
	let teardown = null;
	const mount = (source) => {
		const wasAtBottom = teardown !== null && atBottom();
		const y = window.scrollY;
		const main = build(source);
		// Notebook JSON caught mid-save parses to nothing. Keep what is on
		// screen rather than blanking the page between two good renders.
		if (main === null) return;
		if (teardown) teardown();
		const aborter = new AbortController();
		const signal = aborter.signal;
		teardown = () => aborter.abort();
		document.body.replaceChildren(main);

		// Not a bare querySelector: an <h1> a cell printed is not the
		// document's title, and with no authored title above it — or none at
		// all — it would be what names the browser tab. The exporter uses the
		// authored title or the filename, and so does this.
		const h1 = [...main.querySelectorAll("h1")].find((h) => !h.closest(".output"));
		document.title = h1
			? h1.textContent
			: decodeURIComponent(location.pathname.split("/").pop());

		// Scroll before the rail is built: its first spy() reads heading
		// positions, which only mean something once <main> is attached and
		// the viewport is back where the reader left it.
		const toBottom = () =>
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
		if (wasAtBottom) {
			toBottom();
			// An image whose size isn't known yet grows the page after this
			// scroll and would leave the reader one image short of the tail.
			// Re-pin as each one lands; the listeners die with this render.
			for (const img of main.querySelectorAll("img")) {
				if (!img.complete) img.addEventListener("load", toBottom, { signal });
			}
		} else if (y) {
			window.scrollTo({ top: y, behavior: "instant" });
		}

		const toc = EMAIL ? null : buildToc(main, signal);
		if (toc) document.body.appendChild(toc);
		if (NOTEBOOK) pinHeaders(main, signal);
		// First child of <main>: float + sticky keeps it at the column's edge.
		if (EMAIL) main.prepend(copyAllButton);
	};

	// A pandas MultiIndex head is two header rows. Pinning both at top:0 stacks
	// them on top of each other, so each row needs the summed height of the
	// rows above it — a number that only exists after layout. The same total
	// insets the scroll-snap, so a snapped row lands just BELOW the header
	// rather than under it; one measurement, two uses, so they cannot drift.
	// One walk per TABLE, in drawing order, carrying the stack height with it.
	// Two heads each pinned at top:0 put the second on top of the first; and
	// a body's snap inset is the height of the headers ABOVE IT, not of every
	// header in the table — a second head sitting between two bodies is not
	// yet stuck when the first body is on screen, so charging that body for
	// its height dropped every row a header lower than the one it was
	// clearing. notebook.js owns the section order; see rowSections().
	const pinHeaders = (main, signal) => {
		const tables = [...main.querySelectorAll(".out-html table")];
		if (!tables.length) return;
		const measure = () => {
			for (const table of tables) {
				let top = 0;
				for (const section of window.notebookRender.rowSections(table)) {
					if (section.tagName === "THEAD") {
						for (const row of section.rows) {
							for (const cell of row.cells) cell.style.top = top + "px";
							top += row.getBoundingClientRect().height;
						}
					} else if (section.tagName === "TBODY") {
						// notebook.css makes every body row a snap target.
						for (const row of section.rows) row.style.scrollMarginTop = top + "px";
					}
				}
			}
		};
		measure();
		// A wrapped header changes height with the window, and the bundled
		// faces land after first paint.
		window.addEventListener("resize", measure, { signal });
		if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
	};

	// ---------------------------------------------------------------- Email mode
	// Two jobs. emailShape() turns the render into what a person would type
	// into a composer: every heading becomes a bold line, every paragraph a
	// line, a blank line between blocks, and images (which a file:// page
	// cannot hand to a composer) become a placeholder. emailPayload()
	// serialises a node to the clipboard pair — text/html with the few
	// styles that must survive a paste written inline on each element
	// (Gmail keeps style="", drops <style>), and a de-marked text/plain for
	// plain targets like a subject line. Both Ctrl+C on a selection and the
	// copy-all button go through it, so anything copied from an email
	// preview pastes the same way.
	//
	// No <p>. A composer has none: text typed into Gmail or Outlook web is a
	// <div> per line with <div><br></div> for a blank line, and that is what
	// the copy carries, so the paste is the same DOM the composer would have
	// built itself. A pasted <p> is foreign to it — Outlook stamps 1em
	// margins onto each one on the way in, and every block that Enter or
	// Shift+Enter splits off inherits them, so both keys read as "new
	// paragraph" (seen in the DOM of a pasted draft, 2026-09-02). The blank
	// line is the only spacing: the blocks that keep their tags (lists,
	// tables, code, quotes) carry margin:0 inline, see EMAIL_STYLE.
	const BLOCKS = "div, ul, ol, pre, blockquote, table, hr";
	const isList = (el) => el.tagName === "UL" || el.tagName === "OL";
	const isSpacer = (el) =>
		el.tagName === "DIV" && el.childNodes.length === 1 && el.firstChild.nodeName === "BR";
	const emailShape = (main) => {
		for (const heading of main.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
			const strong = document.createElement("strong");
			strong.append(...heading.childNodes);
			heading.replaceWith(lineOf(strong));
		}
		for (const p of main.querySelectorAll("p")) {
			p.replaceWith(lineOf(...p.childNodes));
		}
		// A blank line between neighbouring blocks, where a person would have
		// pressed Enter twice. Inside a quote and a loose list item too, so
		// an authored blank line survives there. Only between two blocks: a
		// tight item's children are inline (<strong>, <a>, a task box) and
		// get nothing. A nested list follows its item directly, so inside an
		// item a list never gets one either.
		for (const parent of [main, ...main.querySelectorAll("blockquote, li")]) {
			const item = parent.tagName === "LI";
			for (const block of [...parent.children]) {
				const next = block.nextElementSibling;
				if (!next || !block.matches(BLOCKS) || !next.matches(BLOCKS)) continue;
				if (item && (isList(block) || isList(next))) continue;
				block.after(spacer());
			}
		}
	};
	const lineOf = (...nodes) => {
		const div = document.createElement("div");
		div.append(...nodes);
		return div;
	};
	const spacer = () => lineOf(document.createElement("br"));
	const emailPlaceholders = (root) => {
		for (const img of root.querySelectorAll("img")) {
			const span = document.createElement("span");
			span.className = "attach";
			span.textContent = `attach in client: ${img.getAttribute("alt") || imageName(img)}`;
			img.replaceWith(span);
		}
	};
	// Basename of the source, bounded and decoded defensively: a data: URI
	// has no path worth showing, and a malformed %-sequence must not throw
	// and take the whole render with it.
	const imageName = (img) => {
		const src = img.getAttribute("src") || "";
		if (/^data:/i.test(src)) return "image";
		let name = src.split(/[?#]/)[0].split("/").pop();
		try {
			name = decodeURIComponent(name);
		} catch {}
		return name.slice(0, 80) || "image";
	};

	// Inline styles: no font, size or colour on text — the composer's own
	// defaults are the point. margin:0 on every block that keeps its tag,
	// because the spacer line from emailShape() is the spacing and a
	// browser default margin on top of it would double the gap. Keep
	// email.css in step with this table.
	const EMAIL_STYLE = {
		table: "border-collapse:collapse;margin:0",
		th: "border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top;font-weight:bold",
		td: "border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top",
		ul: "margin:0",
		ol: "margin:0",
		pre: "font-family:monospace;white-space:pre-wrap;margin:0",
		code: "font-family:monospace",
		blockquote: "margin:0;padding-left:1em;border-left:2px solid #ccc",
		hr: "border:0;border-top:1px solid #ccc;margin:0",
	};

	const emailHtml = (fragment) => {
		const box = document.createElement("div");
		box.appendChild(fragment);
		for (const el of box.querySelectorAll(".attach, .copy-all")) {
			// Whatever held only the placeholder — a line, or an <a> around a
			// linked image and then its line — goes with it. Two images on
			// consecutive lines leave a <br> between their placeholders; that
			// is not content either.
			let parent = el.parentElement;
			el.remove();
			while (parent && parent !== box && !parent.textContent.trim() && !parent.querySelector(":not(br)")) {
				const next = parent.parentElement;
				parent.remove();
				parent = next;
			}
		}
		// A removed line leaves its two spacers adjacent; one blank line, not
		// two, and none at either end.
		for (const div of [...box.querySelectorAll("div")]) {
			if (!isSpacer(div)) continue;
			const prev = div.previousElementSibling;
			if (!prev || isSpacer(prev) || !div.nextElementSibling) div.remove();
		}
		// Task boxes as characters: a composer strips <input>, and a clone
		// carries no checked state anyway.
		for (const check of box.querySelectorAll('input[type="checkbox"]')) {
			check.replaceWith(check.checked ? "\u2611 " : "\u2610 ");
		}
		for (const el of box.querySelectorAll("*")) {
			el.removeAttribute("id");
			el.removeAttribute("class");
			// Keep markdown-it's own text-align on table cells.
			const own = el.getAttribute("style") || "";
			const style = EMAIL_STYLE[el.tagName.toLowerCase()] || "";
			const merged = [style, own].filter(Boolean).join(";");
			if (merged) el.setAttribute("style", merged);
			else el.removeAttribute("style");
		}
		return box.innerHTML;
	};

	// De-marked plain text: block elements separated by blank lines, lists
	// as "- " / "1. ", links as "text (url)", table rows tab-separated.
	const emailText = (fragment) => {
		const out = [];
		const inline = (node) => {
			if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
			if (node.nodeType !== Node.ELEMENT_NODE) return "";
			const tag = node.tagName.toLowerCase();
			if (tag === "br") return "\n";
			if (tag === "input" && node.type === "checkbox") return node.checked ? "[x] " : "[ ] ";
			if (node.classList.contains("attach")) return "";
			const text = [...node.childNodes].map(inline).join("");
			if (tag === "a") {
				const href = node.getAttribute("href") || "";
				if (!text.trim()) return "";
				return text.trim() === href ? text : `${text} (${href})`;
			}
			return text;
		};
		// A <br> is followed by the source's own newline; fold the two.
		const fold = (text) => text.replace(/[ \t]*\n[ \t\n]*/g, "\n").trim();
		const block = (node, indent) => {
			if (node.nodeType === Node.TEXT_NODE) {
				if (node.nodeValue.trim()) out.push(indent + node.nodeValue.trim());
				return;
			}
			if (node.nodeType !== Node.ELEMENT_NODE) return;
			const tag = node.tagName.toLowerCase();
			if (tag === "ul" || tag === "ol") {
				let n = Number(node.getAttribute("start")) || 1;
				for (const li of node.children) {
					if (li.tagName !== "LI") continue;
					const marker = tag === "ol" ? `${n++}. ` : "- ";
					// Inline runs and <p> children (loose lists) become lines;
					// the first takes the marker, the rest indent under it. A
					// nested list is emitted where it stands, between them.
					const pad = " ".repeat(marker.length);
					let first = true;
					let run = "";
					const flush = () => {
						const text = fold(run);
						run = "";
						for (const line of text ? text.split("\n") : []) {
							out.push(indent + (first ? marker : pad) + line);
							first = false;
						}
					};
					for (const child of li.childNodes) {
						if (child.nodeType === Node.ELEMENT_NODE && /^[UO]L$/.test(child.tagName)) {
							flush();
							if (first) {
								out.push(indent + marker.trimEnd());
								first = false;
							}
							block(child, indent + "  ");
							// block() ends a list with a blank line; inside an
							// item the parent list owns that.
							if (out[out.length - 1] === "") out.pop();
						} else if (child.nodeType === Node.ELEMENT_NODE && /^(P|DIV)$/.test(child.tagName)) {
							flush();
							run = inline(child);
							flush();
						} else {
							run += inline(child);
						}
					}
					flush();
				}
				out.push("");
				return;
			}
			if (tag === "table") {
				for (const row of node.querySelectorAll("tr")) {
					out.push(indent + [...row.children].map((cell) => inline(cell).trim()).join("\t"));
				}
				out.push("");
				return;
			}
			if (tag === "pre") {
				out.push(node.textContent.replace(/\n$/, ""), "");
				return;
			}
			if (tag === "hr") {
				out.push(indent + "---", "");
				return;
			}
			// A container recurses; a line <div> (paragraph, heading) is a
			// block of its own, and a spacer's lone <br> folds to nothing.
			if (tag === "blockquote" || tag === "main" || (tag === "div" && node.querySelector(BLOCKS))) {
				for (const child of node.childNodes) block(child, indent);
				return;
			}
			// Lines, and anything else inline-ish.
			const text = fold(inline(node));
			if (text) out.push(indent + text, "");
		};
		for (const child of fragment.childNodes) block(child, "");
		return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
	};

	const emailPayload = (fragment) => ({
		html: emailHtml(fragment.cloneNode(true)),
		text: emailText(fragment),
	});

	// Fragment to copy: the selection when there is one, else the whole render.
	const emailSelection = () => {
		const selection = window.getSelection();
		const main = document.querySelector("main.prose");
		if (selection && !selection.isCollapsed && selection.rangeCount) {
			// cloneContents() drops the ancestors the range starts and ends
			// inside — the <a> around selected link text, the <li> and <ul>
			// around a selected item, the <td>…<table> around a cell. Wrap
			// the clone back in shallow clones of that chain up to <main>,
			// so the serialisers still see a link, a list, a table.
			const range = selection.getRangeAt(0);
			let fragment = range.cloneContents();
			let node = range.commonAncestorContainer;
			if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
			for (; node && node !== main && main && main.contains(node); node = node.parentElement) {
				const wrap = node.cloneNode(false);
				// A shallow <ol> clone keeps the list's start while the items
				// before the selection are gone; renumber from the first
				// item the range touches so "2." still pastes as 2.
				if (node.tagName === "OL") {
					const first = [...node.children].findIndex((li) => range.intersectsNode(li));
					wrap.start = (Number(node.getAttribute("start")) || 1) + Math.max(first, 0);
				}
				wrap.appendChild(fragment);
				fragment = document.createDocumentFragment();
				fragment.appendChild(wrap);
			}
			return fragment;
		}
		const fragment = document.createDocumentFragment();
		if (main) fragment.append(...[...main.childNodes].map((n) => n.cloneNode(true)));
		return fragment;
	};

	const copyAllButton = document.createElement("button");
	if (EMAIL) {
		document.addEventListener("copy", (event) => {
			if (!event.clipboardData) return;
			const { html, text } = emailPayload(emailSelection());
			event.clipboardData.setData("text/html", html);
			event.clipboardData.setData("text/plain", text);
			event.preventDefault();
			flashAll("done");
		});
		copyAllButton.type = "button";
		copyAllButton.className = "copy-all";
		copyAllButton.setAttribute("aria-label", "Copy all for email");
		copyAllButton.title = "Copy all";
		copyAllButton.innerHTML = COPY_ICON;
		copyAllButton.addEventListener("click", () => {
			const main = document.querySelector("main.prose");
			const fragment = document.createDocumentFragment();
			fragment.append(...[...main.childNodes].map((n) => n.cloneNode(true)));
			const { html, text } = emailPayload(fragment);
			navigator.clipboard
				.write([
					new ClipboardItem({
						"text/html": new Blob([html], { type: "text/html" }),
						"text/plain": new Blob([text], { type: "text/plain" }),
					}),
				])
				.then(() => flashAll("done"), () => flashAll("failed"));
		});
	}
	// Feedback: the icon flips for a moment. Same idiom as the code-block
	// copy button; no toast.
	const flashAll = (state) => {
		copyAllButton.className = "copy-all " + state;
		copyAllButton.innerHTML = state === "done" ? DONE_ICON : COPY_ICON;
		copyAllButton.title = state === "done" ? "Copied" : "Copy failed";
		clearTimeout(copyAllButton.timer);
		copyAllButton.timer = setTimeout(() => {
			copyAllButton.className = "copy-all";
			copyAllButton.innerHTML = COPY_ICON;
			copyAllButton.title = "Copy all";
		}, 1200);
	};

	mount(initial);

	const viewport = document.createElement("meta");
	viewport.name = "viewport";
	viewport.content = "width=device-width, initial-scale=1";
	document.head.appendChild(viewport);

	// Live refresh. A content script cannot fetch() a file:// URL (the page's
	// origin is a unique file: origin and Chrome refuses the scheme), so the
	// service worker reads the file on its behalf — and reads only the tab's
	// own URL, which it takes from the sender, never from the message. The
	// timer lives here, in the tab, where it survives; the worker is
	// stateless and free to be unloaded between reads. Polls once a second
	// while the tab is visible, pauses when hidden, and reads immediately on
	// becoming visible again — switching back from the editor is exactly
	// when an update is due. Identical text, an unreadable file (mid-save,
	// deleted) or an empty one leave the last good render in place.
	// Compared with line endings normalised: Chrome's text viewer already
	// folded CRLF to LF in the <pre> the first paint came from, while the
	// worker hands back the file's bytes as written — without this a CRLF
	// file would "change" on its first poll. markdown-it normalises the
	// same way before parsing, so the render is identical either way.
	const normalise = (text) => text.replace(/\r\n?/g, "\n");
	let last = normalise(initial);
	let timer = 0;
	let stopped = false;
	// Only the latest tick may act: a hidden→visible poll can start while a
	// timer poll is still awaiting its reply, and if the file changed between
	// the two reads the older reply may land last. Each tick takes a number
	// and drops its reply if another tick has started since.
	let generation = 0;
	const tick = async () => {
		timer = 0;
		if (stopped || document.visibilityState !== "visible") return;
		const mine = ++generation;
		let text;
		try {
			text = await chrome.runtime.sendMessage({ type: "read" });
		} catch (error) {
			// Extension reloaded or removed under this tab: the runtime is
			// gone for good. Stop quietly; the page stays as rendered.
			console.debug("local-viewer: refresh stopped —", String(error));
			stopped = true;
			return;
		}
		if (mine !== generation) return;
		if (typeof text === "string" && text) {
			text = normalise(text);
			if (text !== last) {
				last = text;
				mount(text);
			}
		}
		schedule();
	};
	const schedule = () => {
		if (!stopped && !timer) timer = setTimeout(tick, 1000);
	};
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState !== "visible") return;
		clearTimeout(timer);
		timer = 0;
		tick();
	});
	schedule();
})();
