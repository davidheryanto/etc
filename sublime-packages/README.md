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
| `Default/Tab Context.sublime-menu` | Tab right-click menu, with **Close Other Tabs** placed directly under **Close Tab**. |

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
