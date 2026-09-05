# Local Viewer

Local Viewer is a Chrome extension for reading local developer files in the
browser. It supports:

- Markdown (`.md` and `.markdown`)
- Jupyter notebooks (`.ipynb`)
- JSON (`.json`)
- JSON Lines (`.jsonl`)
- Email drafts (`.email.md`)

It reads files directly from `file://` URLs. It does not need a server or send
file contents anywhere. When a file changes, the open page updates without a
full reload and keeps its scroll position.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this directory.
4. Open the extension's **Details** page.
5. Enable **Allow access to file URLs**.

Then open any supported local file in Chrome.

The Sublime Text side-bar command **Open in Browser**, defined in
`sublime-packages/User/side_bar_extras.py`, supports the same file types.

## Markdown

Markdown files use the light-only **Oat** theme. Documents with at least three
headings get an **On this page** navigation rail. The rail tracks the current
section and is hidden on narrow screens.

Fenced code blocks have a copy button. Tables, code blocks, and large images
can extend beyond the normal 832-pixel text column so their contents remain
readable. They can use up to 640 extra pixels on the right. Images are never
enlarged beyond their original size, and only standalone images use the wider
layout.

Inline code in table cells can wrap after `_` and `/`. Content that is still
too wide scrolls inside its own box.

A `<details>` block with an optional `<summary>` renders as a collapsible
section, closed unless written as `<details open>`. The tags must be on their
own lines, and the summary may share the opening line. Everything between the
tags is ordinary Markdown. A tag with any other attribute, a tag inside a
paragraph, or an opening tag that is never closed stays visible as text. Open
sections stay open when the file changes. A heading inside a closed section is
listed in the navigation rail, and its link opens the section.

## Jupyter notebooks

Notebooks open as read-only pages. They do not require Jupyter, a kernel, or a
server.

- Each code cell appears directly above its output.
- Code and output can use the wider right-hand area; Markdown text keeps the
  normal reading width.
- DataFrames get readable column alignment and wrapping for `snake_case`
  headings.
- Tall tables scroll inside their own box with pinned headers.
- Hover over code to copy it. Hover over output to copy it as tab-separated
  text for a spreadsheet.
- Tracebacks keep their error colors.
- Widgets show a placeholder because they require a live kernel.

