# uv cheatsheet

> Personal cheatsheet — uv 0.12 era (2026). Python packaging with uv; supply-chain defaults
> first. npm counterpart: [node.md](node.md) → *Supply-chain safety*.

## Contents

- **Install & upgrade uv** — standalone installer, `uv self update`
- **Supply-chain safety (Python)** — three execution vectors, cooldown everywhere, the
  lockfile catch in shared repos, urgent-fix exemptions, source builds, `uvx`
- **Check a machine for a known-bad version** — without starting Python

## Install & upgrade uv

Standalone installer puts the binary in `~/.local/bin` (receipt in
`~/.config/uv/uv-receipt.json`), so uv updates itself:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv self update          # upgrade to latest
uv --version
```

## Supply-chain safety (Python)

Installing a package and then using it runs its author's code as you. Python has **three
vectors**, and install-time settings only reach the first:

- **Building an sdist** — `setup.py` / build backend runs at install time. The closest
  thing to npm's `postinstall`. Wheels run **no** code at install.
- **Importing** — code in the package runs on `import`. Nothing stops this; it's why you
  installed it.
- **`.pth` files at interpreter startup** — executable lines in `site-packages/*.pth` run
  every time *that environment's* Python starts, even if you never import the package.

Real case: **litellm 1.82.7 / 1.82.8** (PyPI, 2026-03-24, TeamPCP) — credential stealer
shipped inside the **wheel**: 1.82.7 in `proxy_server.py` (on import), 1.82.8 added
`litellm_init.pth` (on every Python start). Blocking builds would not have helped; it was
quarantined within hours, so a **cooldown would have**.

### Cooldown — configure once (user level)

Only resolve versions uploaded at least N days ago. Relative, so it never goes stale:

```toml
# ~/.config/uv/uv.toml
exclude-newer = "7 days"
```

Applies to `uv lock` / `uv sync` / `uv add` / `uv pip` / `uvx` / `uv tool`. Confirm it's
loaded:

```bash
uv pip compile <(echo idna) -v 2>&1 | grep 'exclude-newer'
# DEBUG Solving with exclude-newer: global: 2026-09-06T...
```

Limits: it filters by *upload time*, so it stops fresh malware, not a long-dormant
typosquat. It also delays legitimate security fixes — pair with vulnerability alerts.

### The lockfile catch — shared repos

uv **records the cooldown in `uv.lock`**:

```toml
[options]
exclude-newer = "0001-01-01T00:00:00Z" # This has no effect and is included for backwards compatibility ...
exclude-newer-span = "P7D"
```

So a cooldown that lives only in *your* `~/.config/uv/uv.toml` disagrees with teammates
and CI:

| Situation | Result |
|---|---|
| Repo lock made **without** cooldown, you run `uv sync --locked` / `uv lock --check` | fails: "To update the lockfile, run `uv lock`" |
| Same lock, you run plain `uv sync` | **silently rewrites `uv.lock`** (and drops anything < 7 days old) |
| Lock made **with** your user cooldown, teammate/CI without it runs `--locked` | fails |

**Fix: make the repo the authority.** Project config overrides user config, so everyone
resolves identically and nobody needs a personal setting:

```toml
# pyproject.toml (or the repo's uv.toml, which wins over [tool.uv])
[tool.uv]
exclude-newer = "7 days"
```

```bash
uv lock && git add pyproject.toml uv.lock   # commit policy + lock together
```

**Team repo that hasn't adopted a cooldown** — don't churn their lock; switch yours off
per command:

```bash
uv sync --locked --exclude-newer false
UV_EXCLUDE_NEWER=false uv lock --check
```

(`--frozen` also avoids the mismatch, but skips *all* lock-freshness checks — not a
substitute for `--locked`.)

**CI** — pin the uv version and consume the committed policy:

```bash
uv sync --locked
```

**Update bots** — match the cooldown or they propose versions uv refuses to lock:

```jsonc
// renovate.json
{ "minimumReleaseAge": "7 days" }
```

```yaml
# .github/dependabot.yml
- package-ecosystem: "uv"
  cooldown:
    default-days: 7
```

### Urgent security fix inside the window

Exempt **one** package, **in the repo** (not a one-off CLI flag — otherwise the next
`uv lock` by a teammate, CI or you resolves without it), then remove the exemption once
the release is > 7 days old:

```toml
[tool.uv]
exclude-newer = "7 days"
exclude-newer-package = { cryptography = false }   # TODO remove after <date>
```

```bash
uv lock --upgrade-package 'cryptography==<fixed-version>'
```

One-off, local only: `--exclude-newer-package cryptography=false`.

### Source builds — `no-build`

Refuses to build sdists (the install-time vector). **Don't set it globally**: on uv 0.12 it
also refuses to build *your own* project, so every project with a `[build-system]` table
fails:

```
error: Distribution `app==0.1.0 @ editable+.` can't be installed because it is marked as `--no-build` but has no binary distribution
```

Use it where it fits instead:

```bash
UV_NO_BUILD=1 uv sync --locked             # CI / deploy images
uv sync --no-install-project --no-build    # deps only, own project skipped
```

```toml
[tool.uv]
no-build-package = ["some-sdist-only-pkg"]   # distrust specific packages
```

Not safety flags: `--no-build-isolation` and `--prefer-binary` still build.

### `uvx` — the npx vector

`uvx <pkg>` fetches **and runs** in one step; a typo runs a stranger's package. For tools
you use repeatedly, install once — a later typo is just `command not found`:

```bash
uv tool install ruff      # vetted, cooldown-checked install
ruff check                # runs YOUR binary
uv tool upgrade ruff      # deliberate update
```

## Check a machine for a known-bad version

**Don't run `python` or `pip` in a suspect environment** — a malicious `.pth` fires on
interpreter start. Search the filesystem instead (`/home` is often a separate mount, so
don't rely on `-xdev /`):

```bash
PKG=litellm; BAD='1\.82\.[78]'

# installed copies (venvs, conda, uv tools) + uv cache
find / /home \( -iname "${PKG}-*.dist-info" \) 2>/dev/null | grep -E "${PKG}-${BAD}\." 

# known malicious file names
find / /home -name 'litellm_init.pth' 2>/dev/null

# any .pth that executes suspicious code (coverage/coloredlogs .pth are benign — read them)
find /home -name '*.pth' -path '*-packages*' 2>/dev/null \
  | xargs -d '\n' grep -lE 'base64|subprocess|b64decode' 2>/dev/null

# pinned in lockfiles / typed in history
grep -rIsl --include='uv.lock' --include='requirements*.txt' -E "${PKG}.{0,40}${BAD}" ~
grep -sE "${PKG}.{0,5}${BAD}" ~/.bash_history ~/.zsh_history

# when did uv fetch each version? (gap around the incident date = never pulled)
ls -ld --time-style=long-iso ~/.cache/uv/archive-v0/*/${PKG}-*.dist-info
```

Then check the incident's persistence IOCs (published in the advisory). If a bad version
was ever installed: **rotate every credential the machine could reach**.
