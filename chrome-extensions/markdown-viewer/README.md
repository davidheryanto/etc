# markdown-viewer

Minimal Chrome extension that renders local `.md` files as clean HTML.
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

## Export a standalone HTML file

```sh
node md2html.mjs notes.md            # -> notes.html, beside the source
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
| `manifest.json`      | MV3. Content script matched to `file:///*` with `*.md` / `*.markdown` globs only.                |
| `content.js`         | Reads the raw source from the `<pre>` Chrome wraps text files in, renders, swaps the body; builds the ToC and the copy buttons. Then polls the worker for changes and re-renders in place. |
| `worker.js`          | Service worker. One message handler: re-read the sender tab's own `file://` URL and return the text. No timers, no state. |
| `markdown-it.min.js` | markdown-it 14.1.0 dist file, vendored. Verified byte-identical to the official npm tarball.     |
| `highlight.min.js`   | highlight.js 11.11.1 common build, vendored, same verification. Colors only fences that declare a language. |
| `theme.css`          | The look and ToC styles. Swap or edit this file to retheme (`@font-face` lives in `content.js` — see comment there).              |
| `fonts/`             | woff2 subsets, vendored. All SIL OFL.                                                            |
| `md2html.mjs`        | Node script: renders a `.md` to one standalone `.html` using the same libraries, theme and fonts. Not part of the extension. |

## Fonts

Everything is bundled, so rendering is identical on Linux and macOS —
no dependence on system fonts. All open-licensed.

| Face         | Role                                     |
| ------------ | ---------------------------------------- |
| Merriweather | body text (weight 500, 700 for strong)   |
| DM Sans      | h1–h3, h4–h6 eyebrows, tables, ToC       |
| DM Mono      | code, pre                                |

Merriweather and DM Sans are variable fonts (latin subsets), each
paired with a symbols slice cut from its full upstream font — arrows,
math, shapes, fractions, everything Google's script subsets strip —
so notation renders in the bundled faces instead of falling through to
a system font. The sans stacks also list Merriweather before
`system-ui`: what DM Sans genuinely lacks (shapes, fractions) still
resolves to a bundled face. DM Mono tops out at Medium, so bold code
renders the real 500 cut rather than a synthetic bold.

## Security posture

- Runs only on `file://` URLs ending in `.md` / `.markdown` — no access to web pages.
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
