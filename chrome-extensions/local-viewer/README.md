# local-viewer

Minimal Chrome extension that renders local `.md`, `.ipynb`, `.json` and
`.jsonl` files as clean HTML.
The "Oat" theme is a documentation look: sans headings and labels, a
sturdy serif body with tall leading on warm paper, mono code, slate text,
signal-red labels, cta-blue links.
Light mode only for now. Pages with 3+ headings get a fixed "On this page"
rail (h2/h3, scroll-spy highlight, leading "Overview" entry that returns
to the top) that hides on narrow windows. Fenced code blocks get a copy
button in the top-right corner, visible on hover; the icon flips to a
check once the source is on the clipboard.
Pairs with the Sublime side-bar **Open in Browser** entry
(`sublime-packages/User/side_bar_extras.py`), which includes every
extension this renders.

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

## Data: `*.json` and `*.jsonl`

A data file renders as a **collapsible tree**, and the file is parsed once
while a row exists only for what is open. That is the whole answer to big
files: a million-item array is ten thousand collapsed ranges of a hundred,
and usually one open range. The first paint opens breadth-first under a
budget of 400 rows — the shape of the file, level by level — and follows only
the first range of a list, since its second hundred look like its first.
Chrome's own "Pretty-print" is what a local `.json` gets otherwise: indented
text, nothing to fold, no outline.

- **The rail** lists the top level: an object's keys with a count beside
  each, a list's ranges. Same scroll-spy as a document's headings.
- **Header**: kind, size in entries and bytes, and for a list of records the
  **fields** they carry with the share of records that has each — the schema
  at a glance, sampled from the first 2,000 when there are more.
- **Click a key** to copy its path, JS-style (`items[3].nested.x`, with
  bracket-quoting only for a key that needs it). Hover a container for a
  button that copies its value pretty-printed. A selection copies as text;
  the quotes around a string are drawn, so they are not in it.
- **Alt+click** a triangle to open everything below it; **Expand all**
  does the same from the root. Both stop at 5,000 rows and say so.
- **Long strings** are clipped at 400 characters with a "… N more" that
  unclips. A string that is a URL is a link.
- **Integers past 2^53** keep their digits: Chrome's `JSON.parse` hands a
  reviver each number's source text, which is kept verbatim via
  `JSON.rawJSON`. The reviver runs only on a file with a digit run long
  enough to need it, since it slows the parse several times over.
- **Find** (`/` or Ctrl+F, which is taken over on a data page) searches the
  parsed values, not the page: Chrome's own find sees only the rows that
  happen to be open and calls the rest of the file absent. The query is a
  case-insensitive substring, or `/pattern/flags` for a regex, tested
  against keys and scalar values — and against paths when it contains a
  `.` or `[`, so `meta.url` works while a bare `meta` does not hit every
  descendant of that key. Every match on a row the page has is
  highlighted, including rows opened or unclipped later; a match inside a
  closed node is counted but cannot be drawn until it is opened. Enter and
  shift+Enter step through matches: the current one has its ancestors
  opened, the row marked, its highlight stronger, a clipped string
  unclipped. The walk is one pass over the values, so it is milliseconds
  on a megabyte and about a second on a hundred; it stops counting at
  10,000 matches.
- **Live refresh** carries the open nodes and the find query across, so a
  tree does not snap shut on every save and the count updates without the
  page jumping. The poll slows from one second to one per two megabytes of
  file, ten at most.

**JSON Lines** is the same tree with the file as its root: records are its
children, in ranges past a hundred, and each record is parsed the first time
its range opens. A line that does not parse is one bad row naming its line
number, and the rest of the file still reads; blank lines are not records.
Copying the root, a range or a record copies the file's own lines.

Two things `JSON.parse` decides that the file did not: integer-like keys
are listed first, in numeric order, whatever order the file wrote them in,
and a duplicate key keeps its last value. There is no filter mode (only
matching rows shown) and no dark mode.

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
  own defaults; it *is* what a person would have typed there — down to the
  DOM: a `<div>` per line and `<div><br></div>` for a blank line, which is
  how Gmail and Outlook web both hold typed text. There is no `<p>`: Outlook
  stamps 1em margins onto a pasted one, and every block that Enter or
  Shift+Enter splits off inherits them, so both keys read as "new
  paragraph" until the paste is edited away.
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

## Test

```sh
node test/run.mjs          # CHROME=/path/to/chrome to override the binary
node test/run.mjs email    # one case
```

Runs the real `content.js` against the fixtures in `test/fixtures/` and
checks what it renders and what it copies. Headless Chrome will not grant
an unpacked extension `file://` scripting, so the harness serves the
extension's files over loopback, holds the fixture in a `<pre>` the way
Chrome wraps a text file, rewrites the path so `content.js` sees a `.md`,
and stubs `chrome.runtime` and `navigator.clipboard`. The clipboard stub
captures rather than reimplements: every copy assertion is on what the
page's own button or copy handler produced. Needs only Node and Chrome.

