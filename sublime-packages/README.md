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
mkdir -p "$P/Default" "$P/User" "$P/Terminus"
cp -r sublime-packages/Default/.  "$P/Default/"
cp -r sublime-packages/User/.     "$P/User/"
cp -r sublime-packages/Terminus/. "$P/Terminus/"
```

**Install Terminus first**, via **Package Control: Install Package > Terminus**
— `sublime.md` covers it with the rest of the packages. The side bar menu
declares **Open Terminus here…** unconditionally, so until the package is
present there is no `terminus_open` command behind that entry. The
`Terminus/` directory copied above is an empty menu override, not the package.

Sublime hot-reloads these files; no restart needed.

## Files

| File | What it does |
|------|--------------|
| `User/close_other_tabs.py` | `close_other_tabs` window command — closes every tab in a group except the clicked one. Delegates to the built-in `close_by_index` so unsaved tabs still prompt to save. |
| `Default/Tab Context.sublime-menu` | Tab right-click menu, ordered by click frequency like the side bar, plus **Close Other Tabs** directly under **Close Tab** and the **Copy Path** / **Copy Relative Path** / **Copy Filename** section — the same actions and captions as the side bar, though **Copy Path** needs a different command here — see [Commands shared with the tab context menu](#commands-shared-with-the-tab-context-menu). Every shipped entry is kept. See [Menu order](#menu-order). |
| `User/side_bar_extras.py` | `copy_absolute_path`, `copy_relative_path`, `copy_filename`, `duplicate_path`, `open_in_browser_path`, `open_externally_path` — the side bar and tab-context gaps in build 4200 — plus `remove_other_folders_from_project`, which is side bar and palette only. |
| `Default/Side Bar.sublime-menu` | Side bar right-click menu, reordered into separator-fenced groups by click frequency, and three Sublime Merge entries lighter than the shipped one. See [Menu order](#menu-order). |
| `Default/Side Bar Mount Point.sublime-menu` | The menu Sublime merges into the side bar for **top-level project folders only**: the two shipped lines verbatim, plus **Remove Other Folders from Project** below them. Overridden purely to add that third entry, which needs exactly the same scoping. See [Remove Other Folders from Project](#remove-other-folders-from-project). |
| `Terminus/Side Bar.sublime-menu` | Empty, to suppress Terminus's own side bar entry — its position is Sublime's to choose, so the entry is declared in `Default/Side Bar.sublime-menu` instead. Only that one file is shadowed; Terminus otherwise loads from its package normally. |
| `User/Default.sublime-commands` | Command palette entries for all eight. The palette lists only commands declared in a `.sublime-commands` file, so without this they'd be context-menu-only. Invoked from the palette they act on the active sheet. |

## Menu order

The shipped order has no scheme to preserve. It looks like it separates file
commands from folder commands, but `New File` and `New Folder…` are both
`dirs` commands with ten other entries between them — the same gap that
separates `Rename…` from `Delete Folder`. It is just where entries
accumulated. So the menu here is sorted by how often an entry is clicked,
under two rules:

- **Frequency down the menu.** Entries hide themselves by selection type, so
  one shared order yields a short, well-sorted menu for each of the four
  things you can right-click.
- **Nothing irreversible in the top group**, and never flush against a
  frequently-clicked row — always fenced by separators.

The groups, top to bottom:

1. **Openers** — **Open in Browser** (HTML/Markdown/Notebook/SVG — `.md` and
   `.ipynb` render via `chrome-extensions/local-viewer/`) and **Open in Default
   Application** (any file, those included, so on a renderable one both entries
   draw).
   Browser goes first so that whichever entry is right for what you clicked
   lands on row 1: on a renderable file that's the browser, and everywhere else
   the OS opener is alone at the top because Browser withholds itself. Order
   matters here because on a `.md` the OS opener is the useless one —
   LaunchServices hands `.md` back to Sublime, which is the bug
   [Open in Browser from the side bar](#open-in-browser-from-the-side-bar)
   exists to route around. Neither draws on a folder, so promoting them above
   copy leaves the folder menus untouched.
2. **Copy** — the most-used group here, and the only one that draws for every
   selection. Row 1 on folders, rows 2–3 on files. Slot one on files costs it
   a fixed position, which is the one real trade in this ordering.
3. **Project** — **Remove Folder from Project** and **Remove Other Folders
   from Project**: frequent, and the only entries here that leave the files
   themselves alone. Neither is declared in this menu file; both merge in
   from `Default/Side Bar Mount Point.sublime-menu`, which draws only on
   top-level folders. See [Remove Folder from Project](#remove-folder-from-project)
   below.
4. **Create/modify** — New File, New Folder…, Rename…, Duplicate…, reunited.
5. **Delete** — Delete File and Delete Folder, alone in a fenced group. Only
   one ever draws. It sits above the tools rather than last because
   `delete_folder` passes `"prompt": true`, so a misclick costs a dialog.
   `delete_file` passes `"prompt": false` and goes straight to trash — the
   quieter of the two, which is why the group stays fenced and mid-menu
   rather than climbing further.
6. **Hand-offs** — Open Containing Folder…, Open Folder…, Reveal Link Source,
   Find in Folder…. The other half of "open": these pass a path to something
   else instead of showing you the file.
7. **Tools** — Open Terminus here…, Open Git Repository…. Rarely reached from
   here, because a shell and Sublime Merge are usually already open.

**File History…**, **Folder History…** and **Blame File…** are dropped
outright. Open Git Repository… reaches all three from inside Sublime Merge,
two clicks later. That is three rows off every file menu; on a folder only
Folder History… drew, since the other two take `files`.

### The tab menu runs the same rule, not the same order

Closing leads there because it is the most common thing done to a tab, where
the side bar leads with openers because closing is not something done to a
folder. Under that, the two menus agree:

1. **Close Tab**, **Close Other Tabs**.
2. **Openers** — Open in Browser, Open in Default Application.
3. **Copy** — Path, Relative Path, Filename.
4. **The rest of the close family** — Close Selected Tabs, Close Unselected
   Tabs, Close Tabs to the Right, Close Unmodified Tabs, Close Unmodified Tabs
   to the Right, Close Tabs With Deleted Files. Below the entries reached more
   often, which splits the family; the split is by frequency, which is the
   rule, unlike the arbitrary one in the shipped side bar menu.
5. **Split View**, then **New File** / **Open File**.

The five entries shared by both menus keep the same relative order in each —
openers above copy. Before this, they were inverted between the two, which is
the kind of thing muscle memory notices and nothing documents.

Nothing is dropped from this menu. Four of the six close commands never appear
on an ordinary right-click and look suppressed, but they are only conditional.
Verified by right-clicking a tab on build 4200 — only these four drew:

```
Close Tab · Close Other Tabs · Close Tabs to the Right · Close Tabs With Deleted Files
```

**Close Selected Tabs** and **Close Unselected Tabs** want several tabs
selected (ctrl+click). **Close Unmodified Tabs to the Right** wants an
unmodified tab to the right of the one clicked. **Close Unmodified Tabs** also
withheld itself, and what it wants is not established — plausibly a modified
tab somewhere in the window, since with nothing dirty it would just be Close
All under another name. Dropping any of them removes the action in exactly the
state where it is the one you want, which is the mistake this file made once
already.

## Remove Folder from Project

This entry is not in `Side Bar.sublime-menu` at all. Sublime keeps it in a
second file, merged in only for top-level project folders:

```
unzip -p "<install>/Packages/Default.sublime-package" "Side Bar Mount Point.sublime-menu"
[
	{ "caption": "-", "id": "folder_commands" },
	{ "caption": "Remove Folder from Project", "command": "remove_folder", "args": { "dirs": []} }
]
```

That leading separator is an anchor: Sublime merges the entry into whichever
section carries the matching `id`. The id is a plain string in *our*
`Side Bar.sublime-menu`, so moving the separator tagged `folder_commands` up
to slot 3 carries the entry with it, and Sublime keeps scoping the entry to
top-level folders for free.

**A section runs from its `id` to the next `id`, and a plain separator does
not close it.** That is why the separator immediately below carries an id of
its own, `create_commands`, whose only job is to end the empty section above
it. Without it, `folder_commands` would run all the way to `repo_commands`
and the merged entry would be appended after **Find in Folder…** — the
bottom of the menu, which is where it started.

That rule is also what the shipped layout demonstrates: Terminus's entry
carries no id, and it drew after **Delete File**, at the end of everything
preceding the first id'd separator — not after the first plain one.

Declaring `remove_folder` directly in `Side Bar.sublime-menu` instead would
show it on every folder, including sub-folders where it does nothing. That is
what the separate file exists to express.

**Consequence for other packages.** An `id`-anchored separator ends the
region where unanchored entries from other packages land, so a newly
installed package's side bar entry will appear directly under the copy group
rather than at the bottom of the menu. That is how Terminus's entry behaved
before it was declared explicitly here — see `Terminus/Side Bar.sublime-menu`
for the fix, which generalises to any package.

### Remove Other Folders from Project

`remove_folder` removes the folders you clicked, a side bar multi-selection
included, but build 4200 has no inverse — so keeping one folder out of a dozen
means selecting the other eleven first, and getting the selection wrong is
what makes it tedious rather than the click count.
`remove_other_folders_from_project` is the side bar's answer to **Close Other
Tabs**: name what you're keeping — one folder, or several — and the rest go. It delegates to `remove_folder`, once per
folder, rather than rewriting `project_data()`: a folder's `path` there may be
relative to the `.sublime-project` file, and the built-in already handles that.

**This entry is why `Side Bar Mount Point.sublime-menu` is overridden** rather
than left to the merge, and the reason is the same one the section above
describes: that file *is* how Sublime says "top-level project folders only".
Declared in `Side Bar.sublime-menu` the entry would draw on file right-clicks
too, where `dirs` arrives empty and the command falls back to the active
sheet's root — an entry offering to prune the window, in a menu about the file
you clicked. It would also land *above* the merged **Remove Folder from
Project**, since merged entries are appended to the section. So the override
restates the shipped two lines verbatim and adds a third, at the cost of
freezing those two lines at build 4200; the re-sync command is in the file's
header.

Selected and clicked folders are matched through the same normalisation on
both sides — `normpath`, plus case folding on Windows and macOS — so a
trailing separator or a difference in case still resolves. The rule is
all-or-nothing: unless *every* selected path is a top-level folder the whole
selection is refused, which is what keeps a mixed selection of one root and a
sub-folder of another from quietly removing that other root. A mismatch keeps
nothing, and both `is_visible` and `run` refuse an empty keep, so the failure
mode is the entry not appearing rather than an offer to remove every folder in
the window. `run()` reports the count
`window.folders()` actually dropped, not the number of removals it attempted —
`remove_folder`'s behaviour is the one link in the chain not verified here.

From the command palette no folder is clicked, so it keeps the deepest
top-level folder holding the active sheet's file, falling back to a comparison
of canonical paths when the root is a symlink the file was opened through.
With an unsaved buffer, or a file under no root at all, there is nothing to
keep and the entry hides itself. That path alone asks for confirmation: a side bar click is its own
confirmation, with the folder to keep under the pointer, but from the palette
nothing on screen names the target, and removing a folder has no undo — the
paths are gone from the window and have to be found again by hand.

Not quite "touches no disk", either: the files are untouched, but on a window
backed by a `.sublime-project` the folder list lives in that file, so removing
folders rewrites it.

Verified outside Sublime against stubbed `sublime` modules — click,
multi-selection, trailing separator, sub-folder, single-folder window, palette
fallback, palette cancel, symlinked root, filesystem root, and a
`remove_folder` that does nothing. Not yet exercised by clicking the entry in
a running Sublime.

## Tabs are sheets, not views

`close_other_tabs` indexes `sheets_in_group()`, not `views_in_group()`. A tab
is a sheet, and image or HTML sheets have no view — on build 4200, opening a
single image gives 2 sheets against 1 view. Using view indices for a tab
position is not merely off-by-one: with tabs `[text, image, text2]`,
right-clicking the image resolves `views[1]` to `text2`, so the command would
keep `text2` and close the very tab you clicked.

## Commands shared with the tab context menu

The three copy commands and both open commands also appear when
right-clicking a tab. The tab menu identifies the clicked tab as a
`group`/`index` pair (Sublime fills in the `-1` placeholders), so `resolve()`
accepts those alongside `paths`: side bar paths win, then a tab position,
then the active sheet as the palette fallback. Both of the latter deal in
sheets, not views — the same sheet-vs-view distinction described below. On a
tab with no file (an unsaved buffer) the entries hide themselves.

A command placed in the tab menu **must declare `group` and `index`**, even
though the entry looks like it would work without them. Sublime calls
`is_visible(**args)` and, on `TypeError`, retries with no arguments at all
(`sublime_plugin.py`, `is_visible_`) — so a command taking only `paths` does
not fail visibly, it silently resolves the *active* tab rather than the
clicked one. `run_` is stricter and re-raises, so the entry then draws
correctly and does nothing but log a `TypeError`. `duplicate_path` is the one
command here that still takes `paths` alone — it is side-bar only by design,
since a tab is a poor place to reshape a path.

Absolute path needs its own command, `copy_absolute_path`: the built-in
`copy_path` (a `WindowCommand` in build 4200) takes no arguments and always
resolves `window.active_sheet()`, so it copies the wrong path when the
right-clicked tab isn't the focused one. It keeps a distinct name because a
`User` plugin registering `copy_path` would override the built-in command
everywhere it's used, including the view context menu's "Copy File Path".

## Open in Browser from the side bar

The built-in `open_in_browser` is a `TextCommand`: it acts on the active
view, so it can only live in the view's context menu — the side bar and the
tab menu hand selected paths (or a tab position) to `WindowCommand`s.
`open_in_browser_path` is that counterpart, shown only when every selected
path is an existing *file* with a renderable extension, plus an `isfile`
check so a directory named `docs.html` or an already-deleted file doesn't
show an entry that would silently do nothing. One deliberate difference: the
URL is built with `Path.as_uri()`, which percent-encodes spaces and `#`,
where the built-in's bare `"file://" + path` concatenation hands the browser
a broken URL.

