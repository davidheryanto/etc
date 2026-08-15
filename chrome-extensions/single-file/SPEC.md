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
| Visibility | Read `getComputedStyle` on the **live** DOM and drop anything with `display: none` or `visibility: hidden`. Cheap, deterministic, and it takes out cookie banners, closed modals and inactive tab panels without a single heuristic. |
| Build | Walk the live DOM and **construct** the canonical document node by node — never clone-then-delete. The only way anything reaches the output is by being built, which is what makes invariant 2 structural. It also has to be this way in practice: sites enforcing Trusted Types (YouTube among them) reject `innerHTML` and `DOMParser` assignment outright, so the capture only ever *reads* `innerHTML` at the end. |
| Shadow DOM | An open `shadowRoot` is what an element actually renders, so the walk follows it instead of the light children, and follows `slot.assignedNodes()` to put composed content back where it is displayed. Without this every web component is silently empty — MDN's code examples, most design systems. Closed roots are unreachable by design. |
| Deadline | A page whose main thread is wedged (a bot-check interstitial spinning on a busy loop) never runs the injected function, and `executeScript` waits forever. 30 seconds, then the popup reports it. |

## Strip

Removed with their subtrees, by tag and ARIA role only — no class-name or
text-density guessing:

`script` · `style` · `noscript` · `link` · `meta` · `template` · `object` ·
`embed` · `input` · `button` · `select` · `textarea` · `dialog` · `nav` ·
`header` · `footer` · `aside`

`[role=navigation|banner|contentinfo|search]` ·
`[aria-hidden=true]` · `[hidden]` · anything marked invisible above.

`role="complementary"` is deliberately not in that list even though `<aside>`
is: the tag is a considered authoring decision, the role gets applied loosely.
YouTube marks the wrapper around its video player complementary, and honouring
that dropped the player and the page's entire point with it. A sidebar that
survives is noise you can see; content that vanishes is unrecoverable.

Then unwrap: `div`, `section`, `article`, `main`, `span`, **`form`**, and any
other non-allowlisted wrapper is replaced by its children rather than deleted.
The content survives; the layout scaffolding does not.

`form` unwraps rather than dropping because plenty of sites wrap real content
in one — deleting the subtree would eat the page. The controls inside it go;
the prose around them stays.

Finally, anything left hollow goes: an element with no text and no image, no
inline SVG and no rule inside it is what remains when a stripped button or a
sub-100px icon was all it ever held. Real output from a careers page had a
`<p><a href="…"></a></p>` shadowing every job link.

Three exemptions. A blank table cell holds the column grid in place, so cells
stay. An `id` that survived the pass above means some link in the document
lands there, so those stay — and so does whatever wraps one, or the paragraph
around `<a id="ref"></a>` takes the landing place down with it. And an inline
tag holding only whitespace is unwrapped rather than dropped:
`<b>Senior</b><em> </em><b>Engineer</b>` keeps the only space between those
words inside a tag, and removing the tag runs them together. A block holding
only whitespace is the blank paragraph this pass exists for, and goes.

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

**Inline `<svg>` gets its own allowlist**, not an exception to this one. Docs
and engineering posts put real content in SVG diagrams, so dropping it would
lose the thing the post is about — but a denylist here was tried and does not
hold. `<desc>` and `<title>` are HTML integration points, so an `<iframe>`,
`<img>` or `<link>` inside one parses as HTML and sails past an SVG-shaped
filter. An SVG `<style>` is a document-wide stylesheet that can pull
`@import url(…)` on open, and being a raw-text element it survives the
serialize/reparse round trip as live markup — a textbook mXSS channel.
`<image>`, `<use>`, `<feImage>` and any `url(…)` in a presentation attribute
are remote references in their own right.

So the SVG allowlist is shapes, text, structure and paint: `svg`, `g`, `defs`,
`symbol`, `use`, `switch`, `path`, `rect`, `circle`, `ellipse`, `line`,
`polyline`, `polygon`, `text`, `tspan`, `textPath`, `marker`,
`linearGradient`, `radialGradient`, `stop`, `clipPath`, `mask`, `pattern`.
No `style`, `desc`, `title`, `image`, `foreignObject`, `script`, `animate*`,
and no filter primitives. `<a>` unwraps, keeping the shape and losing the
link. Attributes drop `on*` and `style` outright, keep `href`/`xlink:href`
only when it starts `#`, and drop any value containing `url(`, `javascript:`,
`data:` or a scheme-and-slashes. Filters and embedded rasters are the price;
diagrams survive.

