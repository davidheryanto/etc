// Click an image shown smaller than its file is, and it opens over the page at
// its own size. A row of screenshots at width="220" is the case this is for:
// the layout needs them small, and the text inside them is then too small to
// read. Shared by the extension, which calls it from mount() in content.js,
// and the HTML exporter, which inlines this file whole, as it does
// notebook.js, so an export opens an image exactly as the extension does.
//
// A native modal <dialog>: the browser supplies the backdrop, the inert page
// and Escape. A click anywhere but an arrow or a thumbnail, any key but ←/→,
// or the wheel closes it — a closer look, then straight back to reading. No
// pan or zoom, no caption.
//
// ←/→ step through the images around it: its table, row by row, or its
// paragraph. A strip of their thumbnails under the image shows where you
// are, and a click on one goes to it. Past either end the keys wrap round,
// and the image fades in instead of sliding, so a wrap does not look like a
// step. Chosen in a prototype round over stopping at the ends (with or
// without a nudge there), closing there, and a wrap with nothing on screen
// to show it; the commit that added it has the verdict.
//
// For the mouse, an arrow at each side steps as the keys do. It shows only
// while the pointer is near it, and only the arrow itself lights and takes
// the click: the image stays clear, and a click anywhere else still closes.
// Chosen in a second prototype round over clicks on the image's outer
// quarters, a click on the image advancing, and arrows at the window's
// edges, always shown or shown while the mouse moves; that commit has the
// verdict. The arrows and the strip are placed on the window, not the
// image (theme.css), so they hold still while images of other sizes come
// and go, and the pointer can rest on an arrow to click through: a third
// round, whose commit has that verdict.
//
// The dialog's image and thumbnails reuse the src of images already on the
// page, which is file: or data: by the time it is there (content.js turned
// every remote one into a link before it could load), so nothing new is
// ever fetched. It sets no inline style, so a notebook's CSP has nothing to
// refuse; the slide is the Web Animations API, which is not one.
(() => {
	// The dialog's clearance from each window edge, in px. DUPLICATED in
	// theme.css (dialog.viewer img), which draws what this measures.
	const MARGIN = 24;
	// How much larger the dialog must show an image for a click to be
	// offered at all: one that grows by a few pixels is a flash, not a
	// closer look.
	const GAIN = 1.1;
	// How near the pointer must come to an arrow for it to show, in px from
	// its centre.
	const NEAR = 150;

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
	// goes. Unless the link goes to that same image, which links.js marks
	// data-zoom: then the dialog shows what the link would, without leaving
	// the page. A click with a modifier still follows it, as does a click on
	// one already at its own size, which has nothing closer to show.
	const own = (img) => {
		const link = img.closest("a");
		return !link || link.hasAttribute("data-zoom");
	};
	const zoomable = (img) => img.tagName === "IMG" && own(img) && gain(img) >= GAIN;
	// The images ←/→ step through, in reading order: every one in the clicked
	// image's table or paragraph whose click would be the viewer's. At any
	// size, so the sequence has no gaps: one already at its own size keeps
	// its place.
	const groupOf = (img) => {
		const box = img.closest("table, p");
		const all = box ? [...box.querySelectorAll("img")].filter(own) : [];
		return all.includes(img) ? all : [img];
	};
	const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

	window.imageViewer = (main) => {
		// Made on first use and appended to <body>, outside <main>: nothing
		// sits in the page until a reader asks for it. A live refresh
		// replaces the body wholesale, and an open dialog removed with it
		// closes itself, so there is nothing to tear down.
		let dialog = null;
		let view = null;
		let strip = null;
		let arrows = [];
		let group = [];
		let index = 0;

		// dir 1: the image comes in from the right, as → moves the strip
		// along; -1 from the left; 0 fades in where it is, for a wrap.
		const slide = (dir) => {
			if (still()) return;
			view.getAnimations().forEach((a) => a.cancel());
			const from = dir ? { transform: `translateX(${dir * 40}px)`, opacity: 0 } : { opacity: 0 };
			view.animate([from, { transform: "none", opacity: 1 }], {
				duration: 180,
				easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
			});
		};
		// Without dir, as the dialog opens: no slide, and the strip jumps.
		const show = (dir) => {
			view.src = group[index].src;
			view.alt = group[index].alt;
			if (strip.hidden) return;
			[...strip.children].forEach((t, i) => t.classList.toggle("on", i === index));
			// A strip longer than the window keeps the current one centred.
			const t = strip.children[index].getBoundingClientRect();
			const s = strip.getBoundingClientRect();
			strip.scrollBy({
				left: t.left + t.width / 2 - (s.left + s.width / 2),
				behavior: dir === undefined || still() ? "instant" : "smooth",
			});
			if (dir !== undefined) slide(dir);
		};
		const go = (next, dir) => {
			index = next;
			show(dir);
		};
		// A key or an arrow: one image along, wrapping round at either end.
		const step = (dir) => {
			if (group.length < 2) return;
			const next = index + dir;
			if (next >= 0 && next < group.length) go(next, dir);
			else go((next + group.length) % group.length, 0);
		};
		const key = (event) => {
			const dir = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
			if (!dir) return dialog.close();
			// The viewer's, not the browser's arrow-key scrolling.
			event.preventDefault();
			step(dir);
		};
		// An arrow shows while the pointer is within NEAR of its centre. The
		// side between the arrow and the window's edge counts as no distance
		// across, so it stays up all the way out to the edge. One at a time:
		// in a narrow window both can be in reach, and the nearer one shows.
		// No pointer, as when it leaves or the dialog opens: neither.
		const near = (pointer) => {
			const away = arrows.map((arrow) => {
				const r = arrow.getBoundingClientRect();
				// Not drawn: no strip.
				if (!pointer || !r.width) return Infinity;
				const across = Math.max(0, (r.left + r.width / 2 - pointer.x) * arrow.dataset.dir);
				return Math.hypot(across, pointer.y - (r.top + r.height / 2));
			});
			const nearest = away.indexOf(Math.min(...away));
			arrows.forEach((arrow, i) => arrow.classList.toggle("near", i === nearest && away[i] <= NEAR));
		};
		// A thumbnail goes to its image; a click between them closes, as a
		// click anywhere else does.
		const pick = (event) => {
			const thumb = event.target.closest("img");
			if (!thumb) return;
			event.stopPropagation();
			const next = [...strip.children].indexOf(thumb);
			if (next !== index) go(next, Math.sign(next - index));
		};

		const open = (img) => {
			if (!dialog) {
				dialog = document.createElement("dialog");
				dialog.className = "viewer";
				view = document.createElement("img");
				strip = document.createElement("div");
				strip.className = "strip";
				strip.addEventListener("click", pick);
				// Over a strip that scrolls, the wheel scrolls it rather than
				// closing the dialog. The strip is overflow: hidden (theme.css),
				// so this is the only way a reader scrolls it; deltaX is a
				// trackpad's sideways swipe.
				strip.addEventListener(
					"wheel",
					(event) => {
						if (strip.scrollWidth <= strip.clientWidth) return;
						event.stopPropagation();
						event.preventDefault();
						strip.scrollLeft += event.deltaX + event.deltaY;
					},
					{ passive: false }
				);
				// Divs, not buttons: a button would take the dialog's focus as
				// it opened, as the strip once did, and the keys already step.
				arrows = [-1, 1].map((dir) => {
					const arrow = document.createElement("div");
					arrow.className = dir < 0 ? "arrow prev" : "arrow next";
					arrow.dataset.dir = dir;
					arrow.setAttribute("aria-hidden", "true");
					return arrow;
				});
				dialog.append(view, strip, ...arrows);
				const close = () => dialog.close();
				// The backdrop is part of the dialog for events, so one
				// listener covers a click on the image and around it.
				dialog.addEventListener("click", (event) => {
					const arrow = event.target.closest(".arrow");
					if (arrow) step(+arrow.dataset.dir);
					else close();
				});
				dialog.addEventListener("keydown", key);
				dialog.addEventListener("wheel", close, { passive: true });
				dialog.addEventListener("pointermove", (event) => near({ x: event.clientX, y: event.clientY }));
				dialog.addEventListener("pointerleave", () => near(null));
				document.body.appendChild(dialog);
			}
			group = groupOf(img);
			index = group.indexOf(img);
			// Where the pointer is goes unknown until it moves over the dialog,
			// so an arrow shown as the last one closed is not shown now.
			near(null);
			strip.hidden = group.length < 2;
			dialog.classList.toggle("gallery", !strip.hidden);
			strip.replaceChildren(
				...(strip.hidden ? [] : group.map((g) => {
					const thumb = document.createElement("img");
					thumb.src = g.src;
					thumb.alt = g.alt;
					return thumb;
				}))
			);
			dialog.showModal();
			// After showModal: a closed dialog has no layout to centre by.
			strip.scrollLeft = 0;
			show();
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
			if (!zoomable(event.target)) return;
			// Or a marked link would navigate as the dialog opens.
			event.preventDefault();
			open(event.target);
		});
	};
})();