The extension list is wider than the built-in's, which covers `.html` and
`.htm` only. `EXTENSIONS` adds `.md`/`.markdown`, `.ipynb` and `.svg` by the
same test each time — the browser is the only thing that shows the file the way
it is meant to look, and nothing else in either menu does. `.pdf` fails that
test: **Open in Default Application** already hands it to whatever the machine
uses to read PDFs. So do `.csv` and `.xml`, which a browser renders no better
than the editor does.

`.ipynb` is the clearest case of the rule, not an exception to it. Sublime
gives it the JSON syntax — correct, and useless: what you want to read is the
prose, the plots and the dataframes, and all of them are `\n`-joined string
arrays and base64 blobs in that view. `.json` itself is excluded for the
opposite reason — a browser shows it no better than the editor — so the two
sit either side of the line despite being the same file format. What separates
them is that `chrome-extensions/local-viewer/` renders one of them.

### Why it resolves the browser itself

Handing a `file:` URL to the OS "open this URL" call does **not** open a
browser. Every platform routes a `file:` URL by *document type*, not by
scheme, so the file goes to whatever app owns that extension.

That is invisible for `.html` — the owner is usually the browser anyway —
and breaks outright for `.md`, whose owner on a developer's machine is
typically the editor. On macOS the symptom is the entry appearing to do
nothing at all: `webbrowser` shells out to `osascript -e 'open location …'`,
LaunchServices matches `.md` to Sublime Text, and the file opens in the
window you clicked from — where it was already open. `osascript` exits 0 and
`webbrowser.open_new_tab` duly returns `True`, so nothing surfaces an error.
Verified on build 4200 / macOS 15: a `file://…/probe.md` opened via
`open location` appeared in `sublime.windows()` sheets, and a page whose only
job was to fetch a local URL never fetched it.

