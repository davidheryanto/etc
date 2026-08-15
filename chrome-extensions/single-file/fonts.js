// The bundled faces and their unicode-range slices.
//
// DUPLICATED from markdown-viewer/content.js and md2html.mjs — the family,
// weight and range table is the same three-way copy those two already document.
// The weight ranges and the ranges themselves are load-bearing: a range that
// stops short of 700 makes Chrome smear a synthetic bold, and the symbols
// slices are cut as the exact complement of the latin subsets so arrows, math
// and shapes stay in a bundled face instead of falling through to a system one.
// Change one, change all three.
(() => {
	const MERRIWEATHER_SYMBOLS =
		"U+02D8-02D9,U+02DB,U+0302,U+0306-0307,U+030A-030D,U+030F-0313," +
		"U+0315,U+031B,U+0320,U+0324-0328,U+032D-0332,U+0334-0338,U+0358,U+035C-035D," +
		"U+035F,U+0361-0362,U+0394,U+039B-039C,U+03A7,U+03A9,U+03BB-03BC,U+03C0,U+03C7," +
		"U+058F,U+0E3F,U+1DC4-1DCA,U+2070-2071,U+2074-2079,U+207F-2089,U+2100-2101," +
		"U+2105-2106,U+2117,U+2126,U+212E,U+2144,U+2150-2156,U+2158-215E,U+2183-2184," +
		"U+2190,U+2192,U+2194-2199,U+2202,U+2205-2206,U+220F,U+2211,U+2219-221A,U+221E," +
		"U+222B,U+2236,U+2248,U+2260,U+2264-2267,U+2317,U+24B6,U+24D0,U+25A0-25A1," +
		"U+25AA-25AB,U+25B2-25B9,U+25BC-25C3,U+25C6-25C7,U+25C9-25CC,U+25CF,U+25E6," +
		"U+25FC,U+2611-2612,U+2661,U+2665,U+27A1,U+27E8-27E9,U+2B05-2B0B,U+2B1B-2B1C," +
		"U+2B98-2B9F,U+2E17,U+2E38,U+3003,U+A717-A71A,U+AB53,U+FB01-FB02";

	const DM_SANS_SYMBOLS =
		"U+02D8-02D9,U+02DB,U+0302,U+0306-0307,U+030A-030C,U+0312," +
		"U+0326-0328,U+03C0,U+1EBC-1EBD,U+2074,U+2126,U+212E,U+2190,U+2192,U+2194-2199," +
		"U+2202,U+2206,U+220F,U+2211,U+221A,U+221E,U+222B,U+2248,U+2260,U+2264-2265," +
		"U+25CA,U+FB01-FB02";

	window.FONT_FACES = [
		['"Merriweather"', "normal", "300 900", "merriweather-latin.woff2"],
		['"Merriweather"', "italic", "300 900", "merriweather-latin-italic.woff2"],
		['"DM Sans"', "normal", "100 1000", "dm-sans-latin.woff2"],
		['"DM Mono"', "normal", "400", "dm-mono-latin.woff2"],
		// DM Mono tops out at Medium; declaring it up to 700 hands bold
		// requests the real 500 cut instead of a synthetic smear.
		['"DM Mono"', "normal", "500 700", "dm-mono-latin-medium.woff2"],
		[
			'"Merriweather"', "normal", "300 900",
			"merriweather-symbols.woff2", MERRIWEATHER_SYMBOLS,
		],
		['"DM Sans"', "normal", "100 1000", "dm-sans-symbols.woff2", DM_SANS_SYMBOLS],
	];
})();
