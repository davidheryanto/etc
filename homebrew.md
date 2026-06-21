# Homebrew cheatsheet

Package manager for macOS and Linux. On Linux it installs entirely under
`/home/linuxbrew/.linuxbrew` (no root needed after setup) — handy for getting a
single prebuilt CLI without touching the system package manager.

## Install

```bash
# Linux + macOS (official script; prompts for sudo + RETURN)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then add it to PATH (the installer prints the exact lines):

```bash
# Linux
echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"

# macOS (Apple Silicon; Intel macOS uses /usr/local instead — not covered here)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### Fedora prerequisites
A typical Fedora **Workstation** usually already has curl, git, gcc, make, file, so the
install just works. On **minimal/server** images, install the official prerequisites first
(per the [Homebrew Linux docs](https://docs.brew.sh/Homebrew-on-Linux)):

```bash
sudo dnf install procps-ng curl file git
sudo dnf group install development-tools     # also needed if a formula compiles from source
```

## Common commands

```bash
brew install <formula>           # install (downloads prebuilt bottle when available)
brew install <user>/<tap>/<f>    # install from a third-party tap
brew upgrade                     # upgrade EVERYTHING
brew upgrade <formula>           # upgrade just one
brew uninstall <formula>
brew list                        # installed formulae
brew info <formula>              # version, deps, install path
brew search <text>
brew cleanup                     # remove old versions
brew --prefix <formula>          # install location
```

## Gotchas

- **Auto-update is slow/chatty.** brew runs `brew update` on most commands. Skip it:
  `export HOMEBREW_NO_AUTO_UPDATE=1`
- **Third-party taps** may prompt `not trusted; run 'brew trust <tap>'`. Only trust
  taps you actually vet.
- **Formula vs cask:** `--cask` installs GUI apps (macOS only). Plain formulae are CLIs
  and work on Linux.
- **Linux footprint:** the first install pulls a portable Ruby + a few hundred MB under
  `/home/linuxbrew`. One-off.

## Uninstall Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)"
```
