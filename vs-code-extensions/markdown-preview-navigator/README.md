# Markdown Preview Navigator

Workspace-owned VS Code extension that adds a scroll-aware heading navigator to
VS Code's built-in Markdown Preview.

## Behavior

- Keeps Markdown files unchanged.
- Uses VS Code's built-in Markdown Preview.
- Builds a floating heading navigator from rendered `h2`, `h3`, and `h4`
  headings.
- Highlights the section nearest the current scroll position with a left accent
  rail rather than a heavy background fill, and keeps that row scrolled into
  view as you read.
- Pins a slim "current section" bar to the top of the reading column once that
  section's heading has scrolled off, so the section you're in stays clear
  without glancing away from the text.
- Wraps long headings to two lines instead of truncating them to one.
- Draws a hairline connector rail in the indent gutter so `h3`/`h4` nesting
  reads at a glance.
- Reveals the full text on hover when an outline label is truncated.
- Lets you collapse or expand individual outline branches.
- Includes icon controls for collapse-all, expand-all, and jump-to-top.
- Adds a hover-revealed copy-to-clipboard button to every fenced code block.
- Uses no third-party dependencies.

## Preview styling

Beyond the navigator, the extension lightly restyles the built-in Markdown
preview for denser, more readable documents. These apply to every previewed
file, not only when the navigator is shown:

- Caps the body at a ~70–80-character reading measure (~800px) and centers it,
  with a roomy line-height, instead of running the full editor width. When the
  outline is docked, the measure shifts left to clear the panel.
- Softens body text off the theme's foreground extreme (near-white on dark,
  near-black on light) to cut glare.
- Sets **bold** apart by color, not just weight: bold is held at the theme's
  pure extreme (white on dark / black on light) while the body is softened off
  it — a separation VS Code's default preview (where bold is the body color,
  only heavier) doesn't have. The weight is actually eased down (the webview's
  default bold is 700) so dense bold lead-ins read as calm emphasis, not a heavy
  rail.
- Compresses VS Code's heading scale so headings guide without dominating the
  prose. `h3` stays near full strength (softened only slightly), while `h4`+
  drop to the secondary text color to mark depth.
- Trims the page's side padding for more content width.
- Normalizes vertical rhythm — consistent paragraph, heading, and code-block
  spacing, plus balanced blockquote padding.
- Lightens tables: hairline dividers in place of VS Code's heavy header rule,
  an uppercase, letter-spaced header label, slightly smaller cell text, and
  roomier rows.
- Offsets in-page scroll targets so a heading clicked in the navigator lands
  with a little space above it rather than flush to the top edge.

## Local Install

From the repository root:

```bash
mkdir -p ~/.vscode/extensions
ln -s "$PWD/vs-code-extensions/markdown-preview-navigator" \
  ~/.vscode/extensions/davidheryanto.markdown-preview-navigator-0.1.0
```

Then reload the VS Code window:

1. Press `Ctrl+Shift+P` / `Cmd+Shift+P`.
2. Run `Developer: Reload Window`.

Reopen or refresh Markdown Preview after reload.

To remove it:

```bash
rm ~/.vscode/extensions/davidheryanto.markdown-preview-navigator-0.1.0
```
