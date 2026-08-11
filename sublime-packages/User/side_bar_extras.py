"""Side bar entries Sublime lacks: relative path, filename, duplicate,
open in browser, open in default application.

Build 4200 ships only "Copy Path" (absolute, single selection). These
commands fill the gaps. They also appear in the command palette, where no
paths are passed and the active sheet's file is used instead, and the copy
commands in the tab context menu, where the clicked tab arrives as a
group/index pair.

Positioning lives in Default/Side Bar.sublime-menu -- menu files concatenate
in load order with User last, so entries added from User/ can only land at
the bottom of the menu.
"""

import os
import plistlib
import shlex
import shutil
import subprocess
import threading
import webbrowser
from functools import partial
from pathlib import Path

import sublime
import sublime_plugin

# Spawned processes must outlive Sublime, and xdg-open's chatter has no
# business in the console. start_new_session is POSIX-only -- subprocess
# rejects it outright on Windows.
DETACHED = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
if sublime.platform() != "windows":
    DETACHED["start_new_session"] = True


class SideBarExtraCommand(sublime_plugin.WindowCommand):
    """Shared path resolution and clipboard reporting."""

    def resolve(self, paths, group=-1, index=-1):
        # The side bar passes the selected paths. The tab context menu passes
        # the clicked tab's group and index (Sublime fills in the -1
        # placeholders from the menu file). The command palette passes
        # nothing, so fall back to the active sheet's file.
        if paths:
            return [path for path in paths if path]
        if group >= 0 and index >= 0:
            # Sheets, not views: image and HTML tabs have no view, so view
            # indices point at the wrong tab (see close_other_tabs.py).
            sheets = self.window.sheets_in_group(group)
            name = sheets[index].file_name() if index < len(sheets) else None
            return [name] if name else []
        # active_sheet, not active_view, for the same reason: a focused image
        # sheet has no view but still has a file to copy.
        sheet = self.window.active_sheet()
        name = sheet.file_name() if sheet else None
        return [name] if name else []

    def is_visible(self, paths=[], group=-1, index=-1):
        return bool(self.resolve(paths, group, index))

    def to_clipboard(self, values):
        sublime.set_clipboard("\n".join(values))
        if len(values) == 1:
            self.window.status_message('Copied "%s"' % values[0])
        else:
            self.window.status_message("Copied %d paths" % len(values))


class CopyAbsolutePathCommand(SideBarExtraCommand):
    """Tab-context counterpart of the built-in copy_path, which takes no
    arguments and always resolves window.active_sheet() -- so it copies the
    wrong path when the right-clicked tab isn't the focused one. Named
    copy_absolute_path because registering copy_path from User would
    override the built-in everywhere, including the view context menu."""

    def run(self, paths=[], group=-1, index=-1):
        self.to_clipboard(self.resolve(paths, group, index))


class CopyFilenameCommand(SideBarExtraCommand):
    def run(self, paths=[], group=-1, index=-1):
        # rstrip the separator so a trailing slash on a folder doesn't yield ""
        names = [
            os.path.basename(path.rstrip(os.sep))
            for path in self.resolve(paths, group, index)
        ]
        self.to_clipboard(names)


class CopyRelativePathCommand(SideBarExtraCommand):
    def run(self, paths=[], group=-1, index=-1):
        roots = self.window.folders()
        self.to_clipboard(
            [
                self.relative_to_project(path, roots)
                for path in self.resolve(paths, group, index)
            ]
        )

    @staticmethod
    def relative_to_project(path, roots):
        # Pick the DEEPEST project folder containing the path, so nested roots
        # give the shortest sensible result. commonpath compares whole path
        # components, unlike startswith, which matches /foo/bar against a
        # /foo/barbaz root and produces nonsense.
        best = None
        for root in roots:
            try:
                if os.path.commonpath([root, path]) != root:
                    continue
            except ValueError:
                continue  # different drives on Windows, or a relative path
            if best is None or len(root) > len(best):
                best = root
        return os.path.relpath(path, best) if best else os.path.basename(path)


def macos_default_browser():
    """Bundle id of the app registered for http -- i.e. the default browser.

    LaunchServices keeps the choice in this plist and exposes no CLI for it.
    Safari is the fallback because a Mac whose default was never changed has
    no LSHandlers entry at all: the default is implicit.
    """
    plist = os.path.expanduser(
        "~/Library/Preferences/com.apple.LaunchServices"
        "/com.apple.launchservices.secure.plist"
    )
    try:
        with open(plist, "rb") as handle:
            handlers = plistlib.load(handle).get("LSHandlers", [])
    except (OSError, ValueError):
        handlers = []
    for handler in handlers:
        if handler.get("LSHandlerURLScheme") == "http":
            # RoleAll is what the Settings pane writes; RoleViewer covers an
            # app registered for viewing only.
            bundle = handler.get("LSHandlerRoleAll") or handler.get(
                "LSHandlerRoleViewer"
            )
            if bundle:
                return bundle
    return "com.apple.Safari"


