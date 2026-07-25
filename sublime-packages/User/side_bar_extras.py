"""Side bar entries Sublime lacks: relative path, filename, duplicate.

Build 4200 ships only "Copy Path" (absolute, single selection). These three
commands fill the gaps. They also appear in the command palette, where no
paths are passed and the active view's file is used instead.

Positioning lives in Default/Side Bar.sublime-menu -- menu files concatenate
in load order with User last, so entries added from User/ can only land at
the bottom of the menu.
"""

import os
import shutil
import threading
from functools import partial

import sublime
import sublime_plugin


class SideBarExtraCommand(sublime_plugin.WindowCommand):
    """Shared path resolution and clipboard reporting."""

    def resolve(self, paths):
        # The side bar passes the selected paths. The command palette passes
        # nothing, so fall back to the active view's file.
        if paths:
            return [path for path in paths if path]
        view = self.window.active_view()
        name = view.file_name() if view else None
        return [name] if name else []

    def is_visible(self, paths=[]):
        return bool(self.resolve(paths))

    def to_clipboard(self, values):
        sublime.set_clipboard("\n".join(values))
        if len(values) == 1:
            self.window.status_message('Copied "%s"' % values[0])
        else:
            self.window.status_message("Copied %d paths" % len(values))


class CopyFilenameCommand(SideBarExtraCommand):
    def run(self, paths=[]):
        # rstrip the separator so a trailing slash on a folder doesn't yield ""
        names = [
            os.path.basename(path.rstrip(os.sep)) for path in self.resolve(paths)
        ]
        self.to_clipboard(names)


class CopyRelativePathCommand(SideBarExtraCommand):
    def run(self, paths=[]):
        roots = self.window.folders()
        self.to_clipboard(
            [self.relative_to_project(path, roots) for path in self.resolve(paths)]
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
