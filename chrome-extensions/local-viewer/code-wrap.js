// A button beside a code block's copy button wraps its long lines. A fence
// that holds prose — a prompt quoted as typed, a brief, a long comment —
// reads badly a scrollbar's drag at a time. Shared by the extension, which
// calls it from mount() in content.js, and the HTML exporter, which inlines
// this file whole, as it does image-viewer.js.
//
// Lines scroll until the reader asks: most fences are code, where a line is
// a unit and its indentation means something. The button shows only on a
// block whose lines run past its panel, and only on hover or keyboard
// focus, as the copy button does.
//
// One click wraps every block on the page, and the next unwraps them all: a
// document that quotes prose in one fence tends to in all of them (a
// transcript quotes every prompt), and a click per block was a click per
// prompt. A wrapped panel keeps the width it grew to, so the button stays
// under the pointer for the click that undoes it. Chosen in a prototype
// round over a toggle per block, as Docusaurus and Notion have; wrapping
// back to the panels' shared edges, which moved the button 250px out from
// under the pointer; and wrapping by the fence's language, with no button,
// which missed half the prose (a `markdown` fence, an untagged one, a
// comment in `bash`). The commit that added it has the verdict.
//
// Wrapping is display only: the copy button and a selection both give the
// lines as written. On paper every block wraps (theme.css), as a line that
// scrolls is simply cut off there.
(() => {
	// The reader's choice. Kept here, outside any one render: a live refresh
	// rebuilds <main> and calls this again, and the choice carries across. A
	// reload starts from scrolling again.
	let wrapped = false;
	const ICON =
		'<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h11M2.5 8h8.25a2.25 2.25 0 0 1 0 4.5H8"/><path d="M9.5 11 8 12.5 9.5 14"/><path d="M2.5 12.5h3"/></svg>';

	// Whether a block has lines longer than its panel. Unwrapped, that is
	// overflow. Wrapped, there is none left to measure, so count line boxes
	// instead: more of them than the source has lines means some wrapped,
	// and the block keeps its button to undo it. Half a line of slack for
	// rounding. A diagram's hidden source has no box and so no lines.
	const long = (pre) => {
		if (!wrapped) return pre.scrollWidth > pre.clientWidth;
		const style = getComputedStyle(pre);
		const height = pre.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
		const lines = pre.textContent.replace(/\n$/, "").split("\n").length;
		return height > (lines + 0.5) * parseFloat(style.lineHeight);
	};

	window.codeWrap = (main, signal) => {
		const blocks = [...main.querySelectorAll(".codeblock")];
		if (!blocks.length) return;
		for (const block of blocks) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "wrap";
			button.setAttribute("aria-label", "Wrap lines");
			button.title = "Wrap lines";
			button.innerHTML = ICON;
			// Before the copy button: next to it on screen, and first to
			// take focus, left to right.
			block.insertBefore(button, block.querySelector(":scope > button.copy"));
		}
		// Measured when asked, as the window and the fonts change what fits.
		const measure = () => {
			for (const block of blocks) block.classList.toggle("long", long(block.querySelector(":scope > pre")));
		};
		const apply = () => {
			main.classList.toggle("wrap-lines", wrapped);
			for (const block of blocks) block.querySelector(":scope > button.wrap").setAttribute("aria-pressed", String(wrapped));
			measure();
		};
		apply();
		main.addEventListener("click", (event) => {
			const button = event.target.closest("button.wrap");
			if (!button) return;
			// Every block above the one clicked grows or shrinks with it, so
			// hold that one where it was, under the pointer. Chrome's scroll
			// anchoring did not: in a transcript it slid 516px down the window.
			const block = button.parentElement;
			const top = block.getBoundingClientRect().top;
			wrapped = !wrapped;
			apply();
			window.scrollBy({ top: block.getBoundingClientRect().top - top, behavior: "instant" });
		});
		window.addEventListener("resize", measure, { signal });
		if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
	};
})();