def windows_default_browser():
    """Path to the default browser's executable, per the registry.

    UserChoice holds the ProgId picked for https, and that ProgId's shell open
    command is the browser's command line. UNVERIFIED: written from the
    documented registry layout, with no Windows machine to test on.
    """
    import winreg  # Windows-only, so import it inside the Windows branch.

    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\Shell\Associations"
            r"\UrlAssociations\https\UserChoice",
        ) as handle:
            prog_id = winreg.QueryValueEx(handle, "ProgId")[0]
        with winreg.OpenKey(
            winreg.HKEY_CLASSES_ROOT, prog_id + r"\shell\open\command"
        ) as handle:
            command = winreg.QueryValueEx(handle, "")[0]
    except OSError:
        return None
    # posix=False leaves backslashes alone but keeps the quotes inside the
    # token, hence the strip. Only the executable is wanted: the rest is
    # placeholder plumbing for a URL string -- Chrome's "--single-argument %1",
    # Firefox's "-osint -url %1" -- and none of it applies when the path goes
    # in as a real argv entry.
    try:
        tokens = shlex.split(command, posix=False)
    except ValueError:  # unbalanced quoting in someone else's registry value
        return None
    return tokens[0].strip('"') if tokens else None


def browser_launcher():
    """(argv, is_launcher) for opening a local file in the default browser.

    argv is None when no browser could be resolved, leaving the caller to fall
    back to webbrowser. is_launcher marks argv as a helper that exits as soon
    as the browser has the file, so it can be waited on and its exit status
    believed; False means argv *is* the browser, which must be spawned
    detached and never waited for.
    """
    # An explicit override wins everywhere -- one setting to pin a browser on
    # a machine whose OS default is not what you want to render Markdown in,
    # e.g. ["open", "-b", "com.google.chrome"] or ["/usr/bin/firefox"].
    override = sublime.load_settings("Preferences.sublime-settings").get(
        "open_in_browser_command"
    )
    if override:
        return list(override), False

    platform = sublime.platform()
    if platform == "osx":
        # `open -b` hands the file to a named app. Without -b, LaunchServices
        # picks the app by document type -- the whole bug this avoids.
        return ["open", "-b", macos_default_browser()], True
    if platform == "windows":
        executable = windows_default_browser()
        return ([executable], False) if executable else (None, False)
    # Linux: webbrowser resolves a real browser binary from BROWSER or its own
    # search, so it already sidesteps the type routing that xdg-open would do.
    return None, False


class OpenInBrowserPathCommand(SideBarExtraCommand):
    """Side-bar counterpart of the built-in open_in_browser, which is a
    TextCommand and so only exists in the view's context menu.

    Resolves the default *browser* explicitly rather than handing a file: URL
    to the OS. Every platform's "open this URL" call routes a file: URL by
    document type, not by scheme, so a .md goes to whatever owns .md -- on
    macOS that is typically Sublime itself, which looks like the entry doing
    nothing at all. See open_in_browser_argv() for the per-platform detail.
    """

    # .md relies on the chrome-markdown-viewer extension (see that folder's
    # README) to render; without it the browser shows the raw source.
    EXTENSIONS = (".html", ".htm", ".md", ".markdown")

    def is_visible(self, paths=[]):
        # isfile keeps a directory named docs.html, or an already-deleted
        # file, from showing an entry that would silently do nothing.
        selected = self.resolve(paths)
        return bool(selected) and all(
            path.lower().endswith(self.EXTENSIONS) and os.path.isfile(path)
            for path in selected
        )

    def run(self, paths=[]):
        # Re-checked here: the menu snapshot can go stale between draw and
        # click.
        selected = [path for path in self.resolve(paths) if os.path.isfile(path)]
        if selected:
            # Off the UI thread: `open` and friends block until the browser
            # has been launched, which is seconds on a cold start.
            threading.Thread(target=self.launch, args=(selected,)).start()

    def launch(self, paths):
        argv, is_launcher = browser_launcher()
        for path in paths:
            if argv:
                try:
                    if is_launcher:
                        if subprocess.call(argv + [path], **DETACHED) == 0:
                            continue
                    else:
                        subprocess.Popen(argv + [path], **DETACHED)
                        continue
                except OSError:
                    pass
                # The configured or detected browser did not take it (moved,
                # uninstalled, bad setting). Fall through rather than leaving
                # the click silently dead.
            # Not "file://" + path like the built-in: as_uri() percent-encodes
            # spaces and "#", which a bare concatenation hands over broken.
            if not webbrowser.open_new_tab(Path(path).as_uri()):
                self.window.status_message('Could not open "%s" in a browser' % path)


