# Markdown Preview Navigator — agent guide

Workspace-owned VS Code extension that injects a scroll-aware heading navigator
into VS Code's **built-in** Markdown Preview. No build step and no extension-host
activation code — `package.json` only contributes webview assets:

- `markdown.previewStyles` → `media/preview.css`
- `markdown.previewScripts` → `media/preview.js`
- `notebookRenderer` (extends `vscode.markdown-it-renderer`) → `media/notebook.js`

`preview.js` runs inside the preview webview; `preview.css` styles it.

`notebook.js` carries the heading scale into **notebook markdown cells**
(`.ipynb`), which are a separate render surface: the built-in notebook renderer
ignores `markdown.previewStyles` and ships its own louder scale (h1 2.3em).
The module runs in the notebook output webview and plants a
`<template class="markdown-style">` that the built-in renderer clones into each
markdown cell's shadow root. Only the heading scale + hierarchy colors are
ported (selectors prefixed `#preview` to outrank the built-in's bare-element
rules) — not the reading measure or body/bold colors. The template-cloning hook
and the `#preview` id are internals of the built-in renderer, not documented
API — but VS Code's own first-party **markdown-math** extension rides the same
hook, so it's a de-facto contract. If a future VS Code drops it, the failure is
silent and cosmetic-only: notebook headings revert to the loud default scale
(no crash). CSS injection is used instead of the renderer's `extendMarkdownIt`
API because that hook exposes the markdown-it pipeline (HTML), not styling —
sizing headings through it would mean wrapping every cell's HTML. The `test/`
harness does not cover this surface; verify by reloading VS Code and opening an
`.ipynb` with markdown headings.

`preview.css` does two jobs: the navigator chrome (panel, section bar) **and** a
restyle of the base preview prose — reading measure, body colour, bold, heading
scale, tables, blockquotes, code blocks (the user-facing list lives in
`README.md` under "Preview styling"). That prose restyle applies to every
previewed file, not only when the panel is shown — so smoke-test a plain dense
doc too, not just one with an outline.

## Conventions

- **No post-paint layout shifts.** Anything that moves already-painted prose
  must be decided in CSS, present at first paint — never by a class the script
  adds later. The one such thing today is the outline column reservation:
  `body:has(h2, h3, h4)` in `preview.css` (keep that list in sync with
  `HEADING_SELECTOR` in `preview.js`). It used to be a JS-added
  `mpn-has-outline` body class, which made every doc paint centred and then
  jump left. JS-built chrome that *doesn't* move the prose (the fixed panel,
  the section bar, the trailing spacer) is fine to add late. Covered by the
  "pure CSS reservation" spec, which loads the fixture with `preview.js`
  blocked and asserts the same layout.
- **Zero runtime dependencies.** The shipped extension is just the manifest plus
  the files in `media/`. Keep it that way — dev-only tooling lives under
  `test/` with its own `package.json`.
- **Theme-variable driven.** Colours come from `--vscode-*` variables and the
  `.vscode-light` / `.vscode-dark` body classes — never hard-coded palettes, so
  it holds up across light, dark, and high-contrast themes. The one **deliberate
  exception** is the reading typography (prose body colour and `strong`/`b`),
  which uses fixed near-extreme hex values *on purpose*: the goal is to step off
  the theme's own foreground extreme — and push bold to it — which a theme var
  would just reintroduce. Don't "fix" those to `--vscode-*`.
- Current design language: a single panel — a pinned header (section label +
  icon controls) above a scrolling list. The active section is shown by
  **colouring its heading in the theme accent** (`--vscode-textLink-foreground`)
  — the text and, on a parent row, its chevron — not a bar or background fill;
  the active row is kept scrolled into view. (An earlier left accent rail was
  dropped because on a parent row it collided with the collapse chevron, which
  lives in the same left gutter; moving the accent onto the heading sidesteps
  that and the "rail floats away from the indented text" problem at once.) Long
  headings use a 2-line clamp. `h3`/`h4` nesting is shown by **indentation plus
  colour**, not connector rails — `h3` is softened only slightly so the nav
  targets stay legible ("mute is for labels, not headings"), and the muted label
  colour is reserved for `h4`+. Collapse chevrons are thin-stroke SVGs that
  match the header controls (rotated via CSS, not Unicode triangles). No
  breadcrumb inside the panel — the highlighted row is the "where am I" there.