## Install (once)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. On the extension's card: **Details** → enable **Allow access to file URLs**

## Files

| File                 | What                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `manifest.json`      | MV3. Four content-script entries on `file:///*`: `*.md` / `*.markdown` (theme.css + highlight.js), `*.email.md` (email.css, no highlighter), `*.ipynb` (theme.css + notebook.css + notebook.js), and `*.json` / `*.jsonl` (theme.css + json.css + json.js, no markdown-it). |
| `json.js`            | `.json` / `.jsonl` → a lazy tree, built as DOM rather than an HTML string: nothing here is markup, every value lands through `textContent`. Rows exist only for open nodes; ranges of 100 past that many entries; the field summary; path and value copy; `expandedPaths()` so a refresh reopens what was open. Extension-only — there is no export for data. |
| `json.css`           | The data view. Loaded after `theme.css` and scoped under `.jsn`, the same convention as `notebook.css`. |
| `notebook.js`        | `.ipynb` → HTML. Loaded by the content script **and** by `md2html.mjs` into its vm sandbox, so a notebook cannot render two ways — there is one copy, not a `DUPLICATED` pair. `render()` builds the page and carries each output's HTML as base64; `hydrate()` opens that in a real parser behind an allowlist. Both readers run both. |
| `notebook.css`       | The notebook reading view. Loaded after `theme.css` and scoped under `.nb`, so it wins on specificity without `!important` — see the convention note at the top of the file. |
| `content.js`         | Reads the raw source from the `<pre>` Chrome wraps text files in, renders, swaps the body; builds the ToC and the copy buttons. Then polls the worker for changes and re-renders in place. |
| `worker.js`          | Service worker. One message handler: re-read the sender tab's own `file://` URL and return the text. No timers, no state. |
| `markdown-it.min.js` | markdown-it 14.1.0 dist file, vendored. Verified byte-identical to the official npm tarball.     |
| `highlight.min.js`   | highlight.js 11.11.1 common build, vendored, same verification. Colors only fences that declare a language. |
| `email.css`          | Email-mode preview: neutral sans, no colours, only the table/code/quote rules that are also inlined on copy. |
| `theme.css`          | The look and ToC styles. Swap or edit this file to retheme (`@font-face` lives in `content.js` — see comment there).              |
| `fonts/`             | woff2 subsets, vendored. All SIL OFL.                                                            |
| `md2html.mjs`        | Node script: renders a `.md` or `.ipynb` to one standalone `.html` using the same libraries, theme and fonts. Not part of the extension. |
| `test/`              | `run.mjs` and its fixtures — see Test above. Not part of the extension.                       |

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

- Runs only on `file://` URLs ending in `.md` / `.markdown` / `.ipynb` /
  `.json` / `.jsonl` — no access to web pages.
- **Data is inert.** A `.json` never touches a parser for markup: `json.js`
  builds elements and sets `textContent`, so a string containing `<script>`
  is a string containing `<script>`. The one thing a data file can put on the
  page that reaches out is a string that is a URL, which becomes an ordinary
  `http(s)` link — followed only on purpose, and `rel="noreferrer"`.
