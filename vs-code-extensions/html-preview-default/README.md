# HTML Preview (Default Editor)

Workspace-owned VS Code extension that makes `.html` files open as a rendered
preview by default, instead of the source editor.

## Behavior

- Registers a custom editor for `*.html` with `priority: "default"`.
- Renders the file content in a sandboxed webview.
- Injects a Content-Security-Policy intended to block common network egress
  paths (`fetch`/`XHR`/`WebSocket`), remote resource loads, frames, workers,
  forms, and navigation. Inline scripts and styles run so arbitrary local
  HTML renders correctly.
- Scopes `localResourceRoots` to the HTML file's own directory and injects a
  `<base>` tag so relative assets resolve via the webview protocol.
- Images, media, fonts, CSS, and scripts may load from the file's own
  directory. Images and media additionally accept `data:` and `blob:` URIs;
  fonts additionally accept `data:`. Remote origins are blocked.
- Resets default webview styling for `<code>`, `<pre>`, `<kbd>`, `<samp>`,
  `<tt>` so VS Code's theme colors do not override the page's own styles.
- Re-renders on every change to the underlying document.
- Uses no third-party dependencies.

To edit the source instead of the preview, right-click the file in the
Explorer and choose **Open With... → Text Editor**.

## Security model

The webview is sandboxed and a Content-Security-Policy is injected that is
intended to:

- Block remote fetches, frames, workers, form submissions, and navigation.
- Restrict resource loads to files inside the HTML's own directory via
  `localResourceRoots` (plus `data:`/`blob:` URIs for images and media, and
  `data:` URIs for fonts).
- Allow inline `<script>` and `<style>` (`'unsafe-inline'`) so arbitrary
  local HTML renders correctly.

The extension declares `capabilities.untrustedWorkspaces.supported: false`,
so VS Code disables it automatically in Restricted Mode. Only open HTML
files inside workspaces you have explicitly trusted.

Because this is the **default** editor for `.html` in trusted workspaces,
any HTML file you click will execute its inline scripts in the sandbox. The
CSP is intended to block common network egress paths, but treat it as
defense-in-depth rather than an absolute guarantee — a hostile page could
still display deceptive UI in the preview pane, consume resources, or
exploit bugs in the CSP layer. For HTML of unknown origin, right-click the
file → **Open With... → Text Editor** to view the source without rendering.

## Local Install

From the repository root:

```bash
mkdir -p ~/.vscode/extensions
ln -s "$PWD/vs-code-extensions/html-preview-default" \
  ~/.vscode/extensions/davidheryanto.html-preview-default-0.0.1
```

Then reload the VS Code window:

1. Press `Ctrl+Shift+P` / `Cmd+Shift+P`.
2. Run `Developer: Reload Window`.

Click any `.html` file in the Explorer to see the rendered preview.

To remove it:

```bash
rm ~/.vscode/extensions/davidheryanto.html-preview-default-0.0.1
```