- The in-document "where am I" cue is a separate **section bar**
  (`.mpn-section-label`): a slim opaque strip pinned across the full top edge of
  the editor naming the current top-level section once its heading scrolls off.
  It is never the heading itself (a `position:sticky` heading corrupts VS Code's
  scroll-sync, which reads heading rects to map scroll↔source line). It appears
  only after the heading has fully cleared the top (`LABEL_HANDOFF_GAP`), with no
  fade — fading an opaque bar flashes the prose through it. Its fill is a
  vertical gradient from the tab-strip colour
  (`--vscode-editorGroupHeader-tabsBackground`) at the top to the editor
  background at the bottom (both fall back to the editor background), so the bar
  dissolves into the editor column: its top edge is continuous with the tabs
  directly above the preview, its bottom edge with the prose below. Earlier
  takes that matched a single
  surface looked wrong — editor-bg-plus-tint was a slab one shade off the page,
  and `--vscode-sideBar-background` matched the Explorer but made the bar the
  only non-page-coloured thing in the editor column (the tab strip and page are
  the same colour on warm themes). Both gradient endpoints are opaque theme
  colours, so the fill still occludes scrolling prose; avoid
  `--vscode-editorWidget-*` (flat-white on warm themes). The border-bottom
  carries the "this is a bar" cue once the fill blends in. Because it spans the
  full width, the outline panel
  is docked *below* it: JS measures the bar and exposes `--mpn-bar-height`, which
  `.mpn-outline`'s `top`/`max-height` offset by, so the bar never slices across
  the floating panel. A trailing `.mpn-scroll-spacer` (height set by JS) lets
  near-bottom outline clicks reach the top instead of clamping short.
- **Navigation must clear the sticky chrome — two offsets, both from
  `updateScrollOffset`.** A heading scrolled to via the outline (or any in-page
  anchor) must land *below* whatever sticky element owns the top edge, and the
  active-section detector must look *below* it too. (1) `--mpn-scroll-offset`
  drives the headings' `scroll-margin-top`: in the wide layout it's the section
  bar's height; in the narrow layout (`<1000px`, panel is `position:sticky`) it's
  the whole panel's height — otherwise a clicked heading lands behind the panel.
  Wide-layout *top-level* headings are overridden inline back to the 16px
  breathing room (the bar is hidden for them, so the clearance would just be dead
  space). (2) `activeScrollPad` (the narrow panel's height, else 0) is added to
  the `SCROLL_OFFSET` reading line in `activeHeading`, so a heading that lands
  below the panel is detected as active instead of the one above it (the "click
  Slide 5, Slide 4 activates" bug). The section-label `band` carries the same
  `+ SCROLL_MARGIN_GAP` so the "current section" label doesn't lag a clicked
  heading. All three move together — change one offset and re-check the others.
  These are `scroll-margin`/threshold maths only (layout-free), so they don't
  perturb scroll-sync; covered by the "sticky-chrome clearance" and
  "click-activates-self" specs.

## Verify changes

After editing `media/preview.css` or `media/preview.js`:

```bash
cd test
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install   # one-time; uses system Chrome
npm test                                          # layout / theme / behaviour assertions
npm run test:gallery                              # optional: regenerate screenshots
```

See `test/README.md` for what's covered. The harness loads the real CSS/JS in a
browser, but **cannot** fully reproduce VS Code's injected theme classes,
`markdown.css` cascade, or webview CSP — finish with a real VS Code smoke test
(reload the window, open a dense Markdown file) before calling a change done.

After editing `media/notebook.js`: the harness does **not** load it at all —
the only verification is the VS Code smoke test (reload the window, open an
`.ipynb` with markdown headings). And keep its heading values in sync with
`preview.css`'s heading block; they are deliberate copies (see the comments in
both files).

## Install / run in VS Code

See `README.md` (symlink into `~/.vscode/extensions`, then reload the window).
