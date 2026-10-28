# Ghostty cheatsheet

> Personal cheatsheet for the Ghostty terminal: install on Fedora from the official source
> tarball, then font, config and keybinds.
>
> Verified on Ghostty 1.4.0, Fedora 42 GNOME (2026-10-29). Release notes:
> <https://ghostty.org/docs/install/release-notes>

## Contents

- **Install on Fedora: build the release tarball into `~/.local`**
    - Zig at the version the release asks for
    - Download and verify the tarball
    - Build with three flags
    - Restart Ghostty fully to switch
- **Upgrade or roll back: same build, new version**
- **Install on macOS: the official `.dmg`**
- **Font: SF Mono**
- **Config: `~/.config/ghostty/config`**
- **Keybinds: list and reload**

## Install on Fedora: build the release tarball into `~/.local`

**Build the official release tarball, not a git checkout.** The tarball ships the GTK UI
already compiled; a git checkout needs `blueprint-compiler` ≥ 0.20, and Fedora 42 only has
0.16. The result is a user-owned install in `~/.local` with no sudo for Ghostty itself.

One-time build dependencies (Fedora 42 already has GTK 4.18 and libadwaita 1.7, which 1.4
requires):

```bash
sudo dnf install gtk4-devel libadwaita-devel libglvnd-devel gettext minisign
```

### Zig at the version the release asks for

Each Ghostty release needs one Zig version (1.3 → 0.15.2, 1.4 → 0.17.0). Once the tarball is
extracted, `grep minimum_zig_version ghostty-*/build.zig.zon` tells you which. Install Zig
side by side in `~/.local/opt` and point the symlink at the one you need:

```bash
ZIG=0.17.0
cd ~/.local/opt
curl -LO https://ziglang.org/download/$ZIG/zig-x86_64-linux-$ZIG.tar.xz
# compare with the published checksum
curl -s https://ziglang.org/download/index.json | jq -r --arg v $ZIG '.[$v]."x86_64-linux".shasum'
sha256sum zig-x86_64-linux-$ZIG.tar.xz
tar xf zig-x86_64-linux-$ZIG.tar.xz && rm zig-x86_64-linux-$ZIG.tar.xz
ln -sfn ~/.local/opt/zig-x86_64-linux-$ZIG/zig ~/.local/bin/zig
zig version
```

### Download and verify the tarball

```bash
V=1.4.0
cd "$(mktemp -d)"
curl -LO https://release.files.ghostty.org/$V/ghostty-$V.tar.gz
curl -LO https://release.files.ghostty.org/$V/ghostty-$V.tar.gz.minisig
minisign -Vm ghostty-$V.tar.gz -P RWQlAjJC23149WL2sEpT/l0QKy7hMIFhYdQOFy0Z7z7PbneUgvlsnYcV
tar xzf ghostty-$V.tar.gz && cd ghostty-$V
```

The public key is from <https://ghostty.org/docs/install/build>.

### Build with three flags

```bash
zig build -p $HOME/.local -Doptimize=ReleaseFast \
  -Dversion-string=$V \
  -Dinstalled-exe-path=$HOME/.local/bin/ghostty
ghostty +version        # expect "version: 1.4.0", "channel: stable"
```

- `-p $HOME/.local` installs the binary, desktop file, D-Bus service, systemd user unit,
  themes and shell integration under `~/.local`.
- `-Dversion-string` is required for a tarball build. Outside a git repo the build can't tell
  it's a release and labels itself `1.4.0-dev`, channel `tip`.
- `-Dinstalled-exe-path` writes the absolute path into the desktop file, D-Bus service and
  systemd unit. Without it they say bare `ghostty`, which systemd only finds in `/usr/bin` or
  `/usr/local/bin`.

### Restart Ghostty fully to switch

Ghostty runs as a single background instance, so closing windows isn't enough: quit the app,
then reopen it. Confirm from a new window:

```bash
echo $TERM_PROGRAM_VERSION
```

## Upgrade or roll back: same build, new version

Read the release notes first for build-requirement bumps (Zig, GTK, libadwaita). Then keep
the current binary and repeat the install with the new `V`:

```bash
cp ~/.local/bin/ghostty ~/.local/bin/ghostty-$(ghostty +version | awk 'NR==1{print $2}')
```

To roll back, copy that saved binary back over `~/.local/bin/ghostty` and restart Ghostty.

## Install on macOS: the official `.dmg`

Download it from <https://ghostty.org/download> and drag Ghostty to Applications. It updates
itself.

## Font: SF Mono

```bash
# macOS: copy the fonts bundled with Terminal.app
cp /System/Applications/Utilities/Terminal.app/Contents/Resources/Fonts/*.otf ~/Library/Fonts/

# Linux
mkdir -p ~/.local/share/fonts/SF-Mono
curl -sL https://github.com/supercomputra/SF-Mono-Font/archive/refs/heads/master.tar.gz | tar xz -C ~/.local/share/fonts/SF-Mono --strip-components=1 --wildcards '*.otf'
fc-cache -fv

# Check Ghostty sees it
ghostty +list-fonts | grep -i "SF Mono"
```

## Config: `~/.config/ghostty/config`

```ini
font-family = SF Mono
font-size = 14
# Hide the "Copied to clipboard" toast (Linux/GTK only; other names: config-reload,
# prefix with no- to disable, or set false to disable all toasts)
app-notifications = no-clipboard-copy
# Fix broken TUIs/keys over SSH when remote lacks xterm-ghostty terminfo.
# ssh-terminfo installs it on first connect (cached); ssh-env sets TERM=xterm-256color as fallback.
shell-integration-features = ssh-terminfo,ssh-env
# Let Ctrl+Enter reach the running program instead of toggling fullscreen (Linux default)
keybind = ctrl+enter=unbind
```

Check it after editing:

```bash
ghostty +validate-config
```

## Keybinds: list and reload

```bash
ghostty +list-keybinds              # effective
ghostty +list-keybinds --default    # built-in defaults
```

Reload the config with Cmd+Shift+, (macOS) or Ctrl+Shift+, (Linux).

Since 1.4 on Linux, Ctrl+Shift+PageUp/PageDown move the tab, and jump-to-prompt moved to
Ctrl+Shift+Up/Down.
