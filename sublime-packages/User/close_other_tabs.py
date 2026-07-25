import sublime_plugin


class CloseOtherTabsCommand(sublime_plugin.WindowCommand):
    """Close every tab in a group except one.

    Build 4200 ships close_others_by_index in the Default Tab Context menu,
    but hides it at render time, so this reimplements it. The menu passes
    group/index of -1; Sublime substitutes the right-clicked tab's real
    position before the command runs. The fallback to the active view covers
    invocation from the command palette or a key binding, where no tab was
    clicked and the -1 placeholders survive.
    """

    def run(self, group=-1, index=-1):
        window = self.window

        if group < 0 or index < 0:
            view = window.active_view()
            if view is None:
                return
            group, index = window.get_view_index(view)
            if group < 0:
                return

        views = window.views_in_group(group)
        if index >= len(views):
            return
        keep = views[index]

        # Delegate to close_by_index rather than View.close() so unsaved
        # tabs still raise the usual save prompt. Indices shift as tabs
        # close, so re-resolve each view's position right before closing it.
        for view in views:
            if view.id() == keep.id():
                continue
            view_group, view_index = window.get_view_index(view)
            if view_group < 0:
                continue
            window.run_command(
                "close_by_index", {"group": view_group, "index": view_index}
            )