So `browser_argv()` resolves the default browser explicitly and passes it the
path as a plain argv entry:

| Platform | Default browser from | Launched with |
|---|---|---|
| macOS   | `com.apple.launchservices.secure.plist`, `http` scheme handler (falls back to `com.apple.Safari`) | `open -b <bundle id> <path>` |
| Windows | `…\UrlAssociations\https\UserChoice` → `ProgId` → its `shell\open\command` | that whole command line, with `%1` replaced by the path |
| Linux   | `webbrowser`, via `xdg-settings get default-web-browser` | `webbrowser` — see the caveat below |

Those two rows behave differently: `open` is a launcher that exits once the
browser has the file, so its exit status is meaningful; a browser executable
is the process itself and would never exit. Rather than classify them — an
override can be either, and guessing wrong reintroduces exactly this bug —
the launch waits 5 seconds and reads *still running* as success. A launcher
that is going to fail fails well inside that window; overshooting it only
ever errs toward success. Surviving the wait also means the process is the
browser, which is reaped on its own thread — Sublime hosts run for days, and
dropping the reference would leave a zombie until some unrelated subprocess
call swept it up.

A non-zero exit reports in the status bar and stops there. It deliberately
does **not** fall back to `webbrowser` on macOS or Windows: that is the
mechanism this command exists to avoid, so the "fallback" would hand the
`file:` URL back to the OS, reopen the `.md` in Sublime and report success —
the original bug, restored on the error path. Saying so beats silently doing
the wrong thing. All of it runs on a worker thread, since `open` blocks until
the app is up — seconds on a cold start.

