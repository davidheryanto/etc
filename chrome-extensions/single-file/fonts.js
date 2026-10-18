// The bundled faces and their unicode-range slices.
//
// DUPLICATED from local-viewer/content.js and md2html.mjs — the family,
// weight and range table is the same copy those two already document, four
// places in all. The weight ranges and the symbols range are load-bearing: a
// range that stops short of 700 makes Chrome smear a synthetic bold, and the
// symbols slice is cut as the exact complement of the latin subset so arrows,
// math and shapes stay in a bundled face instead of falling through to a
// system one. Change one, change them all.
//
// The whole table is kept even though a saved page names only some of it:
// popup.js inlines just the families theme.css and saved.css ask for, the
// way md2html does, so a face nothing uses costs nothing.
(() => {
	// The cmap of fonts/inter-symbols.woff2, read back from the file after it
	// was cut.
	const INTER_SYMBOLS =
		"U+0394,U+03A9,U+03BC,U+03C0,U+2070-2071,U+2074-208E,U+2090-209C,U+20A0-20AB," +
		"U+20AD-20AF,U+20B1-20B5,U+20B8-20BA,U+20BC-20C0,U+2100-2101,U+2103,U+2105-2106," +
		"U+2109,U+2113,U+2116-2117,U+211E-2121,U+2126,U+212A-212B,U+212E,U+2132,U+213B," +
		"U+214D,U+2150-217F,U+2183-2186,U+2189,U+2190,U+2192,U+2194-2199,U+21A9-21AA," +
		"U+21B0-21B1,U+21B3-21B5,U+21BA-21BB,U+21D0,U+21D2,U+21D4,U+21DE-21DF,U+21E4-21E5," +
		"U+21E7,U+21EA,U+2202,U+2205-2206,U+220F,U+2211,U+221A,U+221E,U+222B,U+2236,U+2248," +
		"U+2260,U+2264-2265,U+2295-2298,U+2303-2305,U+2318,U+2325-2327,U+232B,U+2380," +
		"U+2387,U+238B,U+23CE-23CF,U+2460-2468,U+24B6-24CF,U+24EA,U+25A0-25A2,U+25AA," +
		"U+25B2-25B3,U+25B6-25B7,U+25BA-25BD,U+25C0-25C1,U+25C4-25C7,U+25CA-25CB,U+25CF," +
		"U+25E6,U+25EF,U+2600,U+2605-2606,U+263C,U+2661,U+2665,U+266A-266B,U+26A0,U+2713," +
		"U+2717,U+2756,U+2764,U+2780-2788,U+27EF,U+27F5-27FA,U+2913,U+2B06,U+2B12-2B13," +
		"U+2B1C,U+2B24";

	window.FONT_FACES = [
		['"Inter"', "normal", "100 900", "inter-latin.woff2"],
		['"Inter"', "italic", "100 900", "inter-latin-italic.woff2"],
		['"DM Mono"', "normal", "400", "dm-mono-latin.woff2"],
		// DM Mono tops out at Medium; declaring it up to 700 hands bold
		// requests the real 500 cut instead of a synthetic smear.
		['"DM Mono"', "normal", "500 700", "dm-mono-latin-medium.woff2"],
		['"Geist Mono"', "normal", "100 900", "geist-mono-latin.woff2"],
		// Same family, declared last; the range shares no code point with the
		// latin file's, so common punctuation keeps the latin cut.
		['"Inter"', "normal", "100 900", "inter-symbols.woff2", INTER_SYMBOLS],
	];
})();
