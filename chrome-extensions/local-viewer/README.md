# local-viewer

Minimal Chrome extension that renders local `.md` and `.ipynb` files as
clean HTML.
The "Oat" theme is a documentation look: sans headings and labels, a
sturdy serif body with tall leading on warm paper, mono code, slate text,
signal-red labels, cta-blue links.
Light mode only for now. Pages with 3+ headings get a fixed "On this page"
rail (h2/h3, scroll-spy highlight, leading "Overview" entry that returns
to the top) that hides on narrow windows. Fenced code blocks get a copy
button in the top-right corner, visible on hover; the icon flips to a
check once the source is on the clipboard.
Pairs with the Sublime side-bar **Open in Browser** entry
(`sublime-packages/User/side_bar_extras.py`), which includes `.md` files.

Save in Sublime; Chrome re-renders within a second, in place — no
reload, no flash, scroll position kept (pinned to the bottom if you were
reading the tail). Only the visible tab polls; a hidden tab catches up the
moment you switch back to it. The poll is a one-line content-script loop
asking the service worker to re-read the tab's own URL, nothing more.

## Notebooks: `*.ipynb`

A notebook renders as a **reading view**: open it from the file manager and
read it, with no editor, no kernel and no Jupyter server. Chrome serves a
`.ipynb` as text, so the same `<pre>` scrape, worker poll and live refresh the
markdown path uses apply unchanged.

A notebook is not a document, and it does not read like one. Prose is
commentary; the **cell** is the unit, and its two halves are bound by
**proximity rather than by a box** — 8px between code and its result, 29px
between cells, with almost nothing drawn. The input is a filled panel and the
output is bare page: that inversion is the only thing separating two blocks of
monospace text, which matters the moment a cell prints instead of returning a
table. Code and results break out to the right, into the gutter the ToC rail
does not use; prose keeps its own measure.

- **Code** is Geist Mono, not the DM Mono used for inline chips in prose — a
  face drawn for reading code rather than for setting labels.
- **DataFrames** get hairline rules and no header rule, tabular numerals, and
  alignment decided per *column* from the body rows, so a header never sits
  right-aligned over left-aligned text. pandas' `border="1"` and its `<style>`
  are dropped; a MultiIndex index-name row folds into the first column header;
  long `snake_case` labels wrap at their underscores.
- **Tall tables** cap at `70vh` and scroll inside their own box with the header
  pinned — stacked correctly when a MultiIndex gives it two header rows.
  Scrolling snaps to row starts, so no row is ever sliced by the opaque header.
- **Copy**: hover the code to copy the code, hover the result to copy it as
  tab-separated text that pastes into a spreadsheet. Position is the scope, so
  there is no mode to choose; anything spanning both halves is a selection, and
  `Ctrl+C` already handles that.
- **Errors** keep their traceback colours; **widgets** show a placeholder,
  because they need a live kernel and there is not one.

`df.style` output is deliberately **not** honoured — its colours are flattened
to the theme. Honouring them means letting a file's generated `<style>` onto
the page, and CSS reaches the network through `url()`, `@import` and
`@font-face`. See the security notes.

## Email drafts: `*.email.md`

A file named `something.email.md` renders in **email mode**: a plain
preview of what a mail composer will show — system sans, black on white,
no rail, no syntax colouring, every heading a bold line — and anything
copied out of it pastes clean into Gmail or Outlook web.

