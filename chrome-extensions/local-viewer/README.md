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

Markdown files use the light-only **Canvas** theme, modelled on Apple's
Machine Learning Research articles: 17-pixel sans-serif text on white in a
720-pixel column. The text font is SF Pro on macOS and the bundled Inter
elsewhere; see [Fonts](#fonts). Links are blue, with no underline until you
hover over them.
Documents with at least three headings get an **On this page** navigation rail. The rail tracks the current
section and is hidden on narrow screens. The text stays centred in the window
beside it; on a wide display the rail moves in to sit next to the content. A long rail scrolls under its label
without a scrollbar: its edges fade where more entries lie beyond them, and
clicking the label returns the list to its top. Hovering a rail entry does not
show Chrome's link-address bubble, which would cover the rail's last entries;
right-click and middle-click on an entry still work as they do on any link.

Fenced code blocks have a copy button. Code blocks, tables, diagrams, and
standalone images sit in light-gray panels that extend up to 160 pixels beyond
the text column on each side, so their contents remain readable. A panel whose
contents are wider than that grows to the right, as far as they need, by at
most 360 more pixels and never closer than 48 pixels to the window edge: a
table until every cell fits on one line, code until its longest line fits, an
image or diagram until it is shown at full size. The text column and the
panel's left edge stay where they are. A table fills its panel. The viewer
never enlarges images, and only an image alone in its paragraph becomes a
figure. A paragraph written wholly in italics
directly below a figure, after a blank line, becomes its caption:

```markdown
![Render time by file size](chart.png)

*Figure 1: Median time to first paint, in milliseconds.*
```

A wholly italic paragraph directly below a table becomes its source note, in
the same small gray style. Several italic lines joined by a trailing `\` count
as one paragraph, for figure captions too:

```markdown
| Test | Today |
|---|---|
| Lists with 3+ items | 94%¹ |

*¹ End of Play logs, 15 Sep–12 Oct.*\
*² Observed on mobile web, 19 Oct.*
```

Only the first paragraph below counts, and any word outside the italics leaves
it as body text. Tables inside a list, quote, or `<details>` keep their notes as
body text, and so does an italic paragraph after ordinary text.

Inline code in table cells can wrap after an `_` or `/` inside it, but not
after one that ends it, such as the `/` of `reader-notes/`. A cell that holds only a
short code with a digit in it, such as OD-1 or 2026-10-31, stays on one line
instead of breaking at its hyphen. Content that is still too wide scrolls
inside its panel. A header row with every cell empty, the usual way to lay out
a grid of images (`| | | |`), is left out, so the grid has no blank row or
header rule above it.

A fenced block with the info string `mermaid` is drawn as a diagram, as on
GitHub, by the same Mermaid version GitHub ran in October 2026 (12.2.0). The
diagram takes the code block's panel and the page's font, and the panel's
copy button still copies the source. A diagram Mermaid cannot parse stays as
code, under Mermaid's error message, so a mistake shows here before GitHub
refuses it. A diagram cannot set its own CSS, theme variables or font in an
`%%{init}%%` directive or its front matter; the rest of Mermaid's
configuration, such as a theme, works as written. Mermaid is loaded only for a
page with a diagram, and an edited diagram keeps its old drawing until the new
one is ready.

A `<details>` block with an optional `<summary>` renders as a collapsible
section, closed unless written as `<details open>`. The tags must be on their
own lines, and the summary may share the opening line. Everything between the
tags is ordinary Markdown. A tag with any other attribute, a tag inside a
paragraph, or an opening tag that is never closed stays visible as text. A
closing tag closes only a section opened in the same list item or quote. Open
sections stay open when the file changes. A heading inside a closed section is
listed in the navigation rail, and its link opens the section.

This is a Local Viewer convention and differs from CommonMark and GitHub,
which treat `<details>` as raw HTML. There, Markdown in a summary stays
literal and inline tags such as `<b>` or `<code>` render instead, and the body
needs a blank line after `</summary>` to be parsed. Here, a summary takes
inline Markdown, no blank lines are needed, and any other HTML tag stays
visible as text. The portable form that renders the same in both is a
plain-text summary with blank lines around the body.

A standalone empty anchor such as `<a id="old-section"></a>` creates an
invisible link target, preserving links after a heading is renamed. Only a
single quoted `id` is allowed; IDs start with an ASCII letter and contain
letters, digits, `_`, `.`, `:`, or `-`. Other anchor HTML stays visible as text.
This convention is disabled in email mode.

An HTML comment such as `<!-- confluence-page-id: 123 -->` renders as nothing,
on its own lines or inside a paragraph, as on GitHub. A comment in code stays
visible. Text after a comment that starts a line is shown as its own
paragraph. A `|` inside a comment in a table row still divides the cells. A
`<!--` that is never closed stays visible as text; on GitHub, one at the start
of a line hides the rest of the file. Comments are hidden in email mode too.

Front matter, the metadata block at the top of a file that tools such as
md2conf, Jekyll and Hugo read, renders as a closed "Front matter" toggle that
shows it as a code block. It must start on the file's first line with `---`
(YAML) or `+++` (TOML) and ends at the next line that repeats that marker,
however far down, as on GitHub. A file with no such line renders as ordinary
Markdown. What is inside is not
parsed, so malformed YAML is shown as written. It never becomes a heading or
an entry in **On this page**. Further down a file, `---` is still a rule or a
heading underline. Notebooks have no front matter.

Markdown has no syntax for image size, so an `<img>` tag sets one, the way
GitHub, GitLab, and VS Code accept it:

```markdown
| Before | After |
|---|---|
| <img src="before.png" width="260"> | <img src="after.png" width="260"> |
```

The tag must be lowercase, with quoted values, and may use only `src`, `alt`,
`title`, `width`, and `height`, each once. Width and height are whole pixels
from 1 to 9999, with no unit. Height only sets the shape the image holds while
it loads; it never squashes the picture. The tag renders like
`![alt](src "title")` at that width, so the remote-image rule below applies. Any other attribute,
such as `style`, `srcset`, or an event handler, leaves the tag visible as text.
This convention is disabled in email mode.

A sized image can be a link, written either of the ways GitHub accepts:

```markdown
[<img src="after.png" width="260">](after.png)
<a href="after.png"><img src="after.png" width="260"></a>
```

The `<a>` tag must be lowercase, with a quoted `href` and optionally a
`title`, each once, around exactly one `<img>` accepted above, with only
spaces between the tags. Any other attribute, such as `target` or `id`, or any
text inside the link, leaves the tags visible as text around the image. This
convention is disabled in email mode.

An image shown noticeably smaller than its file, whether sized this way or
narrowed to fit the column, shows a zoom cursor. Clicking it opens the image over the page at
its natural size, or as large as the window allows. When it shares a table or
a paragraph with other images, a strip of their thumbnails sits beneath it:
the left and right arrow keys move through them, row by row, and wrap round
at either end, and clicking a thumbnail opens that image. Bringing the mouse
near either side of the image shows an arrow there, and clicking the arrow
steps the same way; the arrows stay hidden otherwise, are always shown on a
touch screen, and are left off an image under 200 pixels wide. A strip too long
for the window scrolls, with the current thumbnail kept in view. A click
anywhere else, any other key, or the scroll wheel closes the image; over a
strip that scrolls, the wheel scrolls the strip. An image inside a link keeps its link, unless the
link's address is the image's own `src`, written the same way, as in the
examples above: then a click opens the image over the page too, and
Ctrl-click or middle-click still follows the link. Exported HTML files behave
the same way.

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
- A `mermaid` fence in a Markdown cell is drawn as in a Markdown file. Cell
  output is never drawn.

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
Diagrams stay as code blocks. HTML comments and front matter are hidden, so
they are not copied into the email.

## Live updates

The visible tab checks its file for changes about once per second. Background
tabs stop checking and catch up when selected. A small background script reads
only the file shown in the requesting tab and keeps no state. It also adds
Mermaid to a Markdown or notebook tab whose page has a diagram.

## Export to HTML

Use `md2html.mjs` to create a standalone HTML file from Markdown or a notebook:

```sh
node md2html.mjs notes.md            # writes notes.html beside notes.md
node md2html.mjs run.ipynb           # writes run.html
node md2html.mjs notes.md /tmp/x.html
node md2html.mjs notes.md ~/Downloads  # writes ~/Downloads/notes.html
```

An output directory must already exist. A path ending in `/`, `.` or `..`
that is not an existing directory is an error, and so is an output file whose
parent directory is missing.

To run it from anywhere, add a shell function to your shell's startup file,
such as `~/.zshrc` or `~/.bashrc` (the same line works in both):

```sh
md2html() { node ~/github.com/davidheryanto/etc/chrome-extensions/local-viewer/md2html.mjs "$@"; }
```

The script needs Node.js but no installed packages. It includes the theme,
fonts, scripts, and readable local images in one file. Bundled fonts make the
smallest output about 470 KB. On a Mac the exported page shows SF Pro, like the
extension; the bundled Inter is what every other system shows. A document with
a diagram also carries Mermaid, about 5.5 MB more, and draws its diagrams when
opened. An export has no Content Security Policy, since it keeps remote images
remote, but a diagram still cannot set its own CSS.

Unreadable local images remain as relative links and produce a warning. Remote
HTTPS images remain remote.

Some Markdown rendering logic is duplicated between `content.js` and
`md2html.mjs`. These sections are marked `DUPLICATED`; update both copies.
Intentional differences are marked `OMITTED`. Notebook rendering, the
`<details>` rule and diagrams are shared through `notebook.js`, `details.js`
and `mermaid.js` and are not duplicated.

## Tests

Run rendering and copy tests:

```sh
node test/run.mjs          # all cases
node test/run.mjs email    # one case
node test/run.mjs md2html  # the exporter's CLI; needs no Chrome
```

The runner starts `google-chrome`. On macOS, point it at Chrome:

```sh
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node test/run.mjs
```

Run the real extension in a visible Chromium window:

```sh
node test/e2e.mjs            # rendering, live updates, scroll-spy, diagrams
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
| `anchors.js` | Supports invisible legacy fragment targets. Shared with the HTML exporter. |
| `details.js` | Renders `<details>` and `<summary>` tags in Markdown. Shared with the HTML exporter. |
| `breaks.js` | Renders `<br>` tags in Markdown as line breaks. Shared with the HTML exporter. |
| `comments.js` | Hides HTML comments in Markdown. Shared with the HTML exporter. |
| `frontmatter.js` | Renders front matter as a closed toggle. Shared with the HTML exporter. |
| `images.js` | Renders sized `<img>` tags in Markdown. Shared with the HTML exporter. |
| `links.js` | Renders `<a href>` around a sized `<img>` in Markdown, and marks a link to its own image for the image viewer. Shared with the HTML exporter. |
| `image-viewer.js` | Opens a shrunken image at its natural size on click, and steps through the images beside it. Shared with the HTML exporter. |
| `mermaid.js` | Draws `mermaid` fences as diagrams. Shared with the HTML exporter. |
| `worker.js` | Reads the current tab's local file when asked by `content.js`, and adds Mermaid to a page with a diagram. |
| `notebook.js` | Renders notebooks and safely inserts notebook output. Shared with the HTML exporter. |
| `notebook.css` | Notebook layout and styles. |
| `json.js` | Builds the JSON tree, search, summaries, copy actions, and refresh state. |
| `json.css` | JSON and JSON Lines styles. |
| `email.css` | Email preview styles. |
| `theme.css` | Main theme, navigation rail, and wide-content layout. |
| `markdown-it.min.js` | Vendored markdown-it 15.0.1. |
| `highlight.min.js` | Vendored highlight.js 11.11.1 common build. |
| `mermaid.min.js` | Vendored Mermaid 12.2.0. Not a content script: added only to a page with a diagram. |
| `fonts/` | Bundled WOFF2 fonts under the SIL Open Font License. |
| `md2html.mjs` | Standalone HTML exporter. Not loaded by the extension. |
| `test/` | Test scripts and fixtures. Not loaded by the extension. |

For each batch of user-visible changes, bump the version in `manifest.json` in
a separate commit.

## Fonts

The text font is SF Pro on macOS and Inter everywhere else. SF Pro is the
system's own font and is never bundled: Apple's licence allows it only for
mock-ups and forbids embedding it. Every other font is bundled, so a page looks
the same on any Linux or Windows machine. The two text fonts take different
letter spacing; `content.js` checks which one rendered before the first paint.

| Font | Use |
| --- | --- |
| SF Pro (macOS) or Inter | Text, headings, tables, and navigation |
| DM Mono | Field names in the JSON summary |
| Geist Mono | Code in Markdown and notebooks, notebook output, and the JSON tree |

Inter 4.1 is cut from the official release into three files: Latin, Latin
italic, and a symbols file with arrows, math, technical keys, shapes, and check
marks. The symbols file's character list is repeated in `content.js` and
`md2html.mjs`, so update both if the file is cut again.

## Security

The extension is designed to open files that may not be trusted.

- It runs only on supported local `file://` URLs, not on web pages.
- It does not use storage or send file contents over the network.
- Remote images in local Markdown are changed to links before the page loads,
  or to their alt text when already inside a link, so opening a file cannot
  load a tracking image. The image viewer shows only
  an image already on the page, so it fetches nothing new.
- Raw HTML in Markdown is shown as text, not executed. The exceptions are
  standalone empty anchors with only an `id`, `<details>`/`<summary>`
  blocks with no authored attributes other than `open`, `<img>` with only
  `src`, `alt`, `title`, `width`, and `height`, `<a>` with only `href` and
  `title` around one such `<img>`, `<br>` with no attributes,
  and HTML comments, which render as nothing.
- Unsafe link types such as `javascript:`, `data:`, and `blob:` are rejected.
- Diagrams are drawn by Mermaid in its strict mode: labels are encoded, click
  actions are off, and its output is cleaned. A diagram cannot give Mermaid
  CSS, theme variables or a font of its own, and one that names an image on
  another computer (a file URL with a host, which on Windows reaches the
  network) is not drawn. Mermaid lays a diagram out in the
  page itself, so Markdown pages, like notebook pages, also carry a Content
  Security Policy that blocks every resource except local and embedded images
  and the extension's own fonts; a URL that did reach a diagram's styles is
  never fetched.
- JSON values are inserted as text, so HTML inside a JSON string cannot run.
- The background worker reads only the supported local file shown in the tab
  that requested it, and adds Mermaid only to a Markdown or notebook tab that
  asks for it.

Notebook output needs stricter handling because a notebook can contain saved
HTML from an earlier kernel run. `notebook.js` stores that HTML as base64,
parses it in an inactive document fragment, and allows only known-safe HTML
elements, attributes, and URLs before displaying it.

Notebook output cannot add styles or reuse the viewer's CSS classes. Remote
images become links. Local images and safe embedded images are allowed. SVG
output is loaded as an image rather than inserted as page markup; the one SVG
inserted as markup is a diagram Mermaid drew, under the policy above.

The extension and exported notebooks use the same cleaning code. Exported
notebook output requires JavaScript so the browser can check it before display;
the document text and code remain readable without JavaScript.

The third-party JavaScript files are stored locally and match their official
packages:

- `markdown-it.min.js` SHA-256:
  `f9f377ca892291fbe32904e77a00c6e27e8f95c14f435a54c8cb6859b3d97692`
- `highlight.min.js` SHA-256:
  `c4a399dd6f488bc97a3546e3476747b3e714c99c57b9473154c6fb8d259b9381`
- `mermaid.min.js` (from the `mermaid` 12.2.0 npm package, `dist/`) SHA-256:
  `a8a6a6f805b074a8261a2825c86f99c8054acb3b35f50bb7e24a4f9f2c3c3b9f`
