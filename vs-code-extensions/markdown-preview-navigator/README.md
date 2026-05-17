# Markdown Preview Navigator

Workspace-owned VS Code extension that adds a scroll-aware heading navigator to
VS Code's built-in Markdown Preview.

## Behavior

- Keeps Markdown files unchanged.
- Uses VS Code's built-in Markdown Preview.
- Builds a floating heading navigator from rendered `h2`, `h3`, and `h4`
  headings.
- Highlights the section nearest the current scroll position.
- Shows the current section path above the navigator.
- Includes a top-of-document jump control.
- Lets you collapse or expand individual outline branches.
- Includes collapse-all and expand-all controls.
- Adds a hover-revealed copy-to-clipboard button to every fenced code block.
- Uses no third-party dependencies.

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