- **Notebook output is treated as hostile.** A notebook's `text/html` output is
  arbitrary HTML written by whoever wrote the file, which is the one thing the
  markdown path never has to handle. It is never sanitised as a string:
  - `notebook.js` **`render()`** emits that payload base64-encoded in a
    `data-nb-html` attribute. base64 has no `<`, no quote and no `&`, so a
    crafted output cannot end the attribute, close the wrapper, or change how
    a single character around it parses. The page's structure no longer
    depends on what an output contains.
  - `notebook.js` **`hydrate()`** decodes it in a real browser parser inside an
    inert `<template>` and applies an **element/attribute allowlist** before
    the result is attached to any document. Unknown elements are unwrapped
    rather than deleted, so a table inside something unrecognised still reads;
    `href`/`src` are judged by the URL parser, not by matching text.
  - Both readers run the *same* `hydrate()`. The extension calls it directly;
    `md2html.mjs` inlines the whole of `notebook.js` into the page it writes
    and calls it the same way, so an export is guarded by exactly what the
    extension is guarded by — the same file, not a copy of part of it. This replaced a string-level clean that four independent
    review passes each found a different way through — a slash where a space
    was expected, an entity-encoded scheme, an unterminated tag completed by
    the wrapper's own `</div>`. Matching markup with regexes is the losing
    half of that job; the parser now does it.
  - An output's images must resolve to this machine — a `data:` image, or a
    hostless `file:`/relative path. A remote one becomes a plain link, so the
    reader still sees the label and follows it only on purpose. This is the
    rule the extension has always applied to markdown images, extended to
    output HTML and, unlike the markdown rule, applied inside the export too:
    the author chose the images in their prose, but nobody chose the ones a
    notebook's output prints. A hosted `file://host/share` URL is refused
    with the remote ones — that is a UNC path, which on Windows reaches the
    network over SMB.
  - Two element sets, not one, because the two passes are reading different
    authors. The payload set is the narrow one above, and it keeps **no
    `class`**: the CSS that would have used pandas' `dataframe` is stripped
    with every other `<style>`, so an output class can only collide with one
    of the viewer's own — `class="toc"` bound an export's scroll spy to a
    hostile list, `class="codeblock"` put a code-copy button on an output.
    The **scaffolding** set adds what a rendered document needs and an output
    has no business supplying — a heading `id` for the ToC, a disabled
    task-list checkbox, an `<ol start>`, `class` itself — and is only ever
    applied to markdown-it's output and this extension's own markup. A
    markdown cell cannot smuggle HTML into it: markdown-it runs `html: false`.
  - Link schemes split the same way. Output HTML gets an **allowlist** — only
    schemes that are inert to follow, since nobody chose those links. Authored
    markdown gets a **denial** of the ones that run (`javascript:`,
    `vbscript:`, `data:`, `blob:`), because `tel:`, `ftp:` and `ssh:` are all
    things a document legitimately says and an allowlist was quietly taking
    them out of ordinary `.md` files.
  - A page **CSP** (`default-src 'none'; img-src file: data:`) is injected for
    notebooks as a backstop that does not depend on the allowlist being right.
    CSS is not inert — `url()`, `@import` and `@font-face` all reach the
    network — and this closes that path whatever slips through. An **export
    has no CSP**: it is a plain HTML file, so there the allowlist is the only
    layer. Verified against a hostile fixture in both readers: opening either
    one makes no network request at all.
- An **exported notebook needs JavaScript for its cell output**, and says so in
  a `<noscript>` note. That is the cost of the boundary above: the output is
  markup only after the reader's own browser has parsed and checked it. Prose,
  code, headings and the ToC are all static and read fine without script.
- A heading inside a cell's *output* is invisible to the document's own
  furniture: no id, no ToC entry, no scroll-spy weight, and an `<h1>` there
  never names the browser tab. It is data a DataFrame happened to print, not a
  section — and the exporter could not see it in any case, since it assigns
  ids before the output has been opened. Both readers agree on what a
  `#fragment` points at and what the page is called.
- `attachment:` is resolved in markdown-it's **output**, not in the cell
  source: only a real image token is an `<img src="…">` by then, so the
  question of what counts as an image never has to be answered twice. Both
  inline and reference-style images resolve; a `[link](attachment:…)`, an
  inline-code sample, an indented block, a fence and an escaped `!` are all
  left exactly as written, without a single rule about any of them.
- Authored table alignment (`| ---: |`) survives as a class. markdown-it
  states it as `style="text-align:right"`, and `style` is the one attribute
  the allowlist can never keep, so notebook.js restates it on markdown-it's
  own output before that pass runs.
- Tables are read on their real grid, not row by row. A MultiIndex DataFrame
  gives its index headers a `rowspan`, so continuation rows are short — which
  is what used to misalign the columns and shift every value left when pasted
  into a spreadsheet. One grid walk, shared by the alignment pass and by both
  readers' copy buttons.
- Row sections are walked in the order the browser **draws** them, which is
  neither source order nor "heads, bodies, feet": only the first `<thead>` is
  promoted to the top and only the first `<tfoot>` sinks to the bottom, and
  any later one is an ordinary row group that stays where it was written.
  Copy order, column alignment and the sticky-header offsets all come from
  that one walk, so a table copies in the order it is read.
- Cell output is output, not document: `[x] done` printed by a program stays
  the string it is rather than becoming a checkbox, and an `<h1>` in output
  is not the page title. Both readers agree, because the exporter substitutes
  before any output is decoded and cannot see inside one.
- Notebook SVG output renders as `<img src="data:image/svg+xml;base64,…">`,
  never inline: an `<img>` loads SVG in the secure static mode, where script
  does not run and external subresources are not fetched. Inline SVG is a
  sanitiser's weakest ground, so it is never parsed as markup.
- No network, no storage. The service worker exists only to re-read a file
  the tab already shows: it takes the URL from the message sender (which
  Chrome fills in from the tab, so a message can't point it elsewhere),
  refuses anything that isn't a `file://` URL with one of the extensions
  above, and holds no state between reads. `host_permissions: file:///*` is what lets it read the file.
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
