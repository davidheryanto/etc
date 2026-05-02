# VS Code cheatsheet

Day-to-day VS Code tweaks: settings, keybindings, snippets, and reusable settings profiles.

## Contents

- **Settings**
    - General tweaks (line highlight, tab completion, single window, `.md` preview)
- **Keybindings**
    - Folding (`Ctrl+K` chord)
    - Custom `keybindings.json`
- **Snippets**
    - Add a global snippet
    - Separator lines (`===`, `---`)
- **Extensions**
- **Settings profiles**
    - No-distraction
    - Disable Copilot for Python

## Settings

Open with `Ctrl+,` then click the JSON icon (top-right), or `Ctrl+Shift+P` → "Preferences: Open User Settings (JSON)".

```jsonc
{
  // Open files in the existing window instead of a new one
  "window.openFilesInNewWindow": false,

  // Highlight the entire current line
  "editor.renderLineHighlight": "all",

  // Tab key only expands snippets — never autocomplete suggestions
  "editor.tabCompletion": "onlySnippets",

  // Open .md files as rendered preview when double-clicked.
  // To edit: click the split-pane icon in the preview tab,
  // or right-click the file → Open With → Text Editor.
  "workbench.editorAssociations": {
    "*.md": "vscode.markdown.preview.editor"
  }
}
```

## Keybindings

### Folding

Press `Ctrl+K`, release, then the second key.

| Action            | Keys                  |
| ----------------- | --------------------- |
| Fold all          | `Ctrl+K` `Ctrl+0`     |
| Fold to level *n* | `Ctrl+K` `Ctrl+`*n*   |
| Unfold all        | `Ctrl+K` `Ctrl+J`     |

### Custom `keybindings.json`

Open with `Ctrl+K` `Ctrl+S` → "Open Keyboard Shortcuts (JSON)" icon (top-right).

```json
[
  {
    "key": "ctrl+shift+v",
    "command": "-markdown.showPreview",
    "when": "!notebookEditorFocused && editorLangId == 'markdown'"
  },
  {
    "key": "ctrl+\\",
    "command": "workbench.action.moveEditorToBelowGroup"
  }
]
```

- Leading `-` on a command **unbinds** the default — useful for freeing up a key.
- `moveEditorToBelowGroup` splits and **moves** the editor; `splitEditorDown` would copy it instead.

## Snippets

### Add a global snippet

`Ctrl+Shift+P` → "Snippets: Configure Snippets" → "New Global Snippets file".

Pair with `"editor.tabCompletion": "onlySnippets"` (see [Settings](#settings)) so `Tab` reliably expands snippets without autocomplete getting in the way.

### Separator lines

Type the prefix and press `Tab` to expand into a long line — handy for section breaks in plain-text notes.

```json
{
  "Expand equals": {
    "prefix": "===",
    "body": "============================================================",
    "description": "Expand === into a long equals line"
  },
  "Expand dashes": {
    "prefix": "---",
    "body": "------------------------------------------------------------",
    "description": "Expand --- into a long dash line"
  }
}
```

## Extensions

- [**Better YAML Formatter**](https://github.com/longkai/kubernetes-yaml-formatter) — sensible YAML formatting, especially for Kubernetes manifests.

## Settings profiles

Drop-in `settings.json` chunks. Copy into user `settings.json` or a workspace `.vscode/settings.json`.

### No-distraction

[`vs-code-profiles/no-distraction.json`](vs-code-profiles/no-distraction.json) — strips VS Code down to a plain text editor: no IntelliSense, suggestions, validation squiggles, minimap, or breadcrumbs. Good for prose / notes / focused coding.

### Disable Copilot for Python

```json
{
  "github.copilot.enable": {
    "python": false
  }
}
```

Keeps Copilot enabled everywhere else.
