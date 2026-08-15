# single-file

Chrome extension. One click on any web page saves it as **one file** — HTML,
Markdown or PDF — cleaned, self-contained, and safe to open offline years
later.

Not the [SingleFile](https://github.com/gildas-lormeau/SingleFile) extension by
gildas-lormeau. Independent local reimplementation, same idea, different goal:
**cleaned and re-typeset, not faithfully archived.** SingleFile preserves the
page as it is; this preserves what the page said, in the same "Oat" look as
`markdown-viewer`.

Loaded unpacked, never published. A third-party extension holding "read and
change all your data on all websites" auto-updates, so an audit today says
nothing about next Tuesday's build. This one is small enough to read end to
end — that is the whole reason it exists, and if it outgrows that it has
failed.

See [SPEC.md](SPEC.md) for the decisions and why each one went the way it did.

## Two invariants

**Every output is exactly one file, always.** Anything that would need a second
file is inlined, or it is dropped. No asset folders, no sidecars.

**The tag and attribute allowlist is both the faithfulness filter and the
security boundary.** Nothing outside it survives, so *no scripts, no `on*`
handlers, no remote references, no network traffic when the file is opened*
holds by construction rather than by remembering to remove things.

## Install (once)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. For the PDF button: on the extension's card, **Details** → enable
   **Allow access to file URLs**

## Use

Click the toolbar button. The capture starts as the popup opens and the three
buttons enable when it is done, so the wait happens while you decide. Files go
to your normal Chrome download folder as `YYYY-MM-DD-<title-slug>.<ext>`.

If the capture came back nearly empty — a login wall, an app-shaped page, or a
strip rule that ate too much — the popup says so instead of handing you a
mysteriously short file.

## What you get, and what you don't

**You get what you could see.** Whatever was rendered at capture time, after
the extension has scrolled the page to trigger lazy images, is what lands in
the file. A collapsed accordion or an inactive tab panel was not visible, so it
is not there. `details` is the exception: it is declarative, so it is forced
open.

Nothing is dropped silently — video, canvas, audio and large iframes each leave
a `figure` marker in the document explaining what was there.

| | Result |
| --- | --- |
| Article, blog post, docs page | Clean. This is the easy case. |
| Job listing, product page | Works, and is what the auto-scroll and image inlining exist for. |
| Inline SVG diagrams | Kept as vector, with anything executable scrubbed out. |
| Canvas charts | Rasterized to PNG at capture time. |
| Video | The poster frame plus a link. Never the video itself. |
| Streaming video (`blob:`) | No fetchable address exists, so a marker naming the source page. |
| Web components / shadow DOM | Followed, including `slot` assignment. Closed shadow roots are unreachable. |
| Dashboards, maps, spreadsheets | Nearly nothing, and the low-content warning tells you so. |

Syntax highlighting is not applied to captured code: `language-*` classes are
preserved for a future highlighter, but the colours you see in
`markdown-viewer` come from highlight.js, which is not bundled here.

## Files

| File | What |
| ---- | ---- |
| `manifest.json` | MV3. `scripting` + `downloads` + `activeTab`, and `<all_urls>` so images can be read cross-origin. |
| `capture.js` | Injected on click. Walks the live DOM and *builds* the canonical document from allowlisted nodes; never assigns `innerHTML`, which Trusted Types sites would reject. |
| `popup.js` | Orchestrates: capture, fetch and inline images, assemble, download. The only context with a DOM, host permissions and `createObjectURL` all at once. |
| `to-markdown.js` | The canonical document to Markdown. Hand-written, because a third-party converter would be code you never read. |
| `background.js` | Service worker, one message handler, for the PDF path only — opening a tab closes the popup. No listeners otherwise. |
| `saved.css` | Provenance header, markers, and the `@media print` rules the PDF output depends on. |
| `theme.css`, `fonts/` | **DUPLICATED** from `markdown-viewer`. Run `./sync-theme.sh` after retheming there; never edit them here. |
| `fonts.js` | The `@font-face` table. Also duplicated — see the note in the file. |
| `SPEC.md` | The design and its reasoning. |

## Security posture

- Injected on toolbar click, on the clicked tab, and nowhere else. No content
  scripts registered in the manifest, no auto-save, no tab or navigation
  listeners. `<all_urls>` is broad; the discipline that keeps it honest is
  behavioural, and `background.js` is where a listener would quietly turn it
  into surveillance, so there isn't one.
- No `storage` permission. Nothing is remembered between captures.
- Saved files contain no `script`, no `on*` attributes, no external
  stylesheets, no remote fonts and no remote images — opening one makes zero
  network requests. This is a property of the allowlist, not a cleanup pass.
- Links are kept only for `http:`, `https:`, `mailto:` and `#`. Everything
  else, including `javascript:`, becomes plain text.
- Inline SVG is the one denylist: `script`, `foreignObject` and `a` descendants
  are removed along with every `on*` attribute and any `javascript:` value.
  It is the first place to look if anything ever seems wrong.
