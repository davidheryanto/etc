// A ```mermaid fence becomes the diagram it describes, as on GitHub, which
// runs the same Mermaid (12.2.0, checked with an `info` fence on 2026-10-25).
// Shared by the extension, which calls it from mount() in content.js, and the
// HTML exporter, which inlines this file and Mermaid's bundle whole, as it
// does image-viewer.js.
//
// Mermaid itself is not loaded with this file. Its bundle, mermaid.min.js, is
// 5.5 MB, which every Markdown page would parse for nothing, so `load` fetches
// it the first time a page has a diagram: content.js asks worker.js to inject
// it, and an export has it inline already.
//
// The drawing goes into the page as SVG markup, not as an <img>. As markup its
// labels are set in the page's own face (SF Pro on a Mac, the bundled Inter
// elsewhere; an image can reach neither a web font nor, here, the Inter it was
// measured in) and stay text, which Ctrl+F finds and a screen reader reads.
// Chosen by eye against an image with Inter embedded, which looked the same at
// 163 KB a diagram. What makes markup safe for a file that may not be
// trusted:
// - securityLevel "strict": labels are encoded, click handlers are off, and
//   Mermaid runs its output through DOMPurify.
// - SECURE below: a diagram cannot hand Mermaid its own CSS. With Mermaid's
//   defaults it can, and a url() in that CSS was fetched while Mermaid laid
//   the diagram out in the live page, before any choice of how to show the
//   result could stop it (verified 2026-10-25). With SECURE, no channel
//   tried reaches the drawing: themeCSS and themeVariables from a directive
//   or front matter, font keys, and `style`/`classDef` lines, whose grammar
//   refuses a url().
// - The page CSP content.js adds, for a channel nobody has found yet: it
//   refuses any url() the drawing does carry. An export has no CSP; see
//   md2html.mjs.
// - farFile() below: an image a diagram names for Mermaid to load is
//   refused before render() if it is a file on another computer, which the
//   CSP cannot tell from a local one.
(() => {
	// Configuration a diagram may not set for itself, through a %%{init}%%
	// directive or `config:` in its front matter. Mermaid's own six, then CSS
	// written into the page (themeCSS; themeVariables are spliced into it
	// unescaped), the face the page measures labels in, and HTML labels.
	const SECURE = [
		"secure", "securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering", "maxEdges",
		"themeCSS", "themeVariables", "fontFamily", "altFontFamily", "htmlLabels",
	];

	let ready = null; // Mermaid, initialised, once a page has asked for it
	let box = null; // where Mermaid lays a diagram out
	let queue = Promise.resolve(); // one render at a time
	let next = 0;
	// Each finished drawing, by fence, carried across live refreshes so an
	// unchanged diagram comes back in the same task as the page around it.
	// The key is the source and which occurrence of that source it is, as
	// content.js keys its toggles: two identical diagrams get a drawing each,
	// with ids of their own.
	let drawn = new Map();
	// What each fence of the last page showed, by position: an edited
	// diagram keeps its previous drawing until the new one is done, so the
	// page does not drop to the code and back on every save.
	let shown = [];

	const setup = (mermaid) => {
		// The page's own stack, so a label is measured and set in the face
		// around it. Sequence diagrams take their faces from keys of their
		// own and would otherwise use Mermaid's.
		const sans = getComputedStyle(document.documentElement).getPropertyValue("--sans").trim();
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: "strict",
			// A diagram that does not parse throws, and its fence stays code
			// with Mermaid's message, instead of a drawing of the error.
			suppressErrorRendering: true,
			htmlLabels: false,
			theme: "default",
			fontFamily: sans,
			themeVariables: { fontFamily: sans },
			sequence: { actorFontFamily: sans, noteFontFamily: sans, messageFontFamily: sans },
			secure: SECURE,
		});
		return mermaid;
	};

	// In <body>, because that is where a flowchart looks for its drawing
	// (select("body"), 12.2.0); laid out but unseen, so measuring works, and
	// fixed, so it adds nothing to the page's scroll size. Inside <body> it
	// also takes the body's tracking, as the drawing will in <main>, and as
	// the text Mermaid measures straight in <body> does.
	const layoutBox = () => {
		if (!box) {
			box = document.createElement("div");
			box.setAttribute("aria-hidden", "true");
			box.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none";
		}
		if (!box.isConnected) document.body.appendChild(box);
		return box;
	};

	// A diagram can name images for Mermaid to load: a flowchart's image
	// shape (img), a sequence participant's icon. render() loads them in the
	// live page, where the CSP's `file:` lets through a file URL with a host,
	// which on Windows is an SMB request — the reason content.js turns such
	// an <img> into a link. No CSP source can say "file: without a host"
	// (verified 2026-10-25), so the diagram is parsed first, by Mermaid's own
	// parser, which has undone any escape or spelling, and the first such
	// URL in a field Mermaid loads from is returned. Labels are not looked
	// at: a diagram may mention \\server\share without loading it.
	const LOADS = /^(img|icon|image|src|sprite)$/i;
	const farFile = (db) => {
		const seen = new Set();
		const visit = (value, key) => {
			if (typeof value === "string") {
				if (!LOADS.test(key)) return null;
				try {
					const url = new URL(value.trim(), location.href);
					return url.protocol === "file:" && url.hostname !== "" ? value : null;
				} catch {
					return null;
				}
			}
			if (!value || typeof value !== "object" || seen.has(value)) return null;
			seen.add(value);
			const entries =
				value instanceof Map
					? [...value].map(([k, v]) => [typeof k === "string" ? k : "", v])
					: Array.isArray(value) || value instanceof Set
						? [...value].map((v) => [key, v])
						: Object.entries(value);
			for (const [k, v] of entries) {
				const found = visit(v, k);
				if (found) return found;
			}
			return null;
		};
		return visit(db, "");
	};

	// The drawing, Mermaid's message, or null when a live refresh replaced
	// the body, box and all, mid-render: what came of that is not kept, and
	// the new page has asked for the fence itself.
	const draw = async (mermaid, source, width) => {
		// A capital letter, so no heading's id (always lower case) can be one.
		const id = "lvMermaid" + ++next;
		const sans = getComputedStyle(document.documentElement).getPropertyValue("--sans").trim();
		// Measured in a face still loading, every label box would be sized
		// for the fallback. The text matters: Inter's symbols are a separate
		// file, fetched only for the characters that need it.
		await document.fonts.load(`16px ${sans}`, source).catch(() => {});
		layoutBox().style.width = width + "px";
		let result;
		try {
			const far = farFile((await mermaid.mermaidAPI.getDiagramFromText(source)).db);
			if (far) return { error: `not drawn, as it would load ${far}, a file on another computer` };
			const { svg } = await mermaid.render(id, source, box);
			// A sequence diagram names its participants actor0, root-0… in
			// every diagram, and nothing refers to them by id (checked on
			// 12.2.0): prefixed like the rest, they cannot repeat or collide
			// with a heading. Ids that hold the diagram's already are unique.
			result = { svg: svg.replace(/\sid="([^"]*)"/g, (all, name) => (name.includes(id) ? all : ` id="${id}-${name}"`)) };
		} catch (error) {
			result = { error: String((error && error.message) || error) };
		}
		return box.isConnected ? result : null;
	};

	// The fence's panel shows the drawing in place of the code, which stays
	// in the panel, hidden, for its copy button (content.js). One that did
	// not parse stays code, with Mermaid's message above it.
	const show = (code, result) => {
		const pre = code.parentElement;
		let panel = pre.parentElement;
		if (!panel.classList.contains("codeblock") && !("fence" in panel.dataset)) {
			// No panel: a notebook's markdown cell, which has no copy button.
			panel = document.createElement("div");
			panel.dataset.fence = "";
			pre.replaceWith(panel);
			panel.appendChild(pre);
		}
		for (const old of panel.querySelectorAll(":scope > svg, :scope > .diagram-error")) old.remove();
		panel.classList.toggle("diagram", !result.error);
		if (result.error) {
			const note = document.createElement("p");
			note.className = "diagram-error";
			note.textContent = "Mermaid: " + result.error;
			panel.insertBefore(note, pre);
		} else {
			const template = document.createElement("template");
			template.innerHTML = result.svg;
			// Mermaid writes width="100%" and caps the drawing at its own width
			// with an inline max-width. A percentage asks a panel for nothing,
			// so a panel that grows to fit its content (theme.css, the
			// breakout) would never grow for a diagram. Swapped, the drawing
			// asks for its own width and still shrinks with the panel.
			const svg = template.content.firstElementChild;
			if (svg && svg.localName === "svg" && svg.style.maxWidth.endsWith("px")) {
				svg.style.width = svg.style.maxWidth;
				svg.style.maxWidth = "100%";
			}
			panel.insertBefore(template.content, pre);
		}
	};

	// `load` resolves to the Mermaid global; `drawn` runs after each drawing
	// that arrives later than the call, when the page around it has moved.
	window.mermaidDiagrams = (main, { load, drawn: onDrawn = () => {} }) => {
		// A fence written by the file; one a notebook cell printed is output.
		const codes = [...main.querySelectorAll("pre > code.language-mermaid")].filter(
			(code) => !code.closest(".output")
		);
		const keep = new Map();
		const seen = new Map();
		const now = [];
		const jobs = [];
		codes.forEach((code, i) => {
			const source = code.textContent;
			const nth = seen.get(source) || 0;
			seen.set(source, nth + 1);
			const key = `${nth}\n${source}`;
			const done = drawn.get(key);
			if (done) {
				keep.set(key, done);
				now[i] = done;
				show(code, done);
				return;
			}
			if (shown[i] && !shown[i].error) {
				now[i] = shown[i];
				show(code, shown[i]);
			}
			jobs.push({ code, key, source, i });
		});
		drawn = keep;
		shown = now;
		if (!jobs.length) return;
		for (const job of jobs) {
			queue = queue.then(async () => {
				// A newer render has replaced this page; it asks for its own.
				if (!job.code.isConnected) return;
				// A load that failed is asked for again by the next refresh.
				if (!ready) ready = load().then(setup, (error) => ((ready = null), Promise.reject(error)));
				const mermaid = await ready;
				if (!job.code.isConnected) return;
				// The panel's width, which a diagram that sizes itself to its
				// container (a Gantt chart) is drawn to. A fence in a closed
				// <details> has none, and takes the column's. Until it is drawn
				// the panel holds the source, so a source line wider than the
				// panel's shared edges widens it as it would any code
				// (theme.css, the breakout), and the drawing with it.
				const panel = job.code.closest(".codeblock, [data-fence]") || job.code.parentElement;
				const width = panel.clientWidth || main.clientWidth;
				// An earlier page, saved a moment before this one, may have
				// drawn the same fence while this waited its turn.
				const result = drawn.get(job.key) || (await draw(mermaid, job.source, width));
				if (!result) return;
				drawn.set(job.key, result);
				if (!job.code.isConnected) return;
				if (shown === now) now[job.i] = result;
				show(job.code, result);
				onDrawn();
			}).catch(() => {
				// Mermaid could not be loaded: the fences stay code.
			});
		}
	};
})();
