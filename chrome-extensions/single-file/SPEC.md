# single-file — spec

Chrome extension. One click on any web page produces **one file** — HTML,
Markdown or PDF — that is clean, self-contained, and safe to open offline
years later.

Not the [SingleFile](https://github.com/gildas-lormeau/SingleFile) extension
by gildas-lormeau. Independent local reimplementation, same idea, different
goal: **cleaned and re-typeset, not faithfully archived.** SingleFile
preserves the page as it is; this preserves what the page said.

Display name: **Single File (local)**. Loaded unpacked, never published.

## Why it exists

A third-party extension with "read and change all your data on all websites"
is opaque: it auto-updates, and an audit today says nothing about next
Tuesday's build. This one is small enough to read end to end, lives in this
repo, and only changes when you change it.

That is the whole justification. If it ever grows past the point where you
can read all of it in one sitting, it has failed at its purpose.

## Two invariants

Everything below follows from these. When a new case comes up, it is decided
by these two rules and not by fresh argument.

**1. Every output is exactly one file, always.** Anything that would need a
second file is inlined, or it is dropped. No asset folders, no sidecars, no
"download 2 of 3". This is what the name means.

**2. The tag and attribute allowlist is simultaneously the faithfulness
filter and the security boundary.** Nothing outside it survives
normalization, so *no scripts, no `on*` handlers, no remote references, no
network traffic when the file is opened* holds by construction — not by
remembering to remove things.

## Pipeline

```
click → auto-scroll → clone DOM → strip → normalize to allowlist → inline images
                                                                     │
                                                    canonical document
                                                                     │
                          ┌──────────────────────────┼──────────────────────────┐
                          │                          │                          │
                serialize + theme.css        walk the DOM            open .html, print
                    + fonts inlined                                   (@media print)
                          │                          │                          │
                       .html                       .md                       .pdf
                     (master)                   (lossy)                  (via Chrome)
```

HTML is the master output. Markdown is derived and honestly lossy. PDF is
Chrome's own print engine fed a page that is already clean — which is why it
looks good, where printing the original site does not.

## Capture

| Step | What |
| ---- | ---- |
| Trigger | Toolbar click only. Never on page load, no auto-save, no tab listeners. |
| Scroll | Step to the bottom in ~5 increments with a short settle wait, then restore the scroll position. Triggers lazy-loaded images and `IntersectionObserver` content — this is what makes listing and product pages work at all. |
| Visibility | Read `getComputedStyle` on the **live** DOM before cloning and mark anything with `display: none` or `visibility: hidden` for removal. Cheap, deterministic, and it takes out cookie banners, closed modals and inactive tab panels without a single heuristic. |
| Clone | Deep-clone `document.body` and work on the copy. |

## Strip

Removed with their subtrees, by tag and ARIA role only — no class-name or
text-density guessing:

`script` · `style` · `noscript` · `link` · `meta` · `template` · `object` ·
`embed` · `input` · `button` · `select` · `textarea` · `dialog` · `nav` ·
`header` · `footer` · `aside`

`[role=navigation|banner|contentinfo|complementary|search]` ·
`[aria-hidden=true]` · `[hidden]` · anything marked invisible above.

Then unwrap: `div`, `section`, `article`, `main`, `span`, **`form`**, and any
other non-allowlisted wrapper is replaced by its children rather than deleted.
The content survives; the layout scaffolding does not.

`form` unwraps rather than dropping because plenty of sites wrap real content
in one — deleting the subtree would eat the page. The controls inside it go;
the prose around them stays.

## Allowlist

Everything that reaches the canonical document, and nothing else.

**Elements** — `h1`–`h6`, `p`, `ul`, `ol`, `li`, `dl`, `dt`, `dd`,
`blockquote`, `pre`, `code`, `hr`, `br`, `table`, `thead`, `tbody`, `tfoot`,
`tr`, `th`, `td`, `caption`, `a`, `strong`, `em`, `b`, `i`, `u`, `s`, `sup`,
`sub`, `mark`, `small`, `abbr`, `kbd`, `samp`, `var`, `time`, `img`,
`figure`, `figcaption`, `details`, `summary`.

**Attributes** — everything not listed is dropped, including all `class`
(except `language-*` on `code`), all `style`, all `data-*`, all `aria-*`,
all `on*`, `srcset`, `sizes` and `loading`.

| Element | Kept |
| ------- | ---- |
| `a` | `href`, and only when it starts `http:`, `https:`, `mailto:` or `#` |
| `img` | `src` (a `data:` URI after inlining), `alt`, `width`, `height` |
| `th` `td` | `colspan`, `rowspan`, `headers` |
| `ol` `li` | `start`, `reversed`, `value` |
| `code` | `class`, and only a single `language-*` token |
| `time` | `datetime` |
| `abbr` | `title` |
| any | `id`, but only if some in-document `href="#id"` points at it; `lang`; `dir` |

`details` is kept and forced open — collapsed content is still content.

**One exception, deliberate: inline `<svg>`.** Docs and engineering posts put
real content in inline SVG diagrams, and dropping it would lose the thing the
post is about. SVG is therefore the one subtree handled by *denylist*: remove
`script`, `foreignObject` and `a` descendants, remove every `on*` attribute
and any attribute whose value contains `javascript:`, keep the rest. SVG
presentation attributes are inert once those are gone. This is the only place
invariant 2 is relaxed, so it is the first place to look if anything ever
seems wrong.

## Images

The main event: e-commerce and job listings are the target pages, and they
are mostly pictures.

- Source URL comes from `img.currentSrc` — the browser has already resolved
  `srcset`, `sizes` and DPR, so there is nothing to reimplement.
- Skip anything under 100×100 by `naturalWidth`/`naturalHeight`: icons,
  spacers and tracking pixels.
- Fetch from the **service worker**, which bypasses CORS with
  `host_permissions`, and inline as a `data:` URI.
- Total inlined payload budget ~5MB. Past the cap, remaining images degrade
  to plain links showing their URL. Same for any fetch that fails.
- CSS `background-image` is lost, since site CSS is discarded. Known and
  accepted.

## Media and interactive pages

The general rule, and the honest one-line answer: **you get what you could
see.** Whatever was rendered at capture time — after the auto-scroll — is what
lands in the file. State that only exists behind a click does not.

So an accordion that was collapsed is lost, an inactive tab panel is lost
(it was `display: none`), and a hover card never existed. `details` is the one
exception, because it is declarative and can simply be forced open. No
auto-expanding, no clicking things: that is heuristics, and it would mean a
capture could mutate the page it is reading.

An app-shaped page — a dashboard, a map, a spreadsheet — reduces to almost
nothing, and the low-content warning is what tells you so rather than a
mysteriously empty file.

Nothing is dropped silently. Each of these leaves a visible marker:

| | What lands in the file |
| --- | --- |
| `video` | The `poster` frame, inlined as an image if there is one, captioned with a link to the video. Never the video itself — a 40MB inline media file would break invariant 1 in spirit and in practice. |
| Streamed video (`blob:` / MSE) | No usable URL exists to link, so the marker names the page instead: *Video (not saved) — see the source page.* True of most YouTube-style players. |
| `audio` | A captioned link, same treatment. |
| `canvas` | Rasterized at capture time with `toDataURL()`, so a canvas chart survives as a PNG. A canvas tainted by cross-origin drawing throws instead — caught, and it degrades to a marker. |
| `svg` | Kept as vector, scrubbed. Most charting libraries emit SVG, so this covers more real diagrams than the canvas path does. |
| `iframe` | Under 100px in either dimension, or invisible: dropped as an ad or tracker. Otherwise a captioned link to its `src`. Cross-origin frame content is unreadable by design, so a link is the most that is available. |
| Form controls | Dropped. A job-application form has no offline value; the prose around it survives because `form` unwraps. |

Markers are `figure` + `figcaption`, so they carry through to Markdown as
italic lines and read as part of the document rather than as error text.

This conversion runs *before* normalization, so everything it produces is
itself allowlisted and invariant 2 is untouched. Rasterized canvases and video
posters draw from the same ~5MB image budget as everything else.

## Outputs

Saved with `chrome.downloads.download` into the default Chrome download
folder — no subfolder, no save-as dialog. Filename
`YYYY-MM-DD-<title-slug>.<ext>`, slug lowercased, non-alphanumerics collapsed
to `-`, capped around 60 characters. Chrome handles collisions.

### `.html` — master

Canonical document serialized, with `theme.css` and all seven woff2 faces
inlined as `data:` URIs. Renders identically on any machine with no network
and no installed fonts, which is the point; it also puts a ~480KB floor under
every file, which is one photo's worth and not worth optimizing.

### `.md` — derived, lossy

A ~150-line DOM walker, written here rather than pulled in — a third-party
converter would be code you never read, which is the thing this extension
exists to avoid. Images are inlined as `data:` URIs exactly as in the HTML:
a Markdown export that dies when the listing is pulled has failed at its only
job. Note this makes the `.md` **larger** than the `.html` on image-heavy
pages.

Documented losses: `colspan`/`rowspan` flattened, `sup`/`sub`/`kbd`/`abbr`/
`mark` reduced to plain text, `figcaption` becomes an italic line, `details`
becomes a heading plus its content, inline SVG is dropped entirely.

### `.pdf` — via Chrome

Save the `.html`, open it in a tab, fire the print dialog against it. Chrome's
real print engine, so the text is selectable and searchable — feed it a
cleaned page and the output is good, which it is not when printing the
original site. Requires **Allow access to file URLs** on the extension card,
same as `markdown-viewer`.

The deliverable is a `@media print` block in the theme: page margins,
`break-inside: avoid` on figures, tables and `pre`, link URLs printed after
their text, provenance header retained.

## Interface

Popup with three buttons — **HTML**, **Markdown**, **PDF**. Capture starts
when the popup opens and the buttons enable when the canonical document is
ready, so the wait happens while you are deciding. No settings, no remembered
default, no `chrome.storage`.

**Low-content warning.** If the canonical document holds under ~200 words
*and* under 3 images, the popup says so and offers "save anyway". Catches
login walls, empty SPAs, and a strip rule that ate too much.

## Provenance header

Prepended to every output: the title as `h1`, then a bordered card holding the
**full** source URL as a live link and the capture date. Plus
`<meta name="source-url">` and `<meta name="captured-at">`, which cost no
visual weight. In Markdown it is a two-line key/value block under the `#`
heading.

The card, rather than a quiet line of text, on two grounds. On these pages
the URL is content: a listing is saved precisely because it will disappear,
and "where from, when" is half of what the saved copy is worth — which needs
the whole URL, not a domain. And a bordered box can never be mistaken for the
site's own byline or date, where a quiet line under the title can; keeping the
tool's annotation visibly separate from the captured page is a faithfulness
property, not a decoration. It also leaves room for fields that may earn a
place later.

Title above the card, not below: the document still announces what it is
before it accounts for where it came from.

Pending confirmation against the mockup — variants A, B, C, D, D2; **D2**
assumed.

## Manifest

```
"permissions":      ["scripting", "downloads", "activeTab"]
"host_permissions": ["<all_urls>"]
```

`<all_urls>` is what lets the service worker fetch cross-origin images without
CORS. The permission is broad; the discipline that keeps it honest is
behavioral and must stay that way — **injection happens on toolbar click, on
the clicked tab, and nowhere else.** No `storage`. No background listeners.

## Shared with markdown-viewer

`theme.css` and `fonts/` are **copied** from `chrome-extensions/markdown-viewer/`,
with a `DUPLICATED — synced from markdown-viewer` banner at the top of the copy
and a small sync script. Chrome cannot load a shared parent directory, and a
build step for two files costs more than it saves. This matches the existing
`DUPLICATED` convention in `md2html.mjs`.

## Not doing

| | Why |
| --- | --- |
| Readability / reader extraction | 2000 lines of scoring heuristics you would never audit, and job listings and product pages — the actual target — are its worst case. It either guesses right or hands you garbage and cannot tell you which. Three more strip selectors beat it and can be read in a minute. |
| Preserving site CSS | That is fidelity archival, i.e. SingleFile. The `@import` graph, shadow DOM and cross-origin stylesheets are where the months go. |
| Selection-only capture | Genuinely useful, different entry point with its own edge cases. v2. |
| A bundled PDF renderer | ~300KB of third-party code to audit, producing worse output than the print engine already installed. |
| Per-document font subsetting | Needs a subsetter in the pipeline for a saving you will not notice. |

## Build order

1. HTML master end to end, images left as links — proves strip, allowlist and download.
2. Auto-scroll and image inlining.
3. `@media print` block and the PDF button.
4. Markdown walker.
5. Low-content warning, provenance header polish, README.

## Open

- **Header variant.** Mockup produced; D2 assumed until confirmed.
- **Test corpus.** Ten real URLs — e-commerce, job listings, blog posts — to
  tune the strip list against. Nothing here is validated until it runs on
  those.
- **SVG scrub.** The one denylist in the design. Worth a second look once
  real pages have been through it.
