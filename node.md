# Node.js cheatsheet

> Personal cheatsheet — Node 24 LTS era (2026). Direct install, current defaults, fewer dependencies.

## Contents

- **Install Node** — official binary, no sudo, no package manager
- **Run code** — run a script, `--watch`, `--env-file`, REPL, shell-out
- **npm** — `install` vs `ci`, scripts, `overrides`, inspect a package, `~/.npmrc`
- **Supply-chain safety (npm/npx)** — two vectors (install-hook vs npx-run), configure once, read the name, install-don't-npx, sandbox, verify
- **Project setup** — ESM default, `package.json` essentials
- **Recipes** — path, fs, crypto, http one-liners

## Install Node — official binary, no sudo, no package manager

One method for every machine: download the official prebuilt binary into a
user-owned dir and put it on `PATH`. No `sudo`, no `dnf`/`brew`, and `npm install -g`
works without root because the prefix is yours.

Grab the current LTS version string from <https://nodejs.org/en/download>, then:

```bash
V=v24.17.0   # ← set to the current LTS from the link above

# Linux (x64)
cd ~ && curl -fsSL https://nodejs.org/dist/$V/node-$V-linux-x64.tar.xz | tar xJ
mv node-$V-linux-x64 ~/.node

# macOS (Apple Silicon; use darwin-x64 on Intel)
cd ~ && curl -fsSL https://nodejs.org/dist/$V/node-$V-darwin-arm64.tar.gz | tar xz
mv node-$V-darwin-arm64 ~/.node
```

Add to `PATH` in `~/.zshrc` (or `~/.bashrc`), then restart the shell:

```bash
export PATH="$HOME/.node/bin:$PATH"
```

Verify — `npm install -g` now needs no `sudo` (the prefix is user-owned):

```bash
node -v && npm -v
npm install -g <tool>        # installs into ~/.node, no root
```

- **Pin a project's Node version** so collaborators / CI / future-you know the target — no tool required:
  ```jsonc
  // package.json
  "engines": { "node": ">=24" }
  ```
  A `.node-version` file (a bare `24`) does the same and is what version managers read.