Styles created by `df.style` are removed for security. Notebook HTML output is
also cleaned before it is added to the page. See [Security](#security).

## JSON and JSON Lines

JSON files open as collapsible trees. Only visible parts of the tree are added
to the page, and large containers are grouped into ranges of 100 items. This
keeps large files responsive.

The header shows the data type, entry count, and file size. For a list of
records, it also summarizes the fields and how often each field appears. The
left rail lists top-level keys or ranges.

- Click a key to copy its JavaScript-style path, such as
  `items[3].nested.x`.
- Hover over an object or array to copy its value as formatted JSON.
- Alt-click a triangle to expand everything below it.
- **Expand all** expands from the root.
- Bulk expansion stops at 5,000 rows.
- Strings longer than 400 characters are shortened until expanded.
- URL strings become links.
- Integers larger than JavaScript's safe integer limit keep their exact digits.

Press `/` or `Ctrl+F` to search keys, values, and paths. Search checks the
parsed file, including closed nodes, rather than only visible rows. It accepts
plain text or `/pattern/flags` regular expressions. Enter and Shift+Enter move
between matches and open the tree as needed.

Live updates keep expanded nodes and the current search. Polling slows down for
large files, up to a maximum interval of ten seconds.

A JSON Lines file uses the same interface. Records are parsed when their range
is opened. An invalid line becomes an error row without preventing other lines
from loading. Blank lines are ignored. Copying a record or range preserves the
original JSON Lines format.

The data viewer has no filter-only mode or dark theme.

## Email drafts

A file ending in `.email.md` opens as a plain email preview for Gmail or
Outlook on the web. It uses the mail client's default font and colors rather
than the document theme.

Copying a selection or using the copy-all button puts two versions on the
clipboard:

- HTML with only the inline styles needed for tables, code, and quotes.
- Plain text with Markdown removed, links written as `text (url)`, and table
  cells separated by tabs.

Each source line becomes a separate email line. Images show an **attach in
client** placeholder and are omitted when copied because a webmail composer
cannot reliably receive local images from a `file://` page.

Email mode does not target classic Outlook desktop.

`email.css` styles the preview. `EMAIL_STYLE` in `content.js` contains the same
styles for copied HTML. Update both when changing email styles.

Email mode does not render `<details>` blocks; the tags stay visible as text.

## Live updates

The visible tab checks its file for changes about once per second. Background
tabs stop checking and catch up when selected. A small background script reads
only the file shown in the requesting tab and keeps no state.

## Export to HTML

Use `md2html.mjs` to create a standalone HTML file from Markdown or a notebook:

```sh
node md2html.mjs notes.md            # writes notes.html beside notes.md
node md2html.mjs run.ipynb           # writes run.html
node md2html.mjs notes.md /tmp/x.html
```

The script needs Node.js but no installed packages. It includes the theme,
fonts, scripts, and readable local images in one file. Bundled fonts make the
smallest output about 480 KB.

Unreadable local images remain as relative links and produce a warning. Remote
HTTPS images remain remote.

Some Markdown rendering logic is duplicated between `content.js` and
`md2html.mjs`. These sections are marked `DUPLICATED`; update both copies.
Intentional differences are marked `OMITTED`. Notebook rendering and the
`<details>` rule are shared through `notebook.js` and `details.js` and are not
duplicated.

## Tests

Run rendering and copy tests:

```sh
node test/run.mjs          # all cases
node test/run.mjs email    # one case
```

Run the real extension in a visible Chromium window:

```sh
node test/e2e.mjs            # rendering and live updates
node test/e2e.mjs coldstart  # also restart the background worker; about 1 minute
```

Set `CHROME=/path/to/chromium` to choose a browser binary. By default, the
end-to-end test uses Playwright Chromium from `~/.cache/ms-playwright` because
branded Chrome ignores `--load-extension`.

The fast tests serve fixtures over the local loopback interface because
headless Chrome does not allow unpacked extensions to run on `file://` pages.
The end-to-end tests load the actual extension and cover local-file access,
background-worker behavior, and live updates.

## Main files

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome Manifest V3 configuration and file-type matching. |
| `content.js` | Renders Markdown and email drafts, builds navigation and copy buttons, and requests live updates. |
| `details.js` | Renders `<details>` and `<summary>` tags in Markdown. Shared with the HTML exporter. |
| `worker.js` | Reads the current tab's local file when asked by `content.js`. |
| `notebook.js` | Renders notebooks and safely inserts notebook output. Shared with the HTML exporter. |
| `notebook.css` | Notebook layout and styles. |
| `json.js` | Builds the JSON tree, search, summaries, copy actions, and refresh state. |
| `json.css` | JSON and JSON Lines styles. |
| `email.css` | Email preview styles. |
| `theme.css` | Main theme, navigation rail, and wide-content layout. |
| `markdown-it.min.js` | Vendored markdown-it 14.1.0. |
| `highlight.min.js` | Vendored highlight.js 11.11.1 common build. |
| `fonts/` | Bundled WOFF2 fonts under the SIL Open Font License. |
| `md2html.mjs` | Standalone HTML exporter. Not loaded by the extension. |
| `test/` | Test scripts and fixtures. Not loaded by the extension. |

For each batch of user-visible changes, bump the version in `manifest.json` in
a separate commit.

## Fonts

Fonts are bundled for consistent rendering on Linux and macOS.

| Font | Use |
| --- | --- |
| Merriweather | Body text |
| DM Sans | Headings, labels, tables, and navigation |
| DM Mono | Inline code in Markdown |
| Geist Mono | Notebook code and output |

## Security

The extension is designed to open files that may not be trusted.

- It runs only on supported local `file://` URLs, not on web pages.
- It does not use storage or send file contents over the network.
- Remote images in local Markdown are changed to links before the page loads,
  so opening a file cannot load a tracking image.
- Raw HTML in Markdown is shown as text, not executed. The one exception is
  `<details>` and `<summary>` on their own lines, which become the matching
  elements with no attributes other than `open`.
- Unsafe link types such as `javascript:`, `data:`, and `blob:` are rejected.
- JSON values are inserted as text, so HTML inside a JSON string cannot run.
- The background worker reads only the supported local file shown in the tab
  that requested it.

Notebook output needs stricter handling because a notebook can contain saved
HTML from an earlier kernel run. `notebook.js` stores that HTML as base64,
parses it in an inactive document fragment, and allows only known-safe HTML
elements, attributes, and URLs before displaying it.

Notebook output cannot add styles or reuse the viewer's CSS classes. Remote
images become links. Local images and safe embedded images are allowed. SVG is
loaded as an image rather than inserted as page markup. Notebook pages also use
a Content Security Policy that blocks all resources except local and embedded
images.

The extension and exported notebooks use the same cleaning code. Exported
notebook output requires JavaScript so the browser can check it before display;
the document text and code remain readable without JavaScript.

The third-party JavaScript files are stored locally and match their official
packages:

- `markdown-it.min.js` SHA-256:
  `38c70a1e7ca91ab40e2d9e6e60129851a717ed1c7d4acbbdd41bf9503791cf68`
- `highlight.min.js` SHA-256:
  `c4a399dd6f488bc97a3546e3476747b3e714c99c57b9473154c6fb8d259b9381`