- **Copy** is intercepted: `Ctrl+C` on a selection, right-click Copy, and
  the copy-all button (in the gutter at the column's right edge, sticky, faded until hover) all yield the same
  payload — `text/html` with the few styles that must survive a paste
  written inline on each element (Gmail keeps `style=""`, drops `<style>`),
  and a de-marked `text/plain` for plain targets like a subject line
  (`- ` lists, `text (url)` links, tab-separated table rows).
- The HTML names **no font, size or colour**, so each composer applies its
  own defaults; it *is* what a person would have typed there.
- Tables get thin grey borders and a bold header row; code blocks and
  inline code are monospace; blockquotes indent with a grey rule.
- A newline is a line break (`breaks: true`), the way Enter is in a composer.
- Images can't be handed to a composer from a `file://` page: the preview
  shows a dashed "attach in client" placeholder and the copy omits it.
- Gmail web and Outlook web are the targets. Classic Outlook desktop
  (Word engine) is not.

`email.css` is the preview stylesheet; the same values are inlined at copy
time by `EMAIL_STYLE` in `content.js` — change one, change both.

## Export a standalone HTML file

```sh
node md2html.mjs notes.md            # -> notes.html, beside the source
node md2html.mjs run.ipynb           # -> run.html, same renderer as the tab
node md2html.mjs notes.md /tmp/x.html
```

One self-contained file — same markdown-it, same highlight.js, same
`theme.css`, fonts and local images base64-inlined — for sending to
someone who doesn't have this extension. No dependencies to install;
needs only Node. The fonts put a ~480KB floor under the output, whatever
the document's length. A local image that can't be read or isn't a
recognised type is warned about and left as a plain relative link;
remote `https://` images stay remote.

The script duplicates the parts of `content.js` that shape a document
(markdown-it options, task lists, heading slugs, the ToC and its
scroll-spy, the code copy button, the `@font-face` table). Each is marked `DUPLICATED` there —
change one, change both, or the same file renders two ways. The
deliberate differences are marked `OMITTED`: remote images are kept as
written rather than de-fanged, because an export is your own document
published on purpose, not an untrusted file you happened to open; and
there is no live refresh, because a static file has nothing to watch.

## Install (once)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. On the extension's card: **Details** → enable **Allow access to file URLs**

## Files

| File                 | What                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `manifest.json`      | MV3. Three content-script entries on `file:///*`: `*.md` / `*.markdown` (theme.css + highlight.js), `*.email.md` (email.css, no highlighter), and `*.ipynb` (theme.css + notebook.css + notebook.js). |
| `notebook.js`        | `.ipynb` → HTML. Loaded by the content script **and** by `md2html.mjs` into its vm sandbox, so a notebook cannot render two ways — there is one copy, not a `DUPLICATED` pair. Returns a string; the DOM allowlist that actually gates output HTML lives in `content.js`. |
| `notebook.css`       | The notebook reading view. Loaded after `theme.css` and scoped under `.nb`, so it wins on specificity without `!important` — see the convention note at the top of the file. |
| `content.js`         | Reads the raw source from the `<pre>` Chrome wraps text files in, renders, swaps the body; builds the ToC and the copy buttons. Then polls the worker for changes and re-renders in place. |
| `worker.js`          | Service worker. One message handler: re-read the sender tab's own `file://` URL and return the text. No timers, no state. |
| `markdown-it.min.js` | markdown-it 14.1.0 dist file, vendored. Verified byte-identical to the official npm tarball.     |
| `highlight.min.js`   | highlight.js 11.11.1 common build, vendored, same verification. Colors only fences that declare a language. |
| `email.css`          | Email-mode preview: neutral sans, no colours, only the table/code/quote rules that are also inlined on copy. |
| `theme.css`          | The look and ToC styles. Swap or edit this file to retheme (`@font-face` lives in `content.js` — see comment there).              |
| `fonts/`             | woff2 subsets, vendored. All SIL OFL.                                                            |
| `md2html.mjs`        | Node script: renders a `.md` or `.ipynb` to one standalone `.html` using the same libraries, theme and fonts. Not part of the extension. |

## Fonts

Everything is bundled, so rendering is identical on Linux and macOS —
no dependence on system fonts. All open-licensed.

| Face         | Role                                     |
| ------------ | ---------------------------------------- |
| Merriweather | body text (weight 500, 700 for strong)   |
| DM Sans      | h1–h3, h4–h6 eyebrows, tables, ToC       |
| DM Mono      | inline `code` chips in prose             |
| Geist Mono   | notebook code and machine output         |

Merriweather and DM Sans are variable fonts (latin subsets), each
paired with a symbols slice cut from its full upstream font — arrows,
math, shapes, fractions, everything Google's script subsets strip —
so notation renders in the bundled faces instead of falling through to
a system font. The sans stacks also list Merriweather before
`system-ui`: what DM Sans genuinely lacks (shapes, fractions) still
resolves to a bundled face. DM Mono tops out at Medium, so bold code
renders the real 500 cut rather than a synthetic bold.

## Security posture

- Runs only on `file://` URLs ending in `.md` / `.markdown` / `.ipynb` — no
  access to web pages.
- **Notebook output is treated as hostile.** A notebook's `text/html` output is
  arbitrary HTML written by whoever wrote the file, which is the one thing the
  markdown path never has to handle. Two independent layers apply:
  - `notebook.js` strips `<script>`, `<style>`, `<iframe>`, event handlers and
    `style` attributes at the string level, then `content.js` runs a **DOM
    allowlist** over the parsed, inert tree — the pass that actually decides
    what renders, because a regex cannot be trusted against markup. Unknown
    elements are unwrapped rather than deleted, so a table inside something
    unrecognised still reads. The allowlist is scoped to the output boxes: the
    cell scaffolding is this extension's own markup, not the file's.
  - A page **CSP** (`default-src 'none'; img-src file: data:`) is injected for
    notebooks as a backstop that does not depend on the allowlist being right.
    CSS is not inert — `url()`, `@import` and `@font-face` all reach the
    network — and this closes that path whatever slips through.
- Notebook SVG output renders as `<img src="data:image/svg+xml;base64,…">`,
  never inline: an `<img>` loads SVG in the secure static mode, where script
  does not run and external subresources are not fetched. Inline SVG is a
  sanitiser's weakest ground, so it is never parsed as markup.
- No network, no storage. The service worker exists only to re-read a file
  the tab already shows: it takes the URL from the message sender (which
  Chrome fills in from the tab, so a message can't point it elsewhere),
  refuses anything that isn't a markdown `file://` URL, and holds no state
  between reads. `host_permissions: file:///*` is what lets it read the file.
  `web_accessible_resources` exposes only the bundled font files, and only
  to `file://` pages.
- `markdownit({ html: false })`: raw HTML in the markdown is escaped, not executed;
  markdown-it also rejects `javascript:` link targets by default.
- `data:` URIs are allowed only as image sources, and only for the raster types
  markdown-it whitelists plus `image/svg+xml` — page captures are full of inline
  SVG logos, and an `<img>` loads SVG in the secure static mode, where script
  does not run and external subresources are not fetched. markdown-it applies one
  `validateLink` to links and images alike, so the widening reaches `<a href>`
  too; every anchor resolving to `data:` is unwrapped to its text after render,
  which also closes the raster `data:` links markdown-it has always permitted.
- Remote images are never fetched: rendering happens in an inert `<template>`,
  and any `<img>` whose source isn't `file:`/`data:` is replaced with a plain
  link before the page sees it — a document can't phone home just by being opened.
- MV3 forbids remotely hosted code, and both libraries are vendored anyway:
  - `markdown-it.min.js` sha256 `38c70a1e7ca91ab40e2d9e6e60129851a717ed1c7d4acbbdd41bf9503791cf68`
  - `highlight.min.js` sha256 `c4a399dd6f488bc97a3546e3476747b3e714c99c57b9473154c6fb8d259b9381`
