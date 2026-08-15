# Sublime Text cheatsheet

Build 4200 setup: settings, keybindings, per-syntax files, Terminus, and the side-bar plugins kept in `sublime-packages/`.

## Contents

- **Install on a new machine** (vendor repo, Package Control from the Tools menu, packages worth having)
- **Settings**
    - Where settings live (per-OS `Packages/` paths)
    - Baseline preferences (Monokai Pro; built-in-theme variant)
    - Stop right-click from previewing the file (`preview_on_click`)
- **Per-syntax settings** (one file per syntax: indent width and extension mapping)
- **Open new buffers as Markdown instead of Plain Text** (small plugin; why `on_new` isn't enough)
- **Keybindings** (JetBrains-style add-line, jump history, reindent, Pretty JSON)
- **Snippets** (`===` and `---` separator rules)
- **Side bar and tab menus** (what's in `sublime-packages/` and why it needs a plugin)
- **Terminus**
    - Settings
    - Set it up on a new machine
    - Why `background` is one hex short of the panel colour
    - A dark terminal needs a tab, not the panel
- **Shortcuts** (selection, folding, panes and tabs)
- **Open files and folders from the terminal**
    - Getting `subl` on PATH
    - Attach to the current window instead of opening a new one (the `-a` alias)
- **Windows: add an Explorer context-menu entry** (registry `.bat`)
- **Search and replace with regex** (multi-keyword AND, capture groups)
- **Find the command behind a menu item** (`log_commands`)

## Install on a new machine

Sublime Text and Sublime Merge install from the vendor repos — `fedora.md` has the Fedora links, `mac-os.txt` has the `smerge` symlink.

The *installer* for Package Control ships with the editor: **Tools > Install Package Control…** downloads it into `Installed Packages/`. No console bootstrap needed, but the palette's `Package Control:` commands only appear once that has finished.

Then **Ctrl+Shift+P > Package Control: Install Package** (**Cmd+Shift+P** on macOS) for each of:

| Package | Why |
| --- | --- |
| Theme - Monokai Pro | UI theme and colour scheme the settings below assume |
| A File Icon | File-type icons in the side bar |
| Terminus | Terminal in a panel or a tab — see Terminus below |
| Git | Git commands from the command palette |
| Pretty JSON | Format and validate JSON; Sublime has no built-in equivalent |
| PackageDev | Editing support for `.sublime-*` files |
| Terraform | Terraform syntax |

For language intelligence — completion, diagnostics, go-to-definition — install **LSP** plus that language's server (`LSP-yaml`, `LSP-pyright`, …). Formatting comes along only when the server implements it: `LSP-yaml` formats, `LSP-pyright` does not, so Python still needs a formatter server or package of its own (`LSP-ruff`, say).

Last, copy in the side-bar and tab-menu plugins from `sublime-packages/`. That directory mirrors the `Packages/` layout, so installing is a straight `cp -r` — its README has the commands.

## Settings

### Where settings live

**Preferences > Settings** writes to `Packages/User/Preferences.sublime-settings`:

| OS | `Packages/` |
| --- | --- |
| Linux | `~/.config/sublime-text/Packages` |
| macOS | `~/Library/Application Support/Sublime Text/Packages` |
| Windows | `%APPDATA%\Sublime Text\Packages` |

**Preferences > Browse Packages** opens the directory. Settings, menus, snippets and plugins under it are re-read on save, so most edits apply immediately. A few settings say otherwise in their own comment — `ui_scale`, `hardware_acceleration` and `index_workers` all want a restart — as does installing a package that ships plugins.

### Baseline preferences

```json
{
    // Start with a clean slate rather than last session's tabs
    "hot_exit": false,
    "hot_exit_projects": false,
    "remember_open_files": false,

    "color_scheme": "Monokai Pro.sublime-color-scheme",
    "theme": "Monokai Pro.sublime-theme",
    "font_face": "SF Mono",
    "font_size": 11,

    // Auto-pairing brackets and quotes gets in the way more than it helps
    "auto_match_enabled": false,
    "update_check": false,
    "ignored_packages": ["Vintage"],
    "index_files": true,
    "tree_animation_enabled": false,
    "animation_enabled": false,
    "preview_on_click": "only_left",

    "monokai_pro_label_font_size": 13,
    "monokai_pro_sidebar_font_size": 13,
    "monokai_pro_style_title_bar": true
}
```

To stay on the built-in themes instead, use `"color_scheme": "Mariana.sublime-color-scheme"` and `"theme": "Adaptive.sublime-theme"`, and drop the three `monokai_pro_*` lines. Sidebar and tab label sizes are theme settings — for a theme without its own knobs, use **Preferences > Customize Theme** and set the `sidebar_label` / `tab_label` classes there.

Deliberately not in the preset, but worth knowing: `word_wrap` defaults to `"auto"`, which wraps prose but not source code. Set it to `true` to wrap everywhere or `false` to never wrap.

### Stop right-click from previewing the file

Clicking a file in the side bar opens a preview tab (italic title, replaced by the next file you click). By default a *right*-click does this too, so opening the context menu to reach Copy Path or Delete File also loads the file.

That's intended, not a bug — the shipped `Preferences.sublime-settings` documents the default `true` as "Always preview on click, including right click". Set it to `"only_left"` and right-click just moves the selection, matching every other file tree (VS Code, Finder, Explorer, JetBrains), where right-click asks "what can I do with this?" rather than activating.

```json
// true (default) | false (never preview) | "only_left"
"preview_on_click": "only_left",
```

Added in build 4107.

## Per-syntax settings

One file per syntax, at `Packages/User/<Syntax>.sublime-settings`. Both indent width and extension mapping live there, so keep each syntax's keys in one file.

**Preferences > Settings – Syntax Specific** creates and opens the right file for whatever syntax is active. That's the route to use on a machine that's already set up, because it merges into what's there.

The commands below are for a **fresh machine only**. Each one writes the whole file with `>`, so running them against existing settings discards whatever keys those files already hold:

```bash
# Linux path. On macOS: P=~/Library/Application\ Support/Sublime\ Text/Packages/User
P=~/.config/sublime-text/Packages/User

cat > "$P/YAML.sublime-settings" <<'EOF'
{
    "tab_size": 2,
    // Give file.yaml.tpl YAML highlighting
    "extensions": ["yaml.tpl"]
}
EOF

cat > "$P/JSON.sublime-settings" <<'EOF'
{
    // .jsonl (JSON Lines / ndjson) opens as Plain Text otherwise. The built-in
    // JSON syntax covers .json, .jsonc, .ipynb and the .sublime-* files, but not
    // .jsonl. It's a tokenizer, not a validator, so it colours each line happily
    // and won't flag the multi-object file.
    "extensions": ["jsonl"]
}
EOF

# Backtick auto-pairing is especially disruptive when writing code fences
echo '{"auto_match_enabled": false}' > "$P/Markdown.sublime-settings"

echo '{"tab_size": 2}' > "$P/SQL.sublime-settings"
```

Don't reach for `>>` to make them safe — appending leaves two concatenated JSON objects in one file, which is invalid, and Sublime then silently ignores the file. Merge by hand, or go through the Syntax Specific menu.

Extension mapping is applied at open time, so reopen the file to see it take effect. The GUI equivalent is **View > Syntax > Open all with current extension as**.

Two related notes:

- Sublime does not strip trailing whitespace by default (`trim_trailing_white_space_on_save` is `"none"`). If you ever turn it on globally, set it back to `"none"` in `Markdown.sublime-settings` to keep two-space hard line breaks.
- Go templates need no extra syntax. The shipped Go package covers them: **HTML (Go)** claims `.gohtml`, `.go.html` and `.tmpl`, and there are Markdown, YAML, JSON, JavaScript and CSS variants alongside it. For a template file with some other extension, map it onto one of those with `extensions` as above, or pick it from **View > Syntax**.

## Open new buffers as Markdown instead of Plain Text

There's no setting for the default syntax of a new untitled buffer. This plugin covers it — save as `Packages/User/default_syntax_markdown.py`; it hot-reloads. Opening or saving a file still picks syntax from the extension as usual.

`on_new` alone is not enough: it fires only for a new *tab* (Ctrl+N). A new *window*'s initial buffer isn't routed through it, and the launch window's buffer is created before the plugin loads, so no event fires for it at all. Hence `on_activated_async` as the catch-all, plus `plugin_loaded()` to fix up the window that's already open.

Expect the launch window to show Plain Text for a second or two before flipping, because the plugin host loads after the window is drawn. New tabs and windows in a running instance switch instantly.

```python
import sublime
import sublime_plugin

_SYNTAX = "Packages/Markdown/Markdown.sublime-syntax"
_PLAIN = "Packages/Text/Plain text.tmLanguage"


def _is_blank_untitled(view):
    # An empty, never-saved scratch buffer still on the default Plain Text
    # syntax. The Plain-Text guard means we only ever upgrade the default —
    # a file you open, or a syntax you pick yourself, is left alone. The
    # is_widget/element guard keeps us off panels and input fields (find,
    # command palette, build output) that can also be empty + untitled.
    return (view is not None
            and not view.settings().get("is_widget")
            and view.element() is None
            and not view.file_name()
            and view.size() == 0
            and view.settings().get("syntax") == _PLAIN)


class MarkdownDefaultSyntax(sublime_plugin.EventListener):
    # Catch-all: fires when any view gains focus, so it covers a new tab
    # (Ctrl+N), a new window (Ctrl+Shift+N), and the launch window once it's
    # interacted with. The guard makes re-firing a no-op.
    def on_activated_async(self, view):
        if _is_blank_untitled(view):
            view.assign_syntax(_SYNTAX)


def plugin_loaded():
    # The launch window's buffer is created BEFORE this plugin loads, so no
    # event ever fires for it. Fix up any already-open blank buffers here.
    for window in sublime.windows():
        view = window.active_view()
        if _is_blank_untitled(view):
            view.assign_syntax(_SYNTAX)
```

## Keybindings

**Preferences > Key Bindings**, right-hand pane — `Packages/User/Default (<OS>).sublime-keymap`:

```json
[
    // Add a line below / above without splitting the current one, as in JetBrains
    { "keys": ["shift+enter"], "command": "run_macro_file", "args": {"file": "res://Packages/Default/Add Line.sublime-macro"} },
    { "keys": ["ctrl+enter"], "command": "run_macro_file", "args": {"file": "res://Packages/Default/Add Line Before.sublime-macro"} },

    // Jump back / forward through cursor history
    { "keys": ["ctrl+alt+left"], "command": "jump_back" },
    { "keys": ["ctrl+alt+right"], "command": "jump_forward" },

    { "keys": ["f12"], "command": "reindent", "args": {"single_line": false} },
    { "keys": ["ctrl+alt+j"], "command": "pretty_json" }
]
```

## Snippets

**Tools > Developer > New Snippet…**, saved into `Packages/User/`. These two expand `===` and `---` plus <kbd>Tab</kbd> into full-width separator rules:

```bash
# Linux path. On macOS: P=~/Library/Application\ Support/Sublime\ Text/Packages/User
P=~/.config/sublime-text/Packages/User

cat > "$P/separator1.sublime-snippet" <<'EOF'
<snippet>
    <content><![CDATA[
============================================================
]]></content>
    <tabTrigger>===</tabTrigger>
</snippet>
EOF

cat > "$P/separator2.sublime-snippet" <<'EOF'
<snippet>
    <content><![CDATA[
------------------------------------------------------------
]]></content>
    <tabTrigger>---</tabTrigger>
</snippet>
EOF
```

## Side bar and tab menus

`sublime-packages/` in this repo holds the customisations: **Close Other Tabs**, **Copy Path** / **Copy Relative Path** / **Copy Filename**, **Duplicate…**, **Open in Browser**, and **Open in Default Application**, plus reordered side-bar and tab-context menus. Its README carries the full reasoning; the three constraints worth knowing here:

- **One built-in tab-context entry can't be un-hidden.** Build 4200 ships `close_others_by_index` captioned "Close Other Tabs" in its own menu file but filters it out at draw time via `is_visible`, even with several tabs open. No menu file can bring it back — you need your own `WindowCommand`, whose `is_visible` defaults to `True`. Close Selected/Unselected Tabs and Close Unmodified Tabs to the Right look filtered the same way but aren't: they're conditional on a multi-tab selection, or on an unmodified tab to the right, so keep them.
- **Menu files can only append.** They're concatenated in load order and `User` loads last, so an entry added in `User/` lands at the bottom of the menu. Positioning it anywhere else means a loose `Packages/Default/<name>.sublime-menu` that shadows the packaged one — which freezes that menu at the current build.
- **A separator with an `id` is a merge anchor.** Another menu file carrying the same `id` has its entries merged into that section rather than appended. That's how **Remove Folder from Project** reaches the side bar — Sublime keeps it in `Side Bar Mount Point.sublime-menu`, anchored at `folder_commands`, and drawn only for top-level project folders. Move the tagged separator in your own file and the entry follows.

"New View into File" needs none of this: it ships as **Split View** (the `clone_file` command).

## Terminus

A terminal in a panel or a tab. Install via **Package Control: Install Package > Terminus** — there's no CLI install.

### Settings

**Preferences > Package Settings > Terminus > Settings**, right-hand pane. Merge into any existing object rather than leaving two root `{}`:

```json
{
    "theme": "user",
    "user_theme_colors": {
        // = Monokai Pro panel bg #403e41 minus 1 -- see below
        "background": "#403e40",
        "foreground": "#c5c8c6",
        "caret": "#c5c8c6",
        "selection": "#5b595c",

        // Dirs (bold blue) and symlinks (bold cyan) -> Monokai Pro teal, so they
        // sit in harmony with the lavender prompt rather than clashing with it.
        "blue": "#78dce8",
        "light_blue": "#78dce8",
        "cyan": "#78dce8",
        "light_cyan": "#78dce8"
        // Rest of the palette: red #ff6188, green #a9dc76, yellow #ffd866, purple #ab9df2
    },

    // A little vertical breathing room, Ghostty-style
    "view_settings": {
        "line_padding_top": 1,
        "line_padding_bottom": 1
    },

    "shell_configs": [
        {
            "name": "Bash",
            // Real interactive bash -> sources ~/.bashrc natively (PS1, direnv,
            // aliases, completion), so no PS1 environment hack is needed.
            "cmd": ["bash", "-i"],
            "enable": true,
            "platforms": ["linux", "osx"]
        }
    ]
}
```

The lavender prompt itself is `PS1` in `~/.bashrc`, not here. Don't copy the generated `Packages/User/Terminus*.hidden-color-scheme` files between machines — they're rebuilt from `user_theme_colors`.

`shell_configs` above covers linux and osx only. On Windows, add a `windows` entry (cmd or powershell) as well, or pasting this replaces the default shells and leaves none.

### Set it up on a new machine

The colours are theme-specific but the procedure ports to any OS. On macOS the palette is **Cmd+Shift+P**.

1. **Ctrl+Shift+P > Package Control: Install Package > Terminus**.
2. Install **Theme - Monokai Pro**, then set `"theme": "Monokai Pro.sublime-theme"` in Preferences — the values above assume its panel background.
3. Paste the settings object above, merging into any existing object. Restart Sublime.
4. **Ctrl+Shift+P > Terminus: Toggle Panel**, and check: teal folders, lavender prompt, no box behind coloured text.
5. Still boxed, because you're on a different UI theme? Re-derive `background` below.

Or hand steps 1–4 to a coding agent:

> Read the Terminus section of `sublime.md` in this repo and apply it on THIS machine:
> (1) verify Terminus is installed via Package Control, else tell me to install it — that's a GUI step;
> (2) write the combined settings object to the OS-correct `Terminus.sublime-settings`, MERGING into any existing object;
> (3) if my UI theme (Preferences `theme`) is not Monokai Pro, STOP and tell me to run the diagnostic and give you `terminal bg`, then set `background` to that value minus 1;
> (4) do NOT copy the generated `*.hidden-color-scheme` files;
> (5) tell me to restart Sublime and verify there are no boxes.

### Why `background` is one hex short of the panel colour

Terminus fills each coloured cell with `add_regions(flags=0)`, a solid fill in the cell's background colour. In **panel** mode the terminal background is painted by the **UI theme** (Monokai Pro `#403e41`), not the colour scheme — so the cell fill doesn't match the panel and you get a box behind every coloured word. The fix is to make them equal, and Terminus sets cell fill to `background + 1`, so `background` = panel bg − 1.

To re-derive on another theme:

1. Start Terminus once: **Ctrl+Shift+P > Terminus: Toggle Panel**.
2. **View > Show Console**. This hides the panel, which is fine — Sublime shows one panel at a time and the session stays alive.
3. Paste this, Enter. It finds the hidden Terminus view and prints both colours:

    ```python
    import sublime
    w = sublime.active_window()
    cands = list(w.views())
    for p in w.panels():
        pv = w.find_output_panel(p[len("output."):] if p.startswith("output.") else p)
        if pv: cands.append(pv)
    v = next((x for x in cands if x.settings().get("terminus_view")), None)
    print("terminal bg:", v.style()["background"])                                   # rendered panel bg, e.g. #403e41
    print("cell fill  :", v.style_for_scope("terminus.blue.default")["background"])  # the box colour
    ```

4. Set `background` to *terminal bg* minus 1 in the last hex pair (`#403e41` → `#403e40`). Re-run steps 2–3: `cell fill` should now equal `terminal bg`. That re-check is the test.

### A dark terminal needs a tab, not the panel

Want a dark terminal rather than the grey panel? Open Terminus in a tab — **Ctrl+Shift+P > Terminus: Open Default Shell in Tab (View)**. A tab takes its background from the **colour scheme**, not the UI theme, so any dark `background` works there with no box.

## Shortcuts

Keys below are Linux and Windows. macOS swaps `Ctrl` for `Cmd` on most of them — but not all: the console stays <kbd>Ctrl+`</kbd>, focus and move-to-pane stay `Ctrl+0` / `Ctrl+Shift+1`, replace-all stays `Ctrl+Alt+Enter`, and select-all-occurrences is `Ctrl+Cmd+G` rather than `Alt+F3`. **Preferences > Key Bindings** shows the real binding for your platform.

**Selection and search**

| Keys | What |
| --- | --- |
| `Ctrl+D` | Select next instance of the current word (`Alt+F3` selects all at once) |
| `Ctrl+I` | Incremental search — repeat `Ctrl+I` / `Ctrl+Shift+I` to step, Enter to finish |
| `Ctrl+Alt+Enter` | Replace all |

**Folding**

| Keys | What |
| --- | --- |
| `Ctrl+K, Ctrl+1` | Fold everything at the top level (try `Ctrl+K, Ctrl+2` if nothing folds) |
| `Ctrl+K, Ctrl+J` | Unfold everything |
| `Alt+Click` | Collapse a side-bar folder and all its children |

**Panes, tabs and focus**

| Keys | What |
| --- | --- |
| `Ctrl+K, Ctrl+↑` / `Ctrl+↓` | New pane / close pane |
| `Ctrl+K, Ctrl+←` / `→` | Move focus between panes |
| `Ctrl+K, Ctrl+Shift+←` / `→` | Move the current tab to the pane beside it |
| `Ctrl+Shift+1` … | Move the current tab to that column |
| `Ctrl+0` / `Ctrl+1` | Focus the side bar / back to the editor |
| `Ctrl+K, Ctrl+B` | Hide the side bar |

The menu bar hides from **View > Hide Menu**, or the palette entry `togglemenu`.

## Open files and folders from the terminal

```bash
subl file.txt              # open in the current window
subl -a /path/to/folder    # add the folder to the current window
subl -n /path/to/folder    # open in a new window
```

### Getting `subl` on PATH

On Linux the vendor package puts `subl` on PATH for you (`/usr/bin/subl`, a wrapper owned by the `sublime-text` package). macOS needs a symlink of its own, alongside the `smerge` one in `mac-os.txt`:

```bash
ln -s '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl' $HOME/.local/bin/subl
```

### Attach to the current window instead of opening a new one

A bare `subl /path/to/folder` always opens a **new window**. `open_files_in_new_window` doesn't change that — at its default `"never"` the setting keeps *files* in the current window but sends every folder to a new one. Only `-a` puts a folder in the window you're already in:

```bash
alias subl='subl -a'    # ~/.zshrc on macOS; ~/.bashrc when using Bash
```

`-n` wins over `-a` when both are present, in either order, so `subl -n <folder>` still opens a new window through that alias.

The alias depends on the setting staying at `"never"`. At `"always"`, `-a` is overridden and every invocation opens a new window:

| `open_files_in_new_window` | `subl <file>` | `subl <folder>` | `subl -a <folder>` |
| --- | --- | --- | --- |
| `"never"` — default on Linux and Windows | current window | new window | current window |
| `"always"` | new window | new window | new window |

macOS defaults to `"finder_only"` instead, in `Preferences (OSX).sublime-settings`.
Verified on macOS with Sublime Text build 4200: with the user setting changed to
`"never"` and this alias loaded from `~/.zshrc`, both `subl <file>` and
`subl <folder>` reused an existing window. The live window count stayed
unchanged, and adding the folder updated that window's title to include it.

Two things that bite when scripting against `subl`: an instance launched with `--detached` never opens its `/tmp/Sublime Text.<hash>.sock` listener, so it can't receive later invocations and each one starts a second process; and `SIGTERM` doesn't write the session file the way quitting from the UI does.

## Windows: add an Explorer context-menu entry

Save as a `.bat` and run it as administrator. Adds **Open with Sublime Text** for both files and folders:

```bat
@echo off
SET stPath=C:\Program Files\Sublime Text\sublime_text.exe

rem for all file types
@reg add "HKEY_CLASSES_ROOT\*\shell\Open with Sublime Text"         /t REG_SZ /v "" /d "Open with Sublime Text"   /f
@reg add "HKEY_CLASSES_ROOT\*\shell\Open with Sublime Text"         /t REG_EXPAND_SZ /v "Icon" /d "%stPath%,0" /f
@reg add "HKEY_CLASSES_ROOT\*\shell\Open with Sublime Text\command" /t REG_SZ /v "" /d "%stPath% \"%%1\"" /f

rem for folders
@reg add "HKEY_CLASSES_ROOT\Folder\shell\Open with Sublime Text"         /t REG_SZ /v "" /d "Open with Sublime Text"   /f
@reg add "HKEY_CLASSES_ROOT\Folder\shell\Open with Sublime Text"         /t REG_EXPAND_SZ /v "Icon" /d "%stPath%,0" /f
@reg add "HKEY_CLASSES_ROOT\Folder\shell\Open with Sublime Text\command" /t REG_SZ /v "" /d "%stPath% \"%%1\"" /f
pause
```

`windows.txt` carries an older copy of this that still points at `Sublime Text 3` — use this one.

## Search and replace with regex

Match several keywords in any order, with positive lookaheads:

```
^(?=.*keyword1)(?=.*keyword2)(?=.*keyword3).*$
```

Capture groups work in Replace as `\1`, `\2`. To strip the double quotes around a string, search `"(.*)"` and replace with `\1`.

## Find the command behind a menu item

Open the console with <kbd>Ctrl+`</kbd> and turn on command logging, then use the menu item and watch what it prints:

```python
sublime.log_commands(True)
```

Handy when writing a `.sublime-menu`, a key binding, or a `.sublime-commands` entry, since all three need the command's internal name.
