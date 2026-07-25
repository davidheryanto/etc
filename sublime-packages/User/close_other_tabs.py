import sublime_plugin


class CloseOtherTabsCommand(sublime_plugin.WindowCommand):
    """Close every tab in a group except one.

    Build 4200 ships close_others_by_index in the Default Tab Context menu,
    but hides it at render time, so this reimplements it. The menu passes
    group/index of -1; Sublime substitutes the right-clicked tab's real
    position before the command runs. The fallback to the active sheet covers
    invocation from the command palette or a key binding, where no tab was
    clicked and the -1 placeholders survive.

    Works in sheets rather than views: a tab is a sheet, and image or HTML
    sheets have no view at all, so views_in_group() indices drift out of step
    with tab positions the moment one is open. Verified on 4200 -- opening a
    single image gives 2 sheets against 1 view.
    """

    def run(self, group=-1, index=-1):
        window = self.window

        if group < 0 or index < 0:
            sheet = window.active_sheet()
            if sheet is None:
                return
            group, index = window.get_sheet_index(sheet)
            if group < 0:
                return

        sheets = window.sheets_in_group(group)
        if index >= len(sheets):
            return
        keep = sheets[index]

        # Delegate to close_by_index rather than Sheet.close() so unsaved
        # tabs still raise the usual save prompt. Indices shift as tabs
        # close, so re-resolve each sheet's position right before closing it.
        for sheet in sheets:
            if sheet.id() == keep.id():
                continue
            sheet_group, sheet_index = window.get_sheet_index(sheet)
            if sheet_group < 0:
                continue
            window.run_command(
                "close_by_index", {"group": sheet_group, "index": sheet_index}
            )
