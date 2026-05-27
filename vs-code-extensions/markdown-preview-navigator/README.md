# Markdown Preview Navigator

Workspace-owned VS Code extension that adds a scroll-aware heading navigator to
VS Code's built-in Markdown Preview.

## Behavior

- Keeps Markdown files unchanged.
- Uses VS Code's built-in Markdown Preview.
- Builds a floating heading navigator from rendered `h2`, `h3`, and `h4`
  headings.
- Highlights the section nearest the current scroll position.
- Shows the current section path above the navigator, with a top-of-document
  jump control alongside it.
- Lets you collapse or expand individual outline branches.
- Includes collapse-all and expand-all controls.
- Adds a hover-revealed copy-to-clipboard button to every fenced code block.
- Uses no third-party dependencies.

## Preview styling

Beyond the navigator, the extension lightly restyles the built-in Markdown
preview for denser, more readable documents. These apply to every previewed
file, not only when the navigator is shown:

- Compresses VS Code's heading scale and mutes `h3`+ with the secondary text
  color, so headings guide without dominating the prose.
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
