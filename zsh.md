# Zsh on macOS cheatsheet

Modern best practices for zsh shell configuration on macOS (2026).

## Contents

- **Concepts**
    - Loading order of zsh config files
    - Interactive vs login shell
    - macOS quirk: every new tab is a login shell
    - Why PATH belongs in `~/.zprofile` (not `~/.zshenv`)

- **Recommended split**
    - `~/.zprofile` — PATH and env vars
    - `~/.zshrc` — interactive (prompt, aliases, completions)
    - `~/.zshenv` — keep minimal/unused
    - Sample `~/.zprofile`
    - Sample `~/.zshrc`

- **Performance**
    - Profile startup time
    - Identify slow init scripts
    - Lazy-load slow tools (SDKMan, nvm, conda pattern)
    - Direct PATH approach (skip slow init entirely)

- **Reference**
    - Useful one-liners
    - Common pitfalls

## Loading order of zsh config files

```
.zshenv → .zprofile → .zshrc → .zlogin → .zlogout
```

| File | Loaded for |
|---|---|
| `~/.zshenv` | All shells (interactive, non-interactive, scripts, cron) |
| `~/.zprofile` | Login shells only |
| `~/.zshrc` | Interactive shells only |
| `~/.zlogin` | Login shells (after `.zshrc`) — rarely used |
| `~/.zlogout` | On logout — rarely used |

## Interactive vs login shell

Two independent properties:

- **Interactive** = you're typing commands at a prompt
- **Login** = the first/top-level shell of a session

Verify in any shell:

```bash
[[ -o login ]] && echo "login=YES" || echo "login=NO"
[[ -o interactive ]] && echo "interactive=YES" || echo "interactive=NO"
```

## macOS quirk: every new tab is a login shell

On macOS, **Terminal / Ghostty / iTerm2 / Warp** all open new tabs as **interactive + login** shells. This differs from Linux defaults (where `gnome-terminal` opens interactive non-login).

Practical effect on macOS: **every new tab loads `.zshenv` + `.zprofile` + `.zshrc`**.

| Where shell starts | Loads |
|---|---|
| Fresh tab in Terminal/Ghostty/iTerm2 | `.zshenv` + `.zprofile` + `.zshrc` |
| `zsh` typed inside an existing shell | `.zshenv` + `.zshrc` |
| `cron`, `ssh host cmd`, build scripts | `.zshenv` only |

## Why PATH belongs in `~/.zprofile` (not `~/.zshenv`)

macOS runs `/etc/zprofile` → which calls `path_helper` → which **rewrites PATH** based on `/etc/paths` and `/etc/paths.d/`. This happens after `.zshenv` but before `.zprofile`.

- PATH set in `~/.zshenv` → clobbered by `path_helper` ❌
- PATH set in `~/.zprofile` → preserved ✅

This is also why **Homebrew officially recommends `~/.zprofile`** for `brew shellenv`.

## Recommended split

| File | Put here |
|---|---|
| `~/.zprofile` | `PATH` exports, env vars, `brew shellenv`, version-manager init |
| `~/.zshrc` | Aliases, prompt, `setopt`, key bindings, `direnv hook`, completions |
| `~/.zshenv` | Keep minimal/empty (only fundamentals like `ZDOTDIR` if needed) |

Reasons to keep both files (vs single-file):
- Non-interactive shells (cron, IDE-spawned, `ssh host cmd`) source `.zprofile` but not `.zshrc` — they need PATH but not your prompt/aliases.
- Cleaner mental model: "is this PATH/env? → zprofile. Interactive? → zshrc."
- Future-proof if you ever use Linux where new tabs are non-login.

## Sample `~/.zprofile`

Tip: group with `# --- Section ---` dividers and keep a short purpose comment at the top.

```bash
# ~/.zprofile — login shells (PATH and env vars)

# --- System / package managers ---

# Homebrew
eval "$(/opt/homebrew/bin/brew shellenv)"

# Miniconda
export PATH="$HOME/miniconda3/bin:$PATH"

# uv (~/.local/bin)
. "$HOME/.local/bin/env"

# --- Language toolchains ---

# Node.js
export PATH="$HOME/Apps/node-v22.16.0-darwin-arm64/bin:$PATH"

# Bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# SDKMan — direct PATH (skip ~300ms init); `sdk` lazy-loads on first call
export SDKMAN_DIR="$HOME/.sdkman"
export JAVA_HOME="$SDKMAN_DIR/candidates/java/current"
export PATH="$JAVA_HOME/bin:$SDKMAN_DIR/candidates/gradle/current/bin:$PATH"
sdk() { unset -f sdk; source "$SDKMAN_DIR/bin/sdkman-init.sh"; sdk "$@"; }

# --- Apps ---

# JetBrains Toolbox
export PATH="$PATH:$HOME/Library/Application Support/JetBrains/Toolbox/scripts"
```

