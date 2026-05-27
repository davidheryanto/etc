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
| `no-distraction.json` | Quiet editor: turns off IntelliSense, suggestions, validation squiggles, and UI clutter. No theme/font/personal prefs — those stay machine-specific. |
| `copilot-disable-python.json` | Disable GitHub Copilot for Python only. |

Keep each fragment scoped to a single intent; put machine-specific choices
(theme, font, keybindings) in your own `settings.json`, not here.
