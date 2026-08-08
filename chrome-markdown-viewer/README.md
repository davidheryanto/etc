# chrome-markdown-viewer

Minimal Chrome extension that renders local `.md` files as clean HTML.
The "Oat" theme is a documentation look: sans headings and labels, a
sturdy serif body with tall leading on warm paper, mono code, slate text,
signal-red labels, cta-blue links.
Light mode only for now. Pages with 3+ headings get a fixed "On this page"
rail (h2/h3, scroll-spy highlight) that hides on narrow windows.
Pairs with the Sublime side-bar **Open in Browser** entry
(`sublime-packages/User/side_bar_extras.py`), which includes `.md` files.

Save in Sublime, F5 in Chrome to re-render. No live reload by design —
that would need a background worker polling the file.

## Install (once)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. On the extension's card: **Details** → enable **Allow access to file URLs**

## Files

| File                 | What                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `manifest.json`      | MV3. Content script matched to `file:///*` with `*.md` / `*.markdown` globs only.                |
| `content.js`         | Reads the raw source from the `<pre>` Chrome wraps text files in, renders, swaps the body; builds the ToC. |
| `markdown-it.min.js` | markdown-it 14.1.0 dist file, vendored. Verified byte-identical to the official npm tarball.     |
| `highlight.min.js`   | highlight.js 11.11.1 common build, vendored, same verification. Colors only fences that declare a language. |
| `theme.css`          | The look and ToC styles. Swap or edit this file to retheme (`@font-face` lives in `content.js` — see comment there).              |
| `fonts/`             | woff2 subsets, vendored. All SIL OFL.                                                            |

## Fonts

Everything is bundled, so rendering is identical on Linux and macOS —
no dependence on system fonts. All open-licensed.

| Face         | Role                                     |
| ------------ | ---------------------------------------- |
| Merriweather | body text (weight 500, 700 for strong)   |
| DM Sans      | h1–h3, h4–h6 eyebrows, tables, ToC       |
| DM Mono      | code, pre                                |

Merriweather is the variable font (wght 300–900, roman + italic latin
subsets) plus a symbols slice cut from the full upstream font: arrows,
math, shapes, fractions — everything Google's script subsets strip —
stay on the serif's own baseline instead of falling through to a system
font. DM Mono tops out at Medium, so bold code renders the real 500 cut
rather than a synthetic bold.

## Security posture

- Runs only on `file://` URLs ending in `.md` / `.markdown` — no access to web pages.
- No network, no storage, no background worker. `web_accessible_resources`
  exposes only the bundled font files, and only to `file://` pages.
- `markdownit({ html: false })`: raw HTML in the markdown is escaped, not executed;
  markdown-it also rejects `javascript:` link targets by default.
- Remote images are never fetched: rendering happens in an inert `<template>`,
  and any `<img>` whose source isn't `file:`/`data:` is replaced with a plain
  link before the page sees it — a document can't phone home just by being opened.
- MV3 forbids remotely hosted code, and both libraries are vendored anyway:
  - `markdown-it.min.js` sha256 `38c70a1e7ca91ab40e2d9e6e60129851a717ed1c7d4acbbdd41bf9503791cf68`
  - `highlight.min.js` sha256 `c4a399dd6f488bc97a3546e3476747b3e714c99c57b9473154c6fb8d259b9381`
