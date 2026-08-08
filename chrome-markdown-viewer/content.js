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
		['"Source Serif 4"', "normal", "400 700", "fonts/source-serif-4-latin.woff2"],
		['"Source Serif 4"', "italic", "400 700", "fonts/source-serif-4-latin-italic.woff2"],
		['"Mona Sans"', "normal", "400", "fonts/mona-sans-regular.woff2"],
		['"Mona Sans"', "normal", "500", "fonts/mona-sans-medium.woff2"],
		['"Mona Sans"', "normal", "600 700", "fonts/mona-sans-semibold.woff2"],
		['"Geist Mono"', "normal", "400 700", "fonts/geist-mono-latin.woff2"],
	];
	const fontStyle = document.createElement("style");
	fontStyle.textContent =
		FONTS.map(
			([family, style, weight, path]) =>
				`@font-face{font-family:${family};font-style:${style};font-weight:${weight};` +
				`src:url("${chrome.runtime.getURL(path)}") format("woff2");}`
		).join("\n") +
		// Symbols slice of the full Source Serif: arrows, math, shapes,
		// fractions, Greek — everything Google's latin subset strips, so
		// these glyphs would otherwise fall through to a system font at the
		// wrong optical position. Same family, declared last, and the
		// unicode-range is exactly the complement of the latin subset's
		// coverage so common punctuation keeps the variable weights.
		`\n@font-face{font-family:"Source Serif 4";font-style:normal;font-weight:400 700;` +
		`unicode-range:U+0374-0375,U+037E,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03CE,` +
		`U+03D7,U+03D9,U+03DB,U+03DD,U+03E1,U+2070-2071,U+2074-2079,U+207D-2089,` +
		`U+208D-208E,U+20A1,U+20A4,U+20A6-20A7,U+20A9,U+20AB,U+20AE,U+20B1-20B2,` +
		`U+20B4-20B5,U+20B8-20BA,U+20BD,U+20BF,U+2113,U+2116-2117,U+2120,U+2126,` +
		`U+212E,U+2153-2154,U+215B-215E,U+2190,U+2192,U+2196-2199,U+2202,U+2206,` +
		`U+220F,U+2211,U+2219-221A,U+221E,U+222B,U+2248,U+2260,U+2264-2265,U+25A0,` +
		`U+25B2-25B3,U+25B6-25B7,U+25BC-25BD,U+25C0-25C1,U+25C6,U+25C9-25CA,` +
		`U+2610-2611,U+266A,U+2713,U+2752;` +
		`src:url("${chrome.runtime.getURL("fonts/source-serif-4-symbols.woff2")}") format("woff2");}`;
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
			const protocol = new URL(src, location.href).protocol;
			local = protocol === "file:" || protocol === "data:";
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
			// maximum scroll, so at the document's bottom the last heading wins.
			const bottom =
				window.innerHeight + window.scrollY >=
				document.documentElement.scrollHeight - 2;
			if (bottom) {
				current = headings.length - 1;
			} else {
				for (let i = 0; i < headings.length; i++) {
					if (headings[i].getBoundingClientRect().top <= 120) current = i;
				}
			}
			links.forEach((link, i) => link.classList.toggle("active", i === current));
		};
		document.addEventListener(
			"scroll",
			() => {
				if (!ticking) {
					ticking = true;
					requestAnimationFrame(spy);
				}
			},
			{ passive: true }
		);
		spy();
	}

	const viewport = document.createElement("meta");
	viewport.name = "viewport";
	viewport.content = "width=device-width, initial-scale=1";
	document.head.appendChild(viewport);
})();
