// Chrome shows a file:// text/plain document as a single <pre> holding the
// raw source. Read it out, render, and replace the page.
(() => {
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
		`src:url("${chrome.runtime.getURL("fonts/merriweather-symbols.woff2")}") format("woff2");}`;
	document.head.appendChild(fontStyle);

	const pre = document.body && document.body.querySelector("pre");
	const source = pre ? pre.textContent : document.body && document.body.textContent;
	if (!source) return;

	// html: false keeps raw HTML in the markdown escaped instead of executed;
	// markdown-it additionally refuses javascript: URLs in links by default.
	// Highlighting only when the fence declares a known language — no
	// auto-detection, so unlabeled blocks stay plain instead of guessing wrong.
	const md = window.markdownit({
		html: false,
		linkify: true,
		highlight: (code, lang) => {
			if (window.hljs && lang && hljs.getLanguage(lang)) {
				return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
			}
			return "";
		},
	});

	// Render into a <template> first: its content is inert, so nothing loads
	// while parsing. Assigning the HTML straight to a live (or even detached)
	// element would start fetching <img> sources immediately — and with
	// html:false, ![](https://…) is the one way a document could still reach
	// the network. Keep only file:/data: images; remote ones become plain
	// links the reader can open deliberately.
	const template = document.createElement("template");
	template.innerHTML = md.render(source);
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

	document.body.innerHTML = "";
	const main = document.createElement("main");
	main.className = "prose";
	main.appendChild(template.content);
	document.body.appendChild(main);

	// GitHub-style task lists: markdown-it core leaves "[ ]"/"[x]" as text.
	for (const li of main.querySelectorAll("li")) {
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

	const h1 = main.querySelector("h1");
	document.title = h1
		? h1.textContent
		: decodeURIComponent(location.pathname.split("/").pop());

	// Table of contents: h2/h3 only (h1 is the title, h4+ is noise), no
	// collapsing — a flat list with a scroll-spy. Only when it earns its
	// place; theme.css hides it entirely on narrow windows.
	const headings = [...main.querySelectorAll("h2, h3")];
	const used = new Set();
	for (const heading of headings) {
		if (heading.id) continue;
		const base =
			heading.textContent
				.toLowerCase()
				.trim()
				.replace(/[^\w\s-]/g, "")
				.replace(/\s+/g, "-") || "section";
		let id = base;
		for (let n = 2; used.has(id) || document.getElementById(id); n++) {
			id = `${base}-${n}`;
		}
		used.add(id);
		heading.id = id;
	}
	if (headings.length >= 3) {
		const toc = document.createElement("nav");
		toc.className = "toc";
		const label = document.createElement("p");
		label.className = "toc-label";
		label.textContent = "On this page";
		toc.appendChild(label);
		const list = document.createElement("ul");
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
		document.body.appendChild(toc);

		const links = [...list.querySelectorAll("a")];
		let ticking = false;
		const spy = () => {
			ticking = false;
			let current = 0;
			// A short final section may never cross the 120px line even at
			// maximum scroll, so at the document's bottom the last heading
			// wins — but only when there is somewhere to scroll to, or a
			// fits-in-one-viewport page would start on its last entry.
			const doc = document.documentElement;
			const bottom =
				doc.scrollHeight > window.innerHeight &&
				window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
			if (bottom) {
				current = headings.length - 1;
			} else {
				for (let i = 0; i < headings.length; i++) {
					if (headings[i].getBoundingClientRect().top <= 120) current = i;
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
		document.addEventListener("scroll", schedule, { passive: true });
		// Resize reflows headings and flips the bottom predicate without a
		// scroll event, so it must re-run the spy too.
		window.addEventListener("resize", schedule);
		spy();
	}

	const viewport = document.createElement("meta");
	viewport.name = "viewport";
	viewport.content = "width=device-width, initial-scale=1";
	document.head.appendChild(viewport);
})();
