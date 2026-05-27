# Test harness

Playwright harness that loads the real `media/preview.css` + `media/preview.js`
against a representative Markdown-preview DOM, so navigator changes can be
checked without rebuilding/reloading VS Code. Dev-only — it is **not** part of
the shipped extension (which stays runtime-dependency-free).

## Setup (one-time)

Uses the system-installed Google Chrome, so no Playwright browser download is
needed:

```bash
cd vs-code-extensions/markdown-preview-navigator/test
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

## Run

```bash
npm test              # assertions only, read-only (gallery screenshots skipped)
npm run test:gallery  # regenerate the screenshot gallery (sets MPN_GALLERY=1)
npm run test:ui       # interactive Playwright UI
```

`npm test` is a pure assertion run — the file-writing `gallery:*` tests are
skipped unless `MPN_GALLERY=1` is set.

## What it covers

- **Layout matrix** — light / dark / high-contrast × 1280px (desktop right-rail)
  and 760px (below the 1000px breakpoint → sticky top bar): no horizontal
  overflow, list scrolls inside the panel, panel stays within the viewport.
- **Responsive switch** — `position: fixed` at 1280px, `sticky` at 760px.
- **Truncation tooltip** — `title` is set on a label iff it is actually clipped,
  and then equals the full text.
- **Scroll-aware active state** — exactly one active row, kept in view, and
  carrying `aria-current="location"` for assistive tech; the `Top` control is
  active (and no row / no `aria-current` is) at the document top.
- **Section bar** — the floating "current section" bar appears once a heading
  scrolls off, tracks the current top-level section across sections, hides at
  the document top and below the 1000px breakpoint, is decorative
  (`aria-hidden`), and its text self-updates don't trigger an outline rebuild.
- **Near-bottom navigation** — the trailing scroll spacer lets a click on the
  last outline item reach the top instead of clamping short; right after a
  click the bar shows the real heading, not the previous section.
- **Collapse / expand all.**
- **Focus** — a mouse click leaves no ring (`:focus-visible` is false); keyboard
  `Tab` shows a clean ring.

## Files

- `fixture.html` — loads the extension's CSS/JS; theme + DOM injected by
  `harness.js`.
- `harness.js` — `--vscode-*` theme presets and the sample heading structure.
- `navigator.spec.js` — the checks above.
- `__screenshots__/` — gallery output (gitignored); one PNG per theme × width.

## Still do a real VS Code smoke test before shipping

This harness approximates the webview but cannot fully reproduce VS Code's
injected theme classes, `markdown.css` cascade, CSP, or webview constraints.
Open a dense Markdown file in the real preview as a final check.