- **Need multiple Node versions** for different projects? That's the one job a version
  manager does — [`fnm`](https://github.com/Schniz/fnm) (fast, Node-only) or
  [`mise`](https://mise.jdx.dev) (one tool for Node + Python + Go + …). Both read `.node-version`,
  so adopting one later is near-free.

## Run code

```bash
node app.js
node --watch app.js              # auto-restart on file change (replaces nodemon)
node --env-file=.env app.js      # load .env into process.env (replaces dotenv)
node --env-file=.env --env-file=.env.local app.js   # later files win
```

REPL tricks:

```text
.load some-file.js      # eval a file into the REPL session
_                       # value of the last evaluated expression
.editor                 # multi-line editor mode (Ctrl-D to run)
```

Run a shell command from Node:

```js
import { promisify } from 'node:util';
import { exec as execCb } from 'node:child_process';
const exec = promisify(execCb);

const { stdout } = await exec('ls -la');
console.log(stdout);
```

Serve a static directory (`npx` fetches `http-server` into its cache on first run):

```bash
npx http-server -p 8080 -a 0.0.0.0
```

## npm

```bash
npm install                  # dev: install + update package-lock.json
npm ci                       # CI/Docker/deploy: clean, exact, fails on lockfile drift
npm install <pkg>@<version>  # pin a specific version
npm run <script>             # run a package.json script
node --run <script>          # same, but faster (no npm overhead; no pre/post hooks)
```

- **`npm ci`** — "clean install" (the name also nods to *continuous integration*); the
  standard command for CI, Docker, and deploys. Wipes `node_modules` and installs exactly
  what `package-lock.json` says, erroring if the lockfile and `package.json` disagree
  instead of silently re-resolving. **Always commit `package-lock.json`.**
- **Run scripts in parallel** with [`concurrently`](https://github.com/open-cli-tools/concurrently):
  ```jsonc
  "dev": "concurrently --kill-others \"npm:watch\" \"npm:serve\""
  ```
- **Patch a transitive dependency** (e.g. force a fixed version for a CVE) — root
  `package.json` only:
  ```jsonc
  "overrides": { "lodash": "4.17.21" }
  ```
- **Inspect a package** before (or after) installing:
  ```bash
  npm view <pkg>                       # latest metadata
  npm view <pkg> versions              # every published version
  npm view <pkg> time maintainers      # publish dates + who owns it
  ```
- **Useful `~/.npmrc`:**
  ```ini
  save-exact=true            # write exact versions, not ^ranges
  engine-strict=true         # error (not warn) on an engines mismatch
  # supply-chain hardening — see that section: ignore-scripts=true, min-release-age=7
  # behind a corporate proxy:
  proxy=http://proxy.company.com:8080
  https-proxy=http://proxy.company.com:8080
  ```

## Supply-chain safety (npm/npx)

Installing *or running* a package executes its author's code as you — and there are **two
separate vectors; one config does not cover both.** That gap is the trap:

- **`npm install <pkg>`** runs code through install **hooks** (`postinstall` etc.) →
  `ignore-scripts=true` blocks it.
- **`npx <pkg>` / running a CLI** executes the package's **bin** directly. That's the
  intended action, *not* a hook, so `ignore-scripts` does **nothing** for it — and a typo
  in the name can resolve to a *different real package*, which npx then fetches and runs as
  you, full stop.

### Configure once — covers the install/hook vector

**Block install scripts** — `postinstall`/`preinstall` hooks are the #1 malware vector on
the install path:

```bash
npm config set ignore-scripts true            # writes ~/.npmrc; applies to npm + npx installs
npm install <pkg> --ignore-scripts=false      # opt back in for one trusted install
npm rebuild <pkg> --ignore-scripts=false      # build an already-installed native dep
```

> **A skipped build fails silently** — `npm install` still prints "added N packages, found
> 0 vulnerabilities" while a native dep (esbuild, sharp, better-sqlite3) lands with its
> binary unbuilt; you only learn at **runtime** (missing `.node` / "did not self-register").
> **Fix: run npm ≥ 11.16** (`npm install -g npm@latest`) so `npm approve-scripts` lists deps
> needing a build step and you allowlist them deliberately. (`pnpm` warns by default via
> `pnpm approve-builds`.) npm 12, now in pre-release, makes `ignore-scripts` the default.

**Install cooldown (rolling window, never a fixed date)** — only install/run versions public
a while, so a release pulled within hours of a compromise never reaches you. It filters by
*publish age*, so it stops fresh malware but **not a long-dormant typosquat** (npm 11.10+;
value in **days**):

```bash
npm config set min-release-age 7    # rolling: always "≥7 days old"
npm config set min-release-age-exclude "@openai/codex*"  # trusted fast-moving CLI
```

`min-release-age` is relative by design — npm recomputes it to `before = now − N days` each
run, so it needs zero upkeep. Don't hand-set a fixed `before=<date>` — it silently goes
stale until you remember to bump it. Exempt only packages you deliberately trust; glob
patterns work, so `@openai/codex*` covers `@openai/codex` and its platform packages.

```bash
npm config get min-release-age
npm config get min-release-age-exclude
```

### Before you run something unfamiliar — covers the npx/exec vector

**Read the name before you press `y`** — the main guard here, since `ignore-scripts` can't
help. The `Need to install … Ok to proceed?` prompt is only a cache-miss notice, so a tool
you run *often* is cached and won't prompt; **a prompt appearing on a familiar command means
the resolved name isn't what you expect — stop and read it.** npx runs whatever name
resolves, so a one-letter slip can run a real package you never meant to: `skills` is the
tool you want, but `skill` is **a different one, owned by a stranger** — confirm that prompt
and you've handed them your shell. Match the printed name to your intent exactly.

**For tools you run repeatedly, install once instead of `npx`-ing each time** — `npx`
couples *fetch* and *run*, so a typo executes a stranger in one step; a real install turns
that same typo into a harmless `command not found`:

```bash
npm install -g skills        # one vetted, cooldown-checked install; bin is NOT auto-run
skills update                # runs YOUR binary, fetches nothing — a mistyped name just errors out
npm install -g skills@latest # update the CLI itself, deliberately
```

**Inspect without executing** — `npm pack` downloads the tarball and runs nothing; read the
bin and `scripts` before you ever run it:

```bash
npm pack <pkg> && tar xzf <pkg>-*.tgz   # then read package/bin/* and package.json
```

**Sandbox an unfamiliar CLI** — no network (can't exfiltrate), throwaway home (can't read
your secrets):

```bash
firejail --net=none --private npx <pkg> ...   # dnf install firejail
```

**Vet it** — red flags: long-dormant then freshly republished, ~0 weekly downloads, an
unknown maintainer, or a name shadowing a popular one:

```bash
npm view <pkg> time maintainers      # rapid releases? unknown owner?
curl https://api.npmjs.org/downloads/point/last-week/<pkg>   # download count
```

### After installing

**Verify** — registry signatures + build provenance; run after `npm ci`/`install`:

```bash
npm audit signatures
```

**npx flags & cache (reference):**

```bash
npx --no <pkg> ...           # run only if already available; fail rather than download
npx --offline <pkg> ...      # cache-only (no network); fail if missing
npx --yes <pkg> ...          # auto-confirm — skips the name check; scripts/CI only

ls ~/.npm/_npx/*/package.json   # what's cached (each lists _npx.packages)
rm -rf ~/.npm/_npx/<hash>       # remove a bad / typo'd entry
```

## Project setup

- **ESM is the default for new projects** — set it once:
  ```jsonc
  // package.json
  { "type": "module" }
  ```
  Use `.cjs` to force a CommonJS file, `.mjs` to force ESM, inside the opposite-type
  package. Modern Node can `require()` an ESM package, so dual-publishing is rarely needed.
- **`package.json` essentials:**
  ```jsonc
  {
    "type": "module",
    "engines": { "node": ">=24" },
    "exports": "./index.js"        // modern entry map; prefer over "main"
  }
  ```
- **Prefix core imports** with `node:` (e.g. `import fs from 'node:fs'`) — disambiguates
  core modules from npm packages.
- **Package manager:** `npm` is the simple default and ships with Node. Reach for
  [`pnpm`](https://pnpm.io) only if you want its speed / disk-dedup win across many projects.

## Recipes

```js
// Parse a path
import path from 'node:path';
path.parse('/dir/file.json');        // { dir, base: 'file.json', name: 'file', ext: '.json' }

// Portable line endings
import os from 'node:os';
text.split(os.EOL);

// HTTP status text
import http from 'node:http';
http.STATUS_CODES[400];              // 'Bad Request'

// Stringify an Error (own non-enumerable props are otherwise dropped)
JSON.stringify(err, Object.getOwnPropertyNames(err));

// Random token (sync form — no callback needed)
import crypto from 'node:crypto';
crypto.randomBytes(32).toString('hex');

// Inspect an object with colors
console.dir(obj, { colors: true });
```

Watch files/directories for changes — [`chokidar`](https://github.com/paulmillr/chokidar)
is still the robust cross-platform choice when `node --watch` isn't enough.