The Windows row keeps the registered command's *arguments*, not just its
executable. Those arguments are the invocation Windows guarantees works:
Chrome's `--single-argument %1` is what makes an unquoted path with spaces
arrive intact, and a wrapper registered as `launcher.exe --open-url %1` can
exit 0 without opening anything once its flags are dropped — a silent no-op,
which is the entire bug class here. So `%1` is treated as a placeholder and
substituted; a command line without one gets the path appended, which is what
the macOS row and most overrides do.

A resolution failure is not the same as "use `webbrowser`". Only Linux takes
the `webbrowser` branch; a Windows lookup that comes back empty reports
instead, because `webbrowser` there is `os.startfile` of the `file:` URL —
the document-type routing all of this exists to avoid.

**Windows is written from the documented registry layout and has not been
run.** The other two are verified.

### The Linux caveat

Linux keeps `webbrowser` because it usually does the right thing, not because
it is guaranteed to. Python 3.8 registers `xdg-open` *first* in its search
order, ahead of every real browser — but it also runs `xdg-settings get
default-web-browser` and promotes that browser to the front, which is what
makes a normal desktop land on a real browser binary rather than on
`xdg-open`'s type routing. (Verified by reading `webbrowser.pyc` out of
Sublime's bundled `python3.8.zip`: `register_X_browsers` registers `xdg-open`
before `firefox`/`google-chrome`, and `_os_preferred_browser` reorders.)

