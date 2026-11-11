// Renders one specimen PNG per font into this folder, for fonts.md.
//
//   node fonts/render.mjs <font-dir> [slug ...]
//
// <font-dir> holds the font files, which are not committed. Paths in FONTS are
// relative to it. To add a font: drop its files in <font-dir>, add one line to
// FONTS, and run again with its slug.
//
// Playwright comes from the markdown-preview-navigator test folder
// (run `npm install` there once).

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  resolve(here, "../vs-code-extensions/markdown-preview-navigator/test/package.json"),
);
const { chromium } = require("playwright");

// kind: "text" renders a large regular line, a heading, a paragraph and a small line.
//       "mono" renders a code sample and a look-alike row.
// italic and bold are optional. A missing style is left out, never synthesized.
const FONTS = [
  { slug: "inter", kind: "text", regular: "inter/InterVariable.ttf", italic: "inter/InterVariable-Italic.ttf", bold: "inter/InterVariable.ttf", variable: true },
  { slug: "public-sans", kind: "text", regular: "publicsans/fonts/otf/PublicSans-Regular.otf", italic: "publicsans/fonts/otf/PublicSans-Italic.otf", bold: "publicsans/fonts/otf/PublicSans-Bold.otf" },
  { slug: "ubuntu", kind: "text", regular: "ubuntu-classic/Ubuntu-Regular.ttf", italic: "ubuntu-classic/Ubuntu-Italic.ttf", bold: "ubuntu-classic/Ubuntu-Bold.ttf" },
  { slug: "helvetica-neue", kind: "text", regular: "helvetica/helvetica-neue-master/HelveticaNeue-Regular.otf", italic: "helvetica/helvetica-neue-master/HelveticaNeue-RegularItalic.otf", bold: "helvetica/helvetica-neue-master/HelveticaNeue-Bold.otf" },
  { slug: "circular", kind: "text", regular: "circular/circular-std-master/fonts/CircularStd-Book.otf", italic: "circular/circular-std-master/fonts/CircularStd-BookItalic.otf", bold: "circular/circular-std-master/fonts/CircularStd-Bold.otf" },
  { slug: "sf-pro", kind: "text", regular: "sf-pro/SF-Pro.ttf", italic: "sf-pro/SF-Pro-Italic.ttf", bold: "sf-pro/SF-Pro.ttf", variable: true },
  { slug: "ff-kievit", kind: "text", regular: "kievit/FF-Kievit-Pro-Medium.otf", bold: "kievit/FF-Kievit-Pro-Bold.otf" },
  { slug: "selane", kind: "text", regular: "selane/SelaneWebSTOne.otf" },
  { slug: "xcharter", kind: "text", regular: "xcharter/xcharter/opentype/XCharter-Roman.otf", italic: "xcharter/xcharter/opentype/XCharter-Italic.otf", bold: "xcharter/xcharter/opentype/XCharter-Bold.otf" },
  { slug: "bookerly", kind: "text", regular: "bookerly/Bookerly-Regular.ttf", italic: "bookerly/Bookerly-RegularItalic.ttf", bold: "bookerly/Bookerly-Bold.ttf" },
  { slug: "sf-mono", kind: "mono", regular: "sf-mono/SFMono-Regular.otf" },
  { slug: "geist-mono", kind: "mono", regular: "geist-mono/geist-mono-latin.woff2" },
  { slug: "dm-mono", kind: "mono", regular: "dm-mono/dm-mono-latin.woff2" },
  { slug: "consolas", kind: "mono", regular: "consolas/Consolas.ttf" },
  { slug: "monaco", kind: "mono", regular: "common/common-fonts/Monaco.otf" },
];

const MIME = { ".otf": "font/otf", ".ttf": "font/ttf", ".woff2": "font/woff2", ".woff": "font/woff" };

const TEXT = (f) => `
  <div class="big">Quiet Garage, Room 174</div>
  <h1>${f.bold ? "<b>" : ""}Sharp letters make long pages easy${f.bold ? "</b>" : ""}</h1>
  <p>Good type disappears. A reader should notice the argument, not the
  letters, whether the page is 3 lines or 3,000. ${f.italic ? "<i>Italics mark a title or a stress,</i>" : "Some cuts ship without an italic,"}
  ${f.bold ? "<b>bold marks what must not be missed,</b>" : "or without a bold,"} and figures
  like 0123456789 should sit quietly in the line.</p>
  <p class="small">Settings · Save changes · Updated 12 Nov 2026 at 09:41 · Il1 O0 rn m</p>`;

const MONO = () => `
<pre>function total(items, rate = 0.08) {
  // sum, then add tax
  const sum = items.reduce((a, b) =&gt; a + b.price, 0);
  return sum !== 0 ? sum * (1 + rate) : null;
}</pre>
<pre class="small">Il1| O0o 5S 8B 2Z  {}[]() &lt;= &gt;= != -&gt; =&gt;  "' \`~ ;:,.</pre>`;

const page = (f, faces) => `<!doctype html><meta charset="utf-8"><style>
${faces}
* { font-synthesis: none; }
body { margin: 0; background: #fff; }
#s { width: 720px; box-sizing: border-box; padding: 22px 28px; background: #fff;
     color: #1f2328; font-family: "spec"; -webkit-font-smoothing: antialiased; }
.big { font-size: 44px; line-height: 1.2; margin: 0 0 14px; font-weight: 400; }
h1 { font-size: 26px; line-height: 1.25; margin: 0 0 10px; font-weight: 400; }
p { font-size: 16px; line-height: 1.55; margin: 0 0 10px; }
.small { font-size: 13px; color: #59636e; margin: 0; }
b { font-weight: 700; } i { font-style: italic; }
pre { font-family: "spec"; font-size: 14px; line-height: 1.5; margin: 0 0 12px; }
</style><div id="s">${f.kind === "mono" ? MONO() : TEXT(f)}</div>`;

const [fontDir, ...only] = process.argv.slice(2);
if (!fontDir) {
  console.error("usage: node fonts/render.mjs <font-dir> [slug ...]");
  process.exit(1);
}

const face = (path, weight, style, variable) => {
  const data = readFileSync(resolve(fontDir, path)).toString("base64");
  return `@font-face { font-family: "spec"; font-weight: ${variable ? "100 900" : weight};
    font-style: ${style}; src: url(data:${MIME[extname(path)]};base64,${data}); }`;
};

// The installed Chrome, so no Playwright browser download is needed.
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 760, height: 600 } });
let failed = false;

for (const f of FONTS.filter((f) => !only.length || only.includes(f.slug))) {
  const faces = [face(f.regular, 400, "normal", f.variable)];
  if (f.italic) faces.push(face(f.italic, 400, "italic", f.variable));
  if (f.bold && !f.variable) faces.push(face(f.bold, 700, "normal"));
  const tab = await ctx.newPage();
  await tab.setContent(page(f, faces.join("\n")));
  // A font that fails to load falls back silently and still renders a clean
  // image, so check that every declared face loaded and was used.
  const status = await tab.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((x) => `${x.weight} ${x.style}: ${x.status}`);
  });
  const ok = status.every((s) => s.endsWith("loaded"));
  if (!ok) failed = true;
  await tab.locator("#s").screenshot({ path: resolve(here, `${f.slug}.png`) });
  console.log(`${ok ? "ok  " : "FAIL"} ${f.slug}  ${status.join(" | ")}`);
  await tab.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
