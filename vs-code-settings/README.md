# vs-code-settings

Curated VS Code settings **fragments** — each file covers one concern, so you
can compose your own `settings.json` from the pieces you want.

These are examples / building blocks, **not** auto-applied. VS Code has no
native "include another settings file", so to use one: open your User settings
JSON (`Cmd/Ctrl+Shift+P → Preferences: Open User Settings (JSON)`) and paste in
the keys you want.

User `settings.json` lives at:

| OS | Path |
|----|------|
| Linux   | `~/.config/Code/User/settings.json` |
| macOS   | `~/Library/Application Support/Code/User/settings.json` |
| Windows | `%APPDATA%\Code\User\settings.json` |

## Files

| File | What it does |
|------|--------------|
| `clutter-free.json` | Clean baseline, **lighter** preset: drops static visual noise (minimap, breadcrumbs, command center, line/occurrence highlights, SCM badge) with no loss of function. Autocomplete and error-checking stay on. Pairs with `session-restore.json`. |
| `no-distraction.json` | Clean baseline, **fuller** preset (superset of clutter-free — apply one, not both): also turns off autocomplete, suggestions, and error squiggles, for a quiet editor (writing prose or working out code) without it flagging small mistakes. No theme/font/personal prefs — those stay machine-specific. |
| `session-restore.json` | Recommended clean / minimal-clutter session restore: bare launch reopens only the single last window; opening a folder/file reopens no other windows (that folder's own tabs may still return); unsaved files prompt on close instead of being backed up silently. Pair with `files.autoSave`. |
| `copilot-disable-python.json` | Disable GitHub Copilot for Python only. |

Keep each fragment scoped to a single intent; put machine-specific choices
(theme, font, keybindings) in your own `settings.json`, not here.
