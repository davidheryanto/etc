# Markdown Preview Navigator — agent guide

Workspace-owned VS Code extension that injects a scroll-aware heading navigator
into VS Code's **built-in** Markdown Preview. No build step and no activation
code — `package.json` only contributes static assets:

- `markdown.previewStyles` → `media/preview.css`
- `markdown.previewScripts` → `media/preview.js`

`preview.js` runs inside the preview webview; `preview.css` styles it.

`preview.css` does two jobs: the navigator chrome (panel, section bar) **and** a
restyle of the base preview prose — reading measure, body colour, bold, heading
scale, tables, blockquotes, code blocks (the user-facing list lives in
`README.md` under "Preview styling"). That prose restyle applies to every
previewed file, not only when the panel is shown — so smoke-test a plain dense
doc too, not just one with an outline.

## Conventions

- **Zero runtime dependencies.** The shipped extension is just the manifest plus
  the two files in `media/`. Keep it that way — dev-only tooling lives under
  `test/` with its own `package.json`.
- **Theme-variable driven.** Colours come from `--vscode-*` variables and the
  `.vscode-light` / `.vscode-dark` body classes — never hard-coded palettes, so
  it holds up across light, dark, and high-contrast themes. The one **deliberate
  exception** is the reading typography (prose body colour and `strong`/`b`),
  which uses fixed near-extreme hex values *on purpose*: the goal is to step off
  the theme's own foreground extreme — and push bold to it — which a theme var
  would just reintroduce. Don't "fix" those to `--vscode-*`.
- Current design language: a single panel — a pinned header (section label +
  icon controls) above a scrolling list. The active section is shown by a left
  **accent rail** (not a background fill) on its row, which is kept scrolled
  into view; long headings use a 2-line clamp; `h3`/`h4` nesting is marked by
  hairline connector rails. No breadcrumb inside the panel — the highlighted row
  is the "where am I" there.
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

## Install / run in VS Code

See `README.md` (symlink into `~/.vscode/extensions`, then reload the window).
