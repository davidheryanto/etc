# sublime-packages

Sublime Text customisations that live as **whole files** under `Packages/`,
mirroring the on-disk layout so installing is a straight copy. Unlike
[`vs-code-settings`](../vs-code-settings), these are not fragments to merge —
drop them in as-is.

`Packages/` lives at:

| OS | Path |
|----|------|
| Linux   | `~/.config/sublime-text/Packages` |
| macOS   | `~/Library/Application Support/Sublime Text/Packages` |
| Windows | `%APPDATA%\Sublime Text\Packages` |

Or open it from Sublime: `Preferences > Browse Packages`.

## Install

```sh
P=~/.config/sublime-text/Packages          # adjust per table above
mkdir -p "$P/Default" "$P/User"
cp -r sublime-packages/Default/. "$P/Default/"
cp -r sublime-packages/User/.    "$P/User/"
```

Sublime hot-reloads both; no restart needed.

## Files

| File | What it does |
|------|--------------|
| `User/close_other_tabs.py` | `close_other_tabs` window command — closes every tab in a group except the clicked one. Delegates to the built-in `close_by_index` so unsaved tabs still prompt to save. |
| `Default/Tab Context.sublime-menu` | Tab right-click menu, with **Close Other Tabs** placed directly under **Close Tab**, and **Copy Path** / **Copy Relative Path** / **Copy Filename** in their own section — the same commands and captions as the side bar. |
| `User/side_bar_extras.py` | `copy_absolute_path`, `copy_relative_path`, `copy_filename`, `duplicate_path`, `open_in_browser_path` — the side bar and tab-context gaps in build 4200. |
| `Default/Side Bar.sublime-menu` | Side bar right-click menu, with **Duplicate…** under **Rename…**, **Open in Browser** above **Open Containing Folder…** (HTML files only), and **Copy Relative Path** / **Copy Filename** under **Copy Path**. |
| `User/Default.sublime-commands` | Command palette entries for all six. The palette lists only commands declared in a `.sublime-commands` file, so without this they'd be context-menu-only. Invoked from the palette they act on the active sheet. |

## Tabs are sheets, not views

`close_other_tabs` indexes `sheets_in_group()`, not `views_in_group()`. A tab
is a sheet, and image or HTML sheets have no view — on build 4200, opening a
single image gives 2 sheets against 1 view. Using view indices for a tab
position is not merely off-by-one: with tabs `[text, image, text2]`,
right-clicking the image resolves `views[1]` to `text2`, so the command would
keep `text2` and close the very tab you clicked.

## Copy commands in the tab context menu

The three copy commands also appear when right-clicking a tab. The tab menu
identifies the clicked tab as a `group`/`index` pair (Sublime fills in the
`-1` placeholders), so `resolve()` accepts those alongside `paths`: side bar
paths win, then a tab position, then the active sheet as the palette
fallback. Both of the latter deal in sheets, not views — the same
sheet-vs-view distinction described below. On a tab with no file (an unsaved
buffer) the entries hide themselves.

Absolute path needs its own command, `copy_absolute_path`: the built-in
`copy_path` (a `WindowCommand` in build 4200) takes no arguments and always
resolves `window.active_sheet()`, so it copies the wrong path when the
right-clicked tab isn't the focused one. It keeps a distinct name because a
`User` plugin registering `copy_path` would override the built-in command
everywhere it's used, including the view context menu's "Copy File Path".

## Open in Browser from the side bar

The built-in `open_in_browser` is a `TextCommand`: it acts on the active
view, so it can only live in the view's context menu — the side bar hands
selected paths to `WindowCommand`s. `open_in_browser_path` is that
side-bar counterpart, shown only when every selected path is an existing
`.html`/`.htm` *file* — the extension filter matches the built-in's
`is_visible`, plus an `isfile` check so a directory named `docs.html` or an
already-deleted file doesn't show an entry that would silently do nothing.
One deliberate difference: the URL is built with `Path.as_uri()`, which
percent-encodes spaces and `#`, where the built-in's bare `"file://" + path`
concatenation hands the browser a broken URL.

