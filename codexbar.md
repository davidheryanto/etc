# codexbar CLI cheatsheet

Cross-platform CLI that reports **AI coding-provider usage limits** (Codex, Claude,
and ~50 others) by reusing your existing provider sessions. Part of
[steipete/CodexBar](https://github.com/steipete/CodexBar) (the macOS menu-bar app);
the CLI also ships for Linux. Reads local OAuth/config files — no passwords stored.

## Install

```bash
brew install steipete/tap/codexbar     # see homebrew.md
brew upgrade codexbar                   # update (there is NO `codexbar update` subcommand)
```

Tarball alternative (no Homebrew). The musl asset is **statically linked** — no *runtime*
library deps. (CodexBar also ships a glibc Linux build.) This snippet targets **Linux
x86_64** and needs `gh`, `tar`, `sha256sum`, `install` at install time. It extracts into a
private temp dir and only installs the binary verified there:

```bash
TAG=$(gh release view --repo steipete/CodexBar --json tagName -q .tagName)
F="CodexBarCLI-${TAG}-linux-musl-x86_64.tar.gz"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
gh release download "$TAG" --repo steipete/CodexBar --pattern "$F" --pattern "$F.sha256" --dir "$T" --clobber
( cd "$T" && sha256sum -c "$F.sha256" )          # aborts (set -e or manual) if checksum fails
tar -xzf "$T/$F" -C "$T"
install -Dm755 "$(find "$T" -type f \( -name codexbar -o -name CodexBarCLI \) -perm -u+x | head -1)" ~/.local/bin/codexbar
```

## Linux gotchas

- **Use `--source oauth`.** The default Codex/Claude source is the browser-cookie web
  dashboard, which is **macOS-only** and errors on Linux
  (`selected source requires web support and is only supported on macOS`).
  `--source oauth` reads `~/.codex/auth.json` / `~/.claude/.credentials.json` over HTTPS.
- **Benign warning:** `libcurl.so.4: no version information available` (glibc binary vs
  the distro libcurl). It's **stderr-only** — stdout JSON is clean. The static-musl build
  avoids it entirely.

## Usage

```bash
codexbar usage                                            # all enabled providers (text)
codexbar usage --provider codex --source oauth            # one provider
codexbar usage --provider both --source oauth --format json --pretty
codexbar usage --provider claude --source oauth --format json
```

`--format text|json`, `--pretty`, `--json-only`, `--status`, `--all-accounts`,
`--source <auto|web|cli|oauth|api>`.

JSON shape (per provider): `{ provider, source, usage, credits, error }` where
`usage` has `primary`/`secondary`/`tertiary` rate windows + `extraRateWindows[]`,
each window `{ usedPercent, windowMinutes, resetsAt }`. **`% left = 100 - usedPercent`.**

## Config

```bash
codexbar config providers                                 # list + enabled state
codexbar config enable  --provider claude
codexbar config disable --provider cursor
printf '%s' "$KEY" | codexbar config set-api-key --provider elevenlabs --stdin
```

Config file: `~/.config/codexbar/config.json` (perms `600`; legacy `~/.codexbar/config.json`
still read if present). Enabled toggles + API keys live here.

## Other subcommands

```bash
codexbar cost   --provider codex --format json    # local cost-usage scan (codex/claude)
codexbar serve  --port 8080                        # localhost JSON server (/usage /cost /health)
codexbar cache  clear --all
codexbar diagnose
codexbar --help
```
