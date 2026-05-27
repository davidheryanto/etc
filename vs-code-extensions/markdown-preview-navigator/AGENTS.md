# Markdown Preview Navigator — agent guide

Workspace-owned VS Code extension that injects a scroll-aware heading navigator
into VS Code's **built-in** Markdown Preview. No build step and no activation
code — `package.json` only contributes static assets:

- `markdown.previewStyles` → `media/preview.css`
- `markdown.previewScripts` → `media/preview.js`

`preview.js` runs inside the preview webview; `preview.css` styles it.

## Conventions

- **Zero runtime dependencies.** The shipped extension is just the manifest plus
  the two files in `media/`. Keep it that way — dev-only tooling lives under
  `test/` with its own `package.json`.
- **Theme-variable driven.** Colours come from `--vscode-*` variables and the
  `.vscode-light` / `.vscode-dark` body classes — never hard-coded palettes, so
  it holds up across light, dark, and high-contrast themes.
- Current design language: a single panel — a pinned header (section label +
  icon controls) above a scrolling list. The active section is shown by a left
  **accent rail** (not a background fill) on its row, which is kept scrolled
  into view; long headings use a 2-line clamp; `h3`/`h4` nesting is marked by
  hairline connector rails. No breadcrumb — the highlighted row is the
  "where am I".

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