class OpenExternallyPathCommand(SideBarExtraCommand):
    """Open the selection with the OS default application. Build 4200 has no
    built-in for this at all -- nothing in the Default package or the binary
    launches a file externally, and there is no open-externally setting -- so
    a PDF or image double-clicked in the side bar only ever opens as raw
    bytes in a tab. Named with the _path suffix so a future built-in named
    open_externally is never shadowed (same reasoning as copy_absolute_path).

    Deliberately not extension-filtered: "open this the way the OS would" is
    meaningful for every file, and an allowlist rots. Files only, though --
    for a directory this would just duplicate Open Containing Folder."""

    def is_visible(self, paths=[], group=-1, index=-1):
        selected = self.resolve(paths, group, index)
        return bool(selected) and all(os.path.isfile(path) for path in selected)

    def run(self, paths=[], group=-1, index=-1):
        for path in self.resolve(paths, group, index):
            # Re-checked here: the menu snapshot can go stale between draw
            # and click.
            if not os.path.isfile(path):
                continue
            try:
                if sublime.platform() == "windows":
                    os.startfile(path)
                    continue
                opener = "open" if sublime.platform() == "osx" else "xdg-open"
                # Routing by document type is the intent here, unlike Open in
                # Browser -- "the way the OS would open it" is the whole point.
                subprocess.Popen([opener, path], **DETACHED)
            except OSError as error:
                self.window.status_message('Could not open "%s": %s' % (path, error))


class DuplicatePathCommand(SideBarExtraCommand):
    def is_visible(self, paths=[]):
        return len(self.resolve(paths)) == 1

    def run(self, paths=[]):
        selected = self.resolve(paths)
        if not selected:
            return
        source = selected[0]

        panel = self.window.show_input_panel(
            "Duplicate as:", source, partial(self.on_done, source), None, None
        )

        # Preselect just the name, leaving the directory and extension out of
        # the selection so typing replaces only the part you want to change.
        # Loop over splitext so multi-part extensions (.tar.gz) survive whole.
        leaf = os.path.basename(source)
        stem = leaf
        while True:
            head, ext = os.path.splitext(stem)
            if not ext:
                break
            stem = head
        # Measure back from the end rather than len(dirname) + len(os.sep):
        # for a file directly under a filesystem root ("/foo.txt") the dirname
        # already ends in the separator, and adding another shifts the
        # selection one character right.
        start = len(source) - len(leaf)
        panel.sel().clear()
        panel.sel().add(sublime.Region(start, start + len(stem)))

    def on_done(self, source, destination):
        if not destination or destination == source:
            return
        if not os.path.isabs(destination):
            destination = os.path.join(os.path.dirname(source), destination)
        # Cheap early rejection for the common case; the copy itself is what
        # actually guarantees no clobbering (see below).
        if os.path.exists(destination):
            self.window.status_message('"%s" already exists' % destination)
            return
        threading.Thread(target=self.copy, args=(source, destination)).start()

    def copy(self, source, destination):
        try:
            parent = os.path.dirname(destination)
            if parent:
                os.makedirs(parent, exist_ok=True)
            if os.path.isdir(source):
                # copytree refuses an existing destination on its own.
                shutil.copytree(source, destination)
            else:
                # Not shutil.copy2: it overwrites silently, and the check in
                # on_done can go stale between there and here. Opening "xb"
                # makes creation exclusive, so a destination that appeared in
                # the meantime raises FileExistsError instead of being lost.
                with open(source, "rb") as src, open(destination, "xb") as dst:
                    shutil.copyfileobj(src, dst)
                shutil.copystat(source, destination)
        except FileExistsError:
            # Something was already there and this call did not create it.
            # Leave it strictly alone.
            self.window.status_message('"%s" already exists' % destination)
            return
        except OSError as error:
            # Both branches above fail outright when the destination already
            # exists, so whatever is sitting there now was created by this
            # call. Remove it: a truncated file, or a half-copied tree, would
            # otherwise survive and make the next attempt report "already
            # exists" while looking complete.
            self.discard(destination)
            self.window.status_message("Could not duplicate: %s" % error)
            return
        # Back to the main thread for anything touching the UI.
        sublime.set_timeout(partial(self.reveal, destination), 0)

    @staticmethod
    def discard(path):
        try:
            if os.path.isdir(path):
                shutil.rmtree(path)
            elif os.path.exists(path):
                os.remove(path)
        except OSError:
            # Nothing further to try; the caller still reports the original
            # failure, which is the more useful message.
            pass

    def reveal(self, destination):
        self.window.status_message('Duplicated to "%s"' % destination)
        self.window.run_command("refresh_folder_list")
        if os.path.isfile(destination):
            self.window.open_file(destination)
