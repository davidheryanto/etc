# chrome-markdown-viewer

Minimal Chrome extension that renders local `.md` files as clean HTML.
The "Bureau" theme is modeled on the Cognition blog (cognition.com/blog):
serif body, sans section headings, mono code, white page, indigo accents.
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
| `fonts/`             | woff2 subsets/cuts, vendored. All open-licensed (OFL / Mona Sans license).                       |

## Fonts

Cognition's blog uses commercial faces; these are the free stand-ins.
Everything is bundled, so rendering is identical on Linux and macOS —
no dependence on system fonts.

| Cognition uses                   | Bundled here       | Role                        |
| -------------------------------- | ------------------ | --------------------------- |
| STK Bureau Serif (Studio Triple) | Source Serif 4     | body text, h1               |
| NB International (Neubau)        | Mona Sans (GitHub) | h2–h6, table headers, ToC   |
| Geist Mono (Vercel)              | Geist Mono (same)  | code, pre                   |

Mona Sans is the static Regular/Medium/SemiBold cuts, not the variable
font — interpolated weights rendered unevenly at heading sizes on Linux.

## Security posture

- Runs only on `file://` URLs ending in `.md` / `.markdown` — no access to web pages.
- No network, no storage, no background worker. `web_accessible_resources`
  exposes only the bundled font files, and only to `file://` pages.
- `markdownit({ html: false })`: raw HTML in the markdown is escaped, not executed;
  markdown-it also rejects `javascript:` link targets by default.
- MV3 forbids remotely hosted code, and both libraries are vendored anyway:
  - `markdown-it.min.js` sha256 `38c70a1e7ca91ab40e2d9e6e60129851a717ed1c7d4acbbdd41bf9503791cf68`
  - `highlight.min.js` sha256 `c4a399dd6f488bc97a3546e3476747b3e714c99c57b9473154c6fb8d259b9381`
