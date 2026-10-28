# Ghostty cheatsheet

> Personal cheatsheet for the Ghostty terminal: install on Fedora from the official source
> tarball, then font, config and keybinds.
>
> Verified on Ghostty 1.4.0, Fedora 42 GNOME (2026-10-29). Release notes:
> <https://ghostty.org/docs/install/release-notes>

## Contents

- **Install on Fedora: build the release tarball into `~/.local`**
    - Download and verify the tarball
    - Install the Zig version the release asks for
    - Build and install into `~/.local`
    - Close every window to switch versions
- **Upgrade or roll back: rebuild with another version**
- **Install on macOS: the official `.dmg`**
- **Install SF Mono font**
- **Config: `~/.config/ghostty/config.ghostty`**
- **Keybinds: list and reload**

## Install on Fedora: build the release tarball into `~/.local`

**Build the official release tarball, not a git checkout.** The tarball ships the GTK UI
already compiled; a git checkout needs `blueprint-compiler` ≥ 0.20, and Fedora 42 only has
0.16. The result is a user-owned install in `~/.local` with no sudo for Ghostty itself.
`~/.local/bin` must be on your `PATH`.

One-time build dependencies (Fedora 42 already has GTK 4.18, libadwaita 1.7 and
gtk4-layer-shell 1.3, above what 1.4 requires):

```bash
sudo dnf install gtk4-devel libadwaita-devel gtk4-layer-shell-devel libglvnd-devel gettext minisign jq
```

### Download and verify the tarball

The signature check gates the extract, so a bad download stops here:

```bash
V=1.4.0
cd "$(mktemp -d)"
curl -fLO https://release.files.ghostty.org/$V/ghostty-$V.tar.gz
curl -fLO https://release.files.ghostty.org/$V/ghostty-$V.tar.gz.minisig
minisign -Vm ghostty-$V.tar.gz -P RWQlAjJC23149WL2sEpT/l0QKy7hMIFhYdQOFy0Z7z7PbneUgvlsnYcV \
  && tar xzf ghostty-$V.tar.gz && cd ghostty-$V
```

The public key is from <https://ghostty.org/docs/install/build>.

### Install the Zig version the release asks for

Each Ghostty release needs one Zig version (1.3 → 0.15.2, 1.4 → 0.17.0). Read it from the
extracted source:

```bash
grep minimum_zig_version build.zig.zon
```

Install that Zig side by side in `~/.local/opt` and point the symlink at it. Older versions
stay put for rolling back:

```bash
ZIG=0.17.0
mkdir -p ~/.local/opt ~/.local/bin
pushd ~/.local/opt
curl -fLO https://ziglang.org/download/$ZIG/zig-x86_64-linux-$ZIG.tar.xz
SUM=$(curl -fs https://ziglang.org/download/index.json | jq -r --arg v $ZIG '.[$v]."x86_64-linux".shasum')
echo "$SUM  zig-x86_64-linux-$ZIG.tar.xz" | sha256sum -c \
  && tar xf zig-x86_64-linux-$ZIG.tar.xz && rm zig-x86_64-linux-$ZIG.tar.xz
ln -sfn ~/.local/opt/zig-x86_64-linux-$ZIG/zig ~/.local/bin/zig
popd
zig version
```

### Build and install into `~/.local`

From the extracted `ghostty-$V` directory:

```bash
zig build -p $HOME/.local -Doptimize=ReleaseFast \
  -Dversion-string=$V \
  -Dinstalled-exe-path=$HOME/.local/bin/ghostty
ghostty +version        # expect "version: 1.4.0", "channel: stable"
```

- `-p $HOME/.local` installs the binary, desktop file, D-Bus service, systemd user unit,
  themes and shell integration under `~/.local`.
- `-Dversion-string` gives the build its release identity. Outside a git repo the build
  can't tell it's a release and labels itself `1.4.0-dev+0000000`, channel `tip`.
- `-Dinstalled-exe-path` writes the absolute path into the desktop file, D-Bus service and
  systemd unit. Without it they say bare `ghostty`, which systemd only finds in `/usr/bin` or
  `/usr/local/bin`.

### Close every window to switch versions

The old version keeps running until its last window closes, then exits. Close every Ghostty
window, reopen, and confirm from the new window:

```bash
echo $TERM_PROGRAM_VERSION
```

## Upgrade or roll back: rebuild with another version

Read the release notes first for build-requirement bumps (Zig, GTK, libadwaita). Then repeat
the install with the new `V`, and the Zig it asks for.

To roll back, do the same with the previous `V`: point the `zig` symlink back at that
release's Zig in `~/.local/opt` and rebuild. This restores the themes, shell integration and
launcher files too, not just the binary.

## Install on macOS: the official `.dmg`

Download it from <https://ghostty.org/download> and drag Ghostty to Applications. It has a
built-in updater that checks for new versions.

## Install SF Mono font

macOS, copy the fonts bundled with Terminal.app:

```bash
cp /System/Applications/Utilities/Terminal.app/Contents/Resources/Fonts/*.otf ~/Library/Fonts/
```

Linux, from a third-party GitHub mirror of the same fonts:

```bash
mkdir -p ~/.local/share/fonts/SF-Mono
curl -sL https://github.com/supercomputra/SF-Mono-Font/archive/refs/heads/master.tar.gz | tar xz -C ~/.local/share/fonts/SF-Mono --strip-components=1 --wildcards '*.otf'
fc-cache -fv
```

Check Ghostty sees it:

```bash
ghostty +list-fonts | grep -i "SF Mono"
```

## Config: `~/.config/ghostty/config.ghostty`

Older installs use `~/.config/ghostty/config`, which still loads; if both exist,
`config.ghostty` loads second and wins.

```ini
font-family = SF Mono
font-size = 14
# Hide the "Copied to clipboard" toast (Linux/GTK only; other names: config-reload,
# prefix with no- to disable, or set false to disable all toasts)
app-notifications = no-clipboard-copy
# Fix broken TUIs/keys over SSH when the remote lacks xterm-ghostty terminfo.
# ssh-terminfo tries to install it on first connect (needs tic on the remote; cached on success);
# ssh-env sets TERM=xterm-256color as the fallback.
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
