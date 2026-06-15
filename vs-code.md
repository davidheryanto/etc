# VS Code cheatsheet

Day-to-day VS Code tweaks: settings, keybindings, snippets, and reusable settings presets.

## Contents

- **Clean baseline** (two tiers: clutter-free vs no-distraction; how to apply on a new machine)
- **Settings**
    - General tweaks (line highlight, occurrences highlight, tab completion, single window, `.md` preview)
- **Notebook font sizes** (which knob sizes what; the diff-view gotcha)
- **Session restore**
    - Recommended clean / minimal-clutter preset
    - All the knobs (`restoreWindows` values, hot exit, view state)
    - Restore by hand (reopen closed editor, open recent)
- **Keybindings**
    - Folding (`Ctrl+K` chord)
    - Custom `keybindings.json`
- **Snippets**
    - Add a global snippet
    - Separator lines (`===`, `---`)
- **Extensions**
- **Activity bar** (compact size, location)
- **Theme-scoped colors** (per-theme overrides; framed title-bar example)
- **Markdown preview styling** (the navigator extension, or hosted CSS via GitHub Pages as an extension-free fallback)
- **Settings presets**
    - Clutter-free
    - No-distraction
    - Disable Copilot for Python

## Clean baseline

A "calm VS Code" recipe built from the fragments in `vs-code-settings/`. Two ideas, kept separate on purpose:

- **Clutter** — visual noise you can remove without losing anything useful: minimap, breadcrumbs, command center, line/word highlights, the chat panel that auto-opens on the right, a pile of restored windows. Safe on any machine.
- **Distraction** — the editor reacting to every keystroke: autocomplete popups, red squiggles, spell/type checks, hover cards, lightbulbs. When you're working out ideas or logic, having it flag every small mistake pulls your focus away — and that happens whether you're writing prose or code. Whether you want it on is a personal choice.

### Two presets — pick ONE (they don't stack)

`no-distraction.json` already contains **every** key in `clutter-free.json`, *plus* the ones that quiet the editor — it's a **superset**. So apply just one of the two, never both. `session-restore.json` goes with whichever you pick.

| Preset | What it changes | Pick it when… |
| ------ | --------------- | ------------- |
| **clutter-free** — [`clutter-free.json`](vs-code-settings/clutter-free.json) | Removes visual noise only. Autocomplete and error-checking stay **on**. | You want autocomplete and error-checking while you work. |
| **no-distraction** — [`no-distraction.json`](vs-code-settings/no-distraction.json) | The above, **plus** turns off autocomplete, suggestions, squiggles (TS/JS/CSS/HTML/JSON), Python analysis, hover, lightbulb, CodeLens. Tab snippet expansion stays on (`tabCompletion: "onlySnippets"`) — snippets only fire on a prefix you typed, so they're not a distraction. | You want a quiet editor to think in — writing prose, or working out code — without it flagging small mistakes. |

Both go with [`session-restore.json`](vs-code-settings/session-restore.json) — on a bare launch it reopens only the last window, not every window from last time.

