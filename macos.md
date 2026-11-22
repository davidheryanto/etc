# macOS cheatsheet

Start here on a new Mac, or to recall a setting or shortcut. Most setup lives in the tool's own guide; this page links to it and keeps only what is macOS-specific.

> Written for macOS 15 Sequoia and later on Apple silicon (2026-11-22).

## Contents

- **[Set up a new Mac](#set-up-a-new-mac)**
    - [Shell config: follow zsh.md](#shell-config-follow-zshmd)
    - [SSH keys in the Keychain: follow git.md](#ssh-keys-in-the-keychain-follow-gitmd)
    - [Terminal, editors and fonts](#terminal-editors-and-fonts)
    - [Homebrew for small CLIs](#homebrew-for-small-clis)
    - [Apps to install](#apps-to-install)
- **[Make a non-Apple mouse behave](#make-a-non-apple-mouse-behave)**
    - [Turn off pointer acceleration in System Settings](#turn-off-pointer-acceleration-in-system-settings)
    - [Reverse the mouse wheel without flipping the trackpad](#reverse-the-mouse-wheel-without-flipping-the-trackpad)
- **[Shortcuts worth memorising](#shortcuts-worth-memorising)**
    - [Screenshots](#screenshots)
    - [Tile windows without a third-party app](#tile-windows-without-a-third-party-app)
    - [Full screen and switching windows](#full-screen-and-switching-windows)
    - [Reach the menu bar and Dock from the keyboard](#reach-the-menu-bar-and-dock-from-the-keyboard)
- **[Keep the Mac awake with caffeinate](#keep-the-mac-awake-with-caffeinate)**
- **[See what is using CPU, GPU and network](#see-what-is-using-cpu-gpu-and-network)**

## Set up a new Mac

### Shell config: follow zsh.md

PATH, prompt, completions and startup profiling: [zsh.md](zsh.md).

### SSH keys in the Keychain: follow git.md

`UseKeychain` + `AddKeysToAgent` so the passphrase is asked once and stored in the login Keychain: [git.md, Multiple GitHub accounts, Step 1](git.md#step-1-ssh-keys).

### Terminal, editors and fonts

- Terminal: [ghostty.md](ghostty.md#install-on-macos-the-official-dmg)
- Sublime Text and Merge, including the `subl` and `smerge` symlinks: [sublime.md](sublime.md#getting-subl-on-path)
- VS Code: [vs-code.md](vs-code.md)
- Fonts: [fonts.md](fonts.md)

### Homebrew for small CLIs

Install and PATH setup: [homebrew.md](homebrew.md#install).

### Apps to install

- **Shottr**: screenshots with annotation, pixel measuring and OCR
- **Maestral**: lightweight open-source Dropbox client
- **iStat Menus**: CPU, GPU, memory, network and temperature in the menu bar
- **KeepingYouAwake**: menu-bar toggle for `caffeinate`
- **KeePassXC**: offline password manager

## Make a non-Apple mouse behave

### Turn off pointer acceleration in System Settings

**System Settings > Mouse > Advanced > Pointer acceleration: off** (macOS 14 and later). No `defaults write` needed.

### Reverse the mouse wheel without flipping the trackpad

macOS links the mouse and trackpad "Natural scrolling" toggles. To keep natural scrolling on the trackpad but classic direction on the mouse, pick by situation:

- [Scroll Reverser](https://pilotmoon.com/scrollreverser/): reverses the mouse wheel only
- [Mos](https://mos.caldis.me/): reverses the wheel and also smooths its scrolling

## Shortcuts worth memorising

### Screenshots

| Shortcut | Captures |
|---|---|
| `Cmd+Shift+3` | whole screen to a file |
| `Cmd+Shift+4` | selected area to a file (press `Space` to pick a window) |
| `Cmd+Shift+5` | toolbar: screen recording, timer, save location |
| add `Ctrl` | to the clipboard instead, e.g. `Cmd+Ctrl+Shift+4` |

### Tile windows without a third-party app

Built in since macOS 15. Also: drag a window to a screen edge, or hover the green button.

| Shortcut | Action |
|---|---|
| `Fn+Ctrl+←` / `→` / `↑` / `↓` | left / right / top / bottom half |
| `Fn+Ctrl+Shift+←` / `→` | active window left, previous window right (or the reverse) |
| `Fn+Ctrl+F` | fill the screen (not full screen) |
| `Fn+Ctrl+C` | centre |
| `Fn+Ctrl+R` | restore previous size |

### Full screen and switching windows

| Shortcut | Action |
|---|---|
| `Ctrl+Cmd+F` | toggle full screen |
| ``Cmd+` `` | next window of the current app |

### Reach the menu bar and Dock from the keyboard

| Shortcut | Action |
|---|---|
| `Ctrl+F2` | focus the menu bar |
| `Ctrl+F3` | focus the Dock |

On a laptop keyboard, add `Fn` unless the F-keys are set to standard function keys.

## Keep the Mac awake with caffeinate

```bash
caffeinate -d -t 3600   # keep the display on for 1 hour
caffeinate -i make      # stay awake until the command exits
```

## See what is using CPU, GPU and network

- **Activity Monitor**: built in, per-process CPU, memory, energy, disk and network
- **[macmon](https://github.com/vladkens/macmon)**: terminal CPU/GPU usage, power and temperature for Apple silicon, no `sudo`
- **[scripts/nettop-top](scripts/nettop-top)**: live per-process network rates (wraps `nettop`)
