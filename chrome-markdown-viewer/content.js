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
	fontStyle.textContent = FONTS.map(
		([family, style, weight, path]) =>
			`@font-face{font-family:${family};font-style:${style};font-weight:${weight};` +
			`src:url("${chrome.runtime.getURL(path)}") format("woff2");}`
	).join("\n");
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

	document.body.innerHTML = "";
	const main = document.createElement("main");
	main.className = "prose";
	main.innerHTML = md.render(source);
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
			for (let i = 0; i < headings.length; i++) {
				if (headings[i].getBoundingClientRect().top <= 120) current = i;
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