## Sample `~/.zshrc`

```bash
# ~/.zshrc — interactive shells (prompt, aliases, completions)

# --- Options ---

setopt interactivecomments    # allow `# comments` at the prompt

# --- Appearance ---

PROMPT='%F{183}%n@%m %F{252}%1~%f$ '
export CLICOLOR=1
export LSCOLORS="gxfxcxdxbxegedabagaced"

# --- Tool integrations ---

# Bun completions
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# direnv
eval "$(direnv hook zsh)"

# --- Aliases ---

alias timeout="gtimeout"
alias tree="tree -I '__pycache__'"
alias fresh='git fetch origin main && git checkout -B <your-branch> origin/main && git branch -f main origin/main'
```

## Profile startup time

```bash
# Total time, login + interactive (what a new tab does)
for i in 1 2 3; do /usr/bin/time -p zsh -l -i -c exit 2>&1 | grep real; done

# Built-in profiler (per-function breakdown)
zsh -l -i -c 'zmodload zsh/zprof; source ~/.zshrc; zprof' | head -30
```

Targets: **<100ms** without a framework, **<300ms** with Oh-My-Zsh.

## Identify slow init scripts

Time each suspect line in isolation:

```bash
/usr/bin/time -p zsh -c 'eval "$(/opt/homebrew/bin/brew shellenv)"'
/usr/bin/time -p zsh -c 'export SDKMAN_DIR=$HOME/.sdkman; source $SDKMAN_DIR/bin/sdkman-init.sh'
/usr/bin/time -p zsh -c 'eval "$(direnv hook zsh)"'
```

Common offenders: SDKMan (~300ms), nvm (~200ms), conda init (~150ms), pyenv (~100ms).

## Lazy-load slow tools

Defer cost until first use. Pattern:

```bash
# Before: heavy init runs on every new tab
source "$SDKMAN_DIR/bin/sdkman-init.sh"

# After: only runs the first time you call `sdk`
export SDKMAN_DIR="$HOME/.sdkman"
sdk() { unset -f sdk; source "$SDKMAN_DIR/bin/sdkman-init.sh"; sdk "$@"; }
```

Same idea works for `nvm`, `conda`, etc. The trade-off: tools managed by the slow script (e.g. `java`, `gradle`) won't be on PATH until you run `sdk` once.

## Direct PATH approach (skip slow init entirely)

If you only need the binaries on PATH and don't use auto-switching features, skip the heavy init script altogether and put the candidate bin dirs on PATH directly. This gives **instant** access to `java`/`gradle`/`mvn` without paying SDKMan's ~300ms init cost. Keep `sdk` available via the lazy function above for occasional `sdk install/use`.

```bash
export SDKMAN_DIR="$HOME/.sdkman"
export JAVA_HOME="$SDKMAN_DIR/candidates/java/current"
export PATH="$JAVA_HOME/bin:$SDKMAN_DIR/candidates/gradle/current/bin:$PATH"
sdk() { unset -f sdk; source "$SDKMAN_DIR/bin/sdkman-init.sh"; sdk "$@"; }
```

What you give up: `sdk` tab-completion until first call, auto-env from `.sdkmanrc`.

## Useful one-liners

```bash
# Reload zsh config without opening a new tab
exec zsh -l

# See effective PATH, one entry per line
echo $PATH | tr ':' '\n'

# Find which file sets a given env var
zsh -lixc exit 2>&1 | grep -n VARIABLE_NAME

# Edit and reload in one go
$EDITOR ~/.zprofile && exec zsh -l
```

## Common pitfalls

- **PATH set in `~/.zshenv`** — gets clobbered by macOS `path_helper`. Use `~/.zprofile`.
- **Sourcing version managers in `~/.zshrc`** — runs every tab including subshells. Move to `~/.zprofile` (runs once per top-level tab).
- **Mixing aliases/prompt into `~/.zprofile`** — leaks interactive niceties into IDE-spawned and ssh non-interactive shells.
- **Forgetting non-existent PATH entries are free** — listing `$SDKMAN_DIR/candidates/gradle/current/bin` even when gradle isn't installed is harmless; zsh skips missing dirs.
