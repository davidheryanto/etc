# VS Code cheatsheet

Day-to-day VS Code tweaks: settings, keybindings, snippets, and reusable settings presets.

## Contents

- **Settings**
    - General tweaks (line highlight, occurrences highlight, tab completion, single window, `.md` preview)
- **Keybindings**
    - Folding (`Ctrl+K` chord)
    - Custom `keybindings.json`
- **Snippets**
    - Add a global snippet
    - Separator lines (`===`, `---`)
- **Extensions**
- **Activity bar** (compact size, location)
- **Theme-scoped colors** (per-theme overrides; framed title-bar example)
- **Settings presets**
    - No-distraction
    - Disable Copilot for Python

## Settings

Open with `Ctrl+,` then click the JSON icon (top-right), or `Ctrl+Shift+P` → "Preferences: Open User Settings (JSON)".

```jsonc
{
  // Open files in the existing window instead of a new one
  "window.openFilesInNewWindow": false,

  // No current-line highlight. With "line" (the default) or "all", a long
  // wrapped paragraph looks fully highlighted because the whole logical line
  // is one row — distracting in Markdown. "gutter" is a middle ground: only
  // the line number is marked.
  "editor.renderLineHighlight": "none",

  // No highlight boxes around the word under the cursor and its matches.
  // editor.selectionHighlight (highlights when you select a word) is left
  // at its default ("on") — that one is useful.
  "editor.occurrencesHighlight": "off",

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

## Activity bar

Narrow the left icon strip with a native setting — and it survives VS Code updates, unlike custom-CSS workbench hacks (the `be5invis.vscode-custom-css` extension) which every upgrade overwrites and which need a root `chown` on system-wide Linux installs:

```json
"workbench.activityBar.compact": true
```

Or right-click the activity bar → **Activity Bar Size → Compact**. Related: `"workbench.activityBar.location"` takes `"top"` (compact icon row above the side bar) or `"hidden"` (no icons — switch views with `Ctrl+Shift+E` / `F` / `D` / `X`).

## Theme-scoped colors

`workbench.colorCustomizations` overrides theme colors **globally**. To override only for one theme — so switching themes later doesn't drag the tweak onto them — nest the keys under a `"[Theme Name]"` block, where the name is the exact label from the theme picker:

```jsonc
"workbench.colorCustomizations": {
  "[Monokai Pro Light (Filter Sun)]": {
    // applies only while this theme is active
  }
}
```

**Worked example — a warm title bar that frames the editor.** Some light themes (Monokai Pro Filter Sun among them) paint the title bar the same color as the side bar with washed-out text, so it visually disappears. This gives it a distinct-but-calm presence: a warm band on the title bar *and* the status bar (the editor then sits framed between two matching rails), defined by a subtle one-shade-darker hairline rather than a hard line. The inactive title bar is *lighter* so it recedes when the window loses focus.

```jsonc
"workbench.colorCustomizations": {
  "[Monokai Pro Light (Filter Sun)]": {
    // Top rail
    "titleBar.activeBackground": "#ddd0c2",
    "titleBar.activeForeground": "#4a3f37",
    "titleBar.inactiveBackground": "#e6dcd1",   // lighter → recedes when unfocused
    "titleBar.inactiveForeground": "#8a7d72",
    "titleBar.border": "#cfc1b2",               // subtle in-family hairline, no hard line
    // Bottom rail — matches the top, frames the editor
    "statusBar.background": "#ddd0c2",
    "statusBar.foreground": "#4a3f37",
    "statusBar.border": "#cfc1b2"
  }
}
```

Pick colors that *belong* to the theme instead of eyeballing them: every installed theme ships a JSON of its color tokens, so reuse the theme's own ramp (`editor.background` → `sideBar.background` → `activityBar.background`) and keep overrides in-family.

```bash
# Monokai Pro palette files:
ls ~/.vscode/extensions/monokai.theme-monokai-pro-vscode-*/themes/
```

> Avoid the saturated theme **accent** (e.g. Filter Sun's rose `#ce4770`) for chrome borders — as a full-width title-bar line it reads loud and fights the calm. A neutral in-family hairline wears better.

## Settings presets

Drop-in `settings.json` chunks. Copy into user `settings.json` or a workspace `.vscode/settings.json`.

> Not to be confused with VS Code's built-in **Profiles** feature (`File → Profiles`), which bundles settings + keybindings + extensions + UI state into a swappable unit. These are just JSON snippets.

### No-distraction

[`vs-code-settings/no-distraction.json`](vs-code-settings/no-distraction.json) — strips VS Code down to a plain text editor: no IntelliSense, suggestions, validation squiggles, minimap, or breadcrumbs. Good for prose / notes / focused coding.

### Disable Copilot for Python

```json
{
  "github.copilot.enable": {
    "python": false
  }
}
```

Keeps Copilot enabled everywhere else.