## Images

The main event: e-commerce and job listings are the target pages, and they
are mostly pictures.

- Source URL comes from `img.currentSrc` — the browser has already resolved
  `srcset`, `sizes` and DPR, so there is nothing to reimplement.
- Skip anything under 100×100 by `naturalWidth`/`naturalHeight`: icons,
  spacers and tracking pixels.
- Fetch from the **popup**, not the page and not the service worker. An
  extension page holds `host_permissions`, so it reads cross-origin images
  that a content script would be refused by CORS — and unlike an MV3 service
  worker it has both a DOM and `URL.createObjectURL`.
- Total inlined payload budget ~5MB, spent in document order, plus a 2MB
  ceiling per image. Past the cap, remaining images degrade to plain links
  showing their URL. Same for any fetch that fails. A rasterized canvas is
  dropped instead of linked, since its only "address" is the payload itself.
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
| `<math>` | The TeX from its `<annotation>` as a code span when there is one — generated MathML almost always carries it — and a marker when there is not. Unwrapping MathML runs the symbols together into soup that reads as neither prose nor an equation. |
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

It also carries its own **CSP**:
`default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:`.
That is invariant 2 restated as a property the *file* enforces on its own
behalf rather than one the capture code promises — whatever the allowlist
might ever miss, the document still cannot run a script or reach the network.
Two independent mechanisms for one guarantee is the right number here, given
that the guarantee is the product.

### `.md` — derived, lossy

A ~150-line DOM walker, written here rather than pulled in — a third-party
converter would be code you never read, which is the thing this extension
exists to avoid. Images are inlined as `data:` URIs exactly as in the HTML:
a Markdown export that dies when the listing is pulled has failed at its only
job. Note this makes the `.md` **larger** than the `.html` on image-heavy
pages.

Documented losses: `colspan`/`rowspan` flattened, a nested table flattened to
`cell, cell; cell, cell` text inside its parent cell, `sup`/`sub`/`kbd`/
`abbr`/`mark` reduced to plain text, `figcaption` becomes an italic line,
`details` becomes its summary in bold followed by its content, inline SVG is
dropped entirely.

Everything a page supplies is escaped on the way in, `<` and `&` included:
most Markdown renderers pass raw HTML through, so without that the `.md` would
have no equivalent of the HTML output's security boundary.

### `.pdf` — via Chrome

Save the `.html`, open it in a tab, fire the print dialog against it. Chrome's
real print engine, so the text is selectable and searchable — feed it a
cleaned page and the output is good, which it is not when printing the
original site. Requires **Allow access to file URLs** on the extension card,
same as `markdown-viewer`.

The deliverable is a `@media print` block in the theme: page margins,
`break-inside: avoid` on figures, tables and `pre`, link URLs printed after
their text, provenance header retained.

**This path leaves two files**, the `.html` it printed from and the `.pdf` you
save — the one place invariant 1 is bent. Each output is still a single file;
what the PDF button cannot do is produce only one. Printing from memory
instead would mean an extension page that receives the document and prints
itself, which is the fix if this ever grates. It is not done silently: the
HTML is the master output anyway, and deleting a file out of your downloads
folder is not something this should do behind your back.

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
**full** source URL as a live link and when it was captured — date, and time
to the minute with its UTC offset (`15 August 2026 at 18:51 GMT+8`), local to
the machine that saved it rather than pinned to one zone, since the file gets
read elsewhere and a bare clock time is ambiguous the moment it travels. Plus
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
- **`<all_urls>` at install time.** The manifest claims the same power as the
  third-party extension this exists to replace; only code discipline —
  injection on toolbar click, no background listeners — makes it narrower in
  practice. `optional_host_permissions` with a per-site grant would make the
  manifest match the intent, at the cost of a prompt per site. Decided against
  for now; worth revisiting if the tool sticks.
