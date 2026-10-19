// Click an image shown smaller than its file is, and it opens over the page at
// its own size. A row of screenshots at width="220" is the case this is for:
// the layout needs them small, and the text inside them is then too small to
// read. Shared by the extension, which calls it from mount() in content.js,
// and the HTML exporter, which inlines this file whole, as it does
// notebook.js, so an export opens an image exactly as the extension does.
//
// A native modal <dialog>: the browser supplies the backdrop, the inert page
// and Escape. A click anywhere, any key or the wheel closes it — a closer
// look, then straight back to reading. One image at a time: no gallery, no
// pan or zoom, no caption.
//
// The dialog's image reuses the src of an image already on the page, which
// is file: or data: by the time it is there (content.js turned every remote
// one into a link before it could load), so nothing new is ever fetched.
// It sets no inline style, so a notebook's CSP has nothing to refuse.
(() => {
	// The dialog's clearance from each window edge, in px. DUPLICATED in
	// theme.css (dialog.viewer img), which draws what this measures.
	const MARGIN = 24;
	// How much larger the dialog must show an image for a click to be
	// offered at all: one that grows by a few pixels is a flash, not a
	// closer look.
	const GAIN = 1.1;

	// The width the dialog would show the image at, over the width it has
	// now. The dialog never scales an image up — the viewer never enlarges
	// one — so the most it can show is the file's own pixels, less whatever
	// the window cannot fit. Measured when asked rather than once at mount:
	// an image may load late, and the window can be resized.
	// clientWidth excludes the border, as naturalWidth has none.
	const gain = (img) => {
		if (!img.complete || !img.naturalWidth || !img.clientWidth) return 0;
		const fit = Math.min(
			1,
			(innerWidth - 2 * MARGIN) / img.naturalWidth,
			(innerHeight - 2 * MARGIN) / img.naturalHeight
		);
		return (img.naturalWidth * fit) / img.clientWidth;
	};
	// An image inside a link keeps the link: the author chose where a click
	// goes.
	const zoomable = (img) => img.tagName === "IMG" && !img.closest("a") && gain(img) >= GAIN;

	window.imageViewer = (main) => {
		// Made on first use and appended to <body>, outside <main>: nothing
		// sits in the page until a reader asks for it. A live refresh
		// replaces the body wholesale, and an open dialog removed with it
		// closes itself, so there is nothing to tear down.
		let dialog = null;
		const open = (img) => {
			if (!dialog) {
				dialog = document.createElement("dialog");
				dialog.className = "viewer";
				dialog.appendChild(document.createElement("img"));
				const close = () => dialog.close();
				// The backdrop is part of the dialog for events, so one
				// listener covers a click on the image and around it.
				dialog.addEventListener("click", close);
				dialog.addEventListener("keydown", close);
				dialog.addEventListener("wheel", close, { passive: true });
				document.body.appendChild(dialog);
			}
			const view = dialog.firstChild;
			view.src = img.src;
			view.alt = img.alt;
			dialog.showModal();
		};
		// The cursor says which images open. Decided as the pointer arrives,
		// for the same reason gain() is measured when asked.
		main.addEventListener("pointerover", (event) => {
			const img = event.target;
			if (img.tagName === "IMG") img.classList.toggle("zoom", zoomable(img));
		});
		// A click with a modifier held is the browser's (Shift extends a
		// selection), not a request to look closer.
		main.addEventListener("click", (event) => {
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			if (zoomable(event.target)) open(event.target);
		});
	};
})();