Where `xdg-settings` is missing or fails — a bare window manager, no
`xdg-utils` — the promotion never happens, `xdg-open` stays first, and a `.md`
can route back to Sublime exactly as it did on macOS. Both escape hatches
work there: `BROWSER` in the environment, which `webbrowser` honours ahead of
everything, or `open_in_browser_command`, which is checked before any
platform branch.

### Pinning a browser

`.md` only renders through `chrome-extensions/local-viewer/`, which is a Chrome
extension — so on a machine whose default browser is Safari or Firefox, a
`.md` opened this way is raw source or a download. Set
`open_in_browser_command` in `Preferences.sublime-settings` to override the
detected browser with an argv list:

```json
{ "open_in_browser_command": ["open", "-b", "com.google.chrome"] }
```

The path is appended to that list. A launcher and a browser executable are
both valid here — the wait-and-see launch above handles either, so a stale
bundle id reports in the status bar rather than dying quietly.

Also per-machine, and easy to forget: the extension needs **Load unpacked**
*and* **Allow access to file URLs** on its `chrome://extensions` card. Without
the second toggle the content script never runs on `file:///`, and a `.md`
opens as the plain text Chrome wraps in a `<pre>` — which looks a lot like
the extension not being installed at all.

## Open in Default Application

Build 4200 cannot hand a file to the OS: nothing in the shipped Default
package or the binary launches a file externally, and there is no
open-externally setting (verified by extracting `Default.sublime-package`
and searching the binary's strings). A PDF or image double-clicked in the
side bar therefore only ever opens as raw bytes in a tab.

`open_externally_path` fills that gap with the platform opener — `xdg-open`
on Linux, `open` on macOS, `os.startfile` on Windows — spawned detached
(`start_new_session`, POSIX-only: `subprocess` rejects it on Windows, which
is why the shared `DETACHED` kwargs omit it there) so the viewer outlives
Sublime, with its output discarded. Routing by document type is the intent
here, unlike **Open in Browser** — "the way the OS would open it" is the
whole point of the entry. It is deliberately **not** extension-filtered: "open this the way
the OS would" means something for every file, and an allowlist rots as new
types come up. It shows for files only — on a directory it would just
duplicate **Open Containing Folder…** — and hides when the selection no
longer exists on disk, like `open_in_browser_path`. For an `.html` file both
entries appear; they mean different things (browser vs. whatever the OS
associates). The `_path` suffix keeps it from ever shadowing a future
built-in named `open_externally`, the same reasoning as `copy_absolute_path`.

## Other platform notes

- **Sublime rewrites some built-in captions per platform.** The side bar
  entry declared here as **Open Containing Folder…** renders as **Reveal in
  Finder** on macOS — the shipped menu file carries the same caption the
  override does, so this is a draw-time substitution on `open_containing_folder`,
  not menu drift. Nothing to sync.
- **`copy_relative_path` returns native separators**, so the same file gives
  `docs\api.md` on Windows and `docs/api.md` elsewhere. Deliberate — it
  matches `copy_path` — but it is why SideBarTools shipped a separate "Copy
  Relative POSIX Path".
- **`commonpath` is case-sensitive**, while macOS and Windows filesystems
  usually are not. A project root and a path that differ only in case fail to
  match and fall back to the bare filename. Sublime hands out both from the
  same source, so this needs an unusual setup to hit.
- **Plugins load under Python 3.8** on build 4200 with no `.python-version`
  file, so one `User` plugin importing another needs `from User import …`.
  Nothing here does; worth knowing before adding one.

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
Sublime filters tab-context items at draw time via `is_visible`. The same
filtering hides SideBarTools' "Copy Relative POSIX Path" on Linux, which is
how you can tell it's render-time filtering rather than a broken menu file.

Three other close entries — **Close Selected Tabs**, **Close Unselected
Tabs**, **Close Unmodified Tabs to the Right** — are also missing from an
ordinary right-click, and it is tempting to read them as suppressed the same
way. They are not: each one is conditional on a state a single-tab right-click
doesn't have — a multi-tab selection for the first two, an unmodified tab to
the right for the third. `close_others_by_index` is the only one hidden where
it *would* be meaningful, which is what makes it the special case.

Verified on the live instance via `sublime.find_resources()` /
`sublime.load_resource()`: the entry is loaded and its command is registered
— it just isn't drawn. So it cannot be un-hidden from a menu file.

`close_others_by_index` stays in the file as a comment, since
`close_other_tabs` exists to replace it and the pair documents why.

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