## Replacing SideBarTools

These three commands replace [SideBarTools](https://github.com/braver/SideBarTools),
which is the usual answer here. It's a fine package; the reasons not to use it
are specific:

- **It can't be vendored.** A package installed through Package Control has to
  be reinstalled per machine, which defeats clone-and-copy setup. A plugin in
  this repo doesn't.
- **Ordering needs the `Default/` override regardless.** Its entries append at
  the bottom of the menu like any other package's. Using its commands would
  *also* require shadowing `Packages/SideBarTools/Side Bar.sublime-menu` with
  `[]` to suppress that block — a second frozen file for no gain.
- **Only 3 of its 10 commands were wanted.** Move…, New…, Edit, Compare, Copy
  Absolute Path and Copy Relative POSIX Path were the clutter being removed.

Two bugs in its implementation are fixed here rather than ported:

- **Relative path picks the wrong root.** It tests `path.startswith(root)`,
  which matches a path under `/foo/barbaz` against the project root `/foo/bar`
  and returns `../barbaz/f.txt`. It also takes the *first* matching root, not
  the deepest, so nested project folders give a needlessly long path.
  `relative_to_project` uses `os.path.commonpath` (component-wise) and keeps
  the deepest match.
- **Duplicate can silently clobber.** `shutil.copy2` overwrites an existing
  destination without a word. The copy opens the destination `"xb"` instead,
  so creation is exclusive and a file that appeared after the pre-check raises
  rather than being lost.

A failed duplicate also cleans up after itself. Both the file and directory
branches fail outright when the destination already exists, so anything
present after a *different* error was created by that call — a truncated file
or a half-copied tree — and is removed. Otherwise it would survive looking
complete and make the next attempt report "already exists". `FileExistsError`
is caught separately and never triggers cleanup, since that destination
belongs to someone else.

The post-copy UI work — refreshing the folder list and opening the new file —
is marshalled back to the main thread with `sublime.set_timeout`. Status
messages on the error path are still emitted from the worker; Sublime
documents its API as thread-safe, so that is fine.

If SideBarTools is still installed, remove it via `Package Control: Remove
Package` — otherwise its entries appear a second time at the bottom of the
menu. Delete any leftover `Packages/SideBarTools/` directory afterwards.

## Why a plugin at all — the built-in is hidden

Build 4200's own `Tab Context.sublime-menu` *does* contain
`close_others_by_index` captioned "Close Other Tabs", but it never renders.
Sublime filters tab-context items at draw time via `is_visible`, and several
built-ins are suppressed: **Close Other Tabs**, **Close Selected Tabs**,
**Close Unselected Tabs**, **Close Unmodified Tabs to the Right**. The same
filtering hides SideBarTools' "Copy Relative POSIX Path" on Linux, which is
how you can tell it's render-time filtering rather than a broken menu file.

Verified on the live instance via `sublime.find_resources()` /
`sublime.load_resource()`: the entry is loaded and its command is registered
— it just isn't drawn. So it cannot be un-hidden from a menu file.

A custom `WindowCommand` has `is_visible()` defaulting to `True`, so its entry
always renders. `close_other_tabs` deliberately omits `is_enabled` — it stays
visible with a single tab open, where it is simply a no-op.

## Why the Default/ override

Menu files from every package are **concatenated in load order**, and `User`
loads last — so an entry added in `User/Tab Context.sublime-menu` can only land
at the very bottom of the menu. There is no insert-before directive.

Placing the entry mid-menu therefore requires a loose
`Default/Tab Context.sublime-menu`, which shadows the packaged one wholesale.

**Tradeoff:** that copy is frozen at build 4200. If a later build adds entries
to this menu, they won't appear until you re-sync. Rare in practice, and the
file's header comment carries the `unzip` command to diff against the shipped
version. If you'd rather not carry that, drop the `Default/` file and put the
entry in `User/Tab Context.sublime-menu` instead — it works identically, just
pinned to the bottom of the menu.