> These settings apply to the whole machine. To switch between quiet and full-feedback on one machine, put each in a VS Code **Profile** (see [Settings presets](#settings-presets)) and switch profiles.

### Applying on a new machine

Say something like *"apply the clean VS Code settings"* and I'll **ask which one** — clutter-free (autocomplete and error-checking stay on) or no-distraction (turned off) — then add that fragment's keys, plus `session-restore.json`, to your User `settings.json`:

| OS      | User `settings.json`                                    |
| ------- | ------------------------------------------------------- |
| macOS   | `~/Library/Application Support/Code/User/settings.json` |
| Linux   | `~/.config/Code/User/settings.json`                     |
| Windows | `%APPDATA%\Code\User\settings.json`                     |

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

## Notebook font sizes

Sizing `.ipynb` text is three knobs — and one part of the UI that ignores all of
them. (Verified against the VS Code 1.120 source, June 2026.)

| Surface | What sizes it |
| ------- | ------------- |
| Code cells | `editor.fontSize` — or `notebook.editorOptionsCustomizations` to override notebooks only |
| Markdown cells | `notebook.markup.fontSize` — defaults to ~120% of `editor.fontSize`, so pin it if you want cells to match |
| Cell outputs | `notebook.output.fontSize` — defaults to `editor.fontSize` |
| **Notebook diff view** | **`editor.fontSize` only — approximately** (see gotcha) |

The simple setup — one global size, markdown pinned to match:

```jsonc
{
  "editor.fontSize": 13,
  "notebook.markup.fontSize": 13
}
```

To shrink notebooks **without** touching regular editors, use
`notebook.editorOptionsCustomizations` instead of the global key. The settings
UI documents it as tab/indent-only, but the source merges **any** `editor.*`
key into the cell editors — `fontSize` included:

```jsonc
"notebook.editorOptionsCustomizations": {
  "editor.fontSize": 12
}
```

> **The diff-view gotcha.** The notebook diff editor (Source Control → a
> changed `.ipynb`) builds its cell editors through a separate options class
> that honors only `tabSize` / `indentSize` / `insertSpaces` from
> `editorOptionsCustomizations` — its **font keys are ignored** there. And
> `notebook.diff.*` has no typography settings at all. So the diff view roughly
> follows the global `editor.fontSize`, but computes its size at open time and
> doesn't track config changes live: measured against the same UI ruler, it
> drifted up to ~10% in *either* direction across sessions, never exactly
> equal. A window reload (or closing and reopening the diff tab) makes it
> recompute; exact parity isn't guaranteed. There is no setting to pin it —
> quirk lives upstream, not in your config.

With the [Markdown Preview Navigator](vs-code-extensions/markdown-preview-navigator/)
extension installed, notebook **markdown-cell headings** are also compressed to
the preview's near-body scale (h1 1.35em instead of the built-in 2.3em) — the
extension ports its heading treatment into notebook cells, which otherwise
ignore all preview styling. See its README.

## Session restore

Control what reopens when you relaunch VS Code — with no leftover clutter.

### Recommended: clean / minimal-clutter

The "pick up exactly where I left off, nothing extra" baseline — reopen only the
**single last** window on a bare launch, and never let stale buffers linger. This
is the setup to apply on a fresh machine.

```jsonc
{
  // Bare launch (app icon / `code` with no args) → reopen ONLY the last window.
  // Launching WITH a folder/file (`code .`, Open with VS Code, Finder) won't
  // reopen your OTHER windows — though that folder's own tabs may still come
  // back (see caveats). (Default "all" reopens every window from last time.)
  "window.restoreWindows": "one",

  // Prompt to save/discard ANY unsaved file on close, instead of silently
  // backing it up and restoring it next launch. (Default "onExit".)
  "files.hotExit": "off"
}
```

| You do this                           | Result                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Open VS Code **with** a folder/file   | Reopens **no other windows** (that folder's own tabs may still return) |
| Open VS Code **bare** (icon / `code`) | Reopens **only the single last** window                                |
| Quit with an **unsaved** file         | Prompts to save/discard — nothing's backed up silently                 |

> **Two caveats:**
> - `files.hotExit: "off"` prompts for **any** unsaved file on close — named or untitled. Pair it with `files.autoSave` (e.g. `"onFocusChange"`) so named files save themselves and, in practice, only untitled scratch tabs ever prompt.
> - `window.restoreWindows: "one"` controls **windows only**. A folder you've opened before still reopens the tabs you left in it (VS Code remembers editors per workspace); a brand-new folder opens empty. `workbench.editor.restoreViewState` (default `true`) just restores scroll/cursor within those editors.

Drop-in: [`vs-code-settings/session-restore.json`](vs-code-settings/session-restore.json).
On a new machine, just ask: *"read `vs-code.md` and apply the clean session-restore settings."*

### All the knobs

`window.restoreWindows` — which windows reopen on launch:

| Value             | Behavior                                                                       |
| ----------------- | ------------------------------------------------------------------------------ |
| `preserve`        | Always reopen **all** windows; a folder/file from the CLI opens as a new window. |
| `all` *(default)* | Reopen all windows **unless** a folder/workspace/file is opened (e.g. from the CLI). |
| `folders`         | Reopen only windows that had a **folder/workspace** open.                      |
| `one`             | Reopen just the **last active** window.                                        |
| `none`            | Never reopen — start with an empty window.                                     |

Plus:

- `files.hotExit` — `off` | `onExit` *(default)* | `onExitAndWindowClose`. See the gotcha below.
- `workbench.editor.restoreViewState` *(default `true`)* — restore scroll/cursor in reopened editors.
- `window.restoreFullscreen` *(default `false`)* — relaunch into full screen if you quit in full screen.

> `window.reopenFolders` is the old name for `window.restoreWindows` — **deprecated**; use the new one.

**The hot-exit gotcha.** `files.hotExit` defaults to `"onExit"`, which only backs up
unsaved work when the *last* window closes (or you Quit). With unsaved changes its
priority is to *show you the backups*, which can override `window.restoreWindows` and
make restore feel broken. `"onExitAndWindowClose"` also backs up any window with a
folder open and avoids that conflict. `"off"` (the clean choice above) disables
backups entirely and prompts on close.

### Restore by hand

- **Reopen Closed Editor** — `Cmd+Shift+T` (`Ctrl+Shift+T` on Win/Linux): reopen recently closed tabs one at a time, browser-style.
- **File → Open Recent** (`Ctrl+R` opens the picker): jump back to a recent folder or workspace.
- For deliberate, named sessions, save a **`.code-workspace`** file — more durable than relying on auto-restore.

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

Pair with `"editor.tabCompletion": "onlySnippets"` (see [Settings](#settings)) so `Tab` reliably expands snippets without autocomplete getting in the way. Both clean-baseline routes keep this working: the general tweaks set it directly, and `no-distraction.json` uses the same value.

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

**From the Marketplace:**

- [**Better YAML Formatter**](https://github.com/longkai/kubernetes-yaml-formatter) — sensible YAML formatting, especially for Kubernetes manifests.

**Workspace-owned** — in this repo under [`vs-code-extensions/`](vs-code-extensions/); symlink + reload to install (see each README):

- [**Markdown Preview Navigator**](vs-code-extensions/markdown-preview-navigator/) — adds a scroll-aware heading outline to the built-in Markdown preview and restyles it for denser reading. It's the canonical source of the preview styling below — see [Markdown preview styling](#markdown-preview-styling).
- [**HTML Preview (Default Editor)**](vs-code-extensions/html-preview-default/) — opens `.html` files as a sandboxed rendered preview by default instead of the source editor.

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

## Markdown preview styling

Two ways to restyle the **built-in Markdown preview** for denser, more readable
documents. They overlap — both set the reading measure, body colour, and bold —
so **use one, not both** on a given machine. Stacking them makes the two
stylesheets fight in the webview cascade.

| Path | What you get | Use it when |
| ---- | ------------ | ----------- |
| **Navigator extension** *(canonical)* | The full treatment — reading typography **plus** a scroll-aware heading outline, a current-section bar, lighter tables, and code-copy buttons. | You install the workspace extension (the usual case). |
| **Hosted CSS** via `markdown.styles` | Just the reading typography — measure, softened body text, stronger bold. No outline. | A machine where you *don't* install the extension. |

### Path A — the navigator extension (canonical)

[`markdown-preview-navigator`](vs-code-extensions/markdown-preview-navigator/) is a
workspace-owned extension in this repo; its `media/preview.css` is the **source of
truth** for the preview's look. Install it (symlink + reload — see its
[README](vs-code-extensions/markdown-preview-navigator/README.md)) and the styling
and the outline arrive together on every machine you install it on. On this path,
**don't** also set `markdown.styles` below: the extension already injects that
typography, so a second copy would double-apply.

### Path B — hosted CSS (extension-free fallback)

For a machine *without* the extension, point `markdown.styles` at a CSS file hosted
on GitHub Pages, so even a vanilla preview gets the reading typography:

```jsonc
"markdown.styles": [
  "https://davidheryanto.github.io/dotvscode/markdown-preview.css"
]
```

**What the hosted CSS does** *(the CSS file itself is the source of truth; it
closely mirrors the typography the extension applies — the extension is the
canonical version and may carry small refinements)*:

- Caps the preview at ~800px wide and centers it — a comfortable ~70–80-character reading measure with roomy line-height, instead of running the full editor width.
- Softens body text off the theme extreme (`#e6e6e6` on dark, `#1a1a1a` on light) to cut glare.
- Sets **bold** apart by colour: bold is held at the theme's pure extreme (pure white on dark / pure black on light) while the body is softened off it, scoped per theme — a separation the default preview (where bold is the body colour, only heavier) doesn't have.

**How it works:**

- `markdown.styles` takes a list of CSS URLs (or workspace-relative paths) injected into the Markdown **preview** webview (not the editor, not exported HTML).
- Hosted from the [`davidheryanto/dotvscode`](https://github.com/davidheryanto/dotvscode) repo via **GitHub Pages**; that URL is the single source of truth *for this fallback CSS*. Edit → commit → push there and every machine using the URL updates at once.
- Use the GitHub **Pages** URL, *not* `raw.githubusercontent.com`: Pages serves `.css` as `text/css` (confirmed: `content-type: text/css; charset=utf-8`), which the webview requires; the raw host serves `text/plain` and the webview ignores it.

**On a new machine:** if you install the navigator extension, you need nothing here — the look comes with it. Only where you *won't* install the extension, ask *"set up my Markdown preview CSS"* and I'll add the `markdown.styles` key above to your User `settings.json`. Editing the fallback look itself happens in the `dotvscode` repo (the CSS), not here.

## Settings presets

Drop-in `settings.json` chunks. Copy into user `settings.json` or a workspace `.vscode/settings.json`. See [Clean baseline](#clean-baseline) for how the first two relate — apply one or the other, not both.

> Not to be confused with VS Code's built-in **Profiles** feature (`File → Profiles`), which bundles settings + keybindings + extensions + UI state into a swappable unit. These are just JSON snippets.

### Clutter-free

[`vs-code-settings/clutter-free.json`](vs-code-settings/clutter-free.json) — the **lighter** clean-baseline preset: drops static visual noise (minimap, breadcrumbs, command center, line/occurrence highlights, SCM badge, the auto-opening right-hand chat panel) with **no loss of function**. Safe even on machines you actively program on. Pair with [`session-restore.json`](vs-code-settings/session-restore.json). See [Clean baseline](#clean-baseline).

### No-distraction

[`vs-code-settings/no-distraction.json`](vs-code-settings/no-distraction.json) — the **fuller** clean-baseline preset and a **superset** of clutter-free: strips VS Code down to a plain text editor — *also* turns off IntelliSense, suggestions, and validation squiggles. Good for prose / notes machines; skip it where you want the IDE to catch mistakes. Apply this **or** clutter-free, not both.

### Disable Copilot for Python

```json
{
  "github.copilot.enable": {
    "python": false
  }
}
```

Keeps Copilot enabled everywhere else.
