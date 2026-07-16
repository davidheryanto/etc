# Codex CLI cheatsheet

> Personal cheatsheet — OpenAI Codex CLI (`codex-cli` 0.144.5; checked 2026-07-16).
> Cross-checked against the current official docs plus local `--help`, feature, and
> model-catalog output. `--full-auto` is rejected by interactive `codex`, but remains
> a deprecated `codex exec` compatibility flag; use an explicit sandbox instead.

## Contents

- **Install & login** — standalone installer or npm, ChatGPT OAuth or API key
- **Pick model & reasoning effort** — `-m` for model, `-c model_reasoning_effort=...` for effort
- **Fast / priority mode — `service_tier`** — `fast` = 1.5× speed, more usage; unset = normal
- **`-c` overrides a config key** — dotted paths, TOML values, quoting
- **Control autonomy — sandbox & approvals** — `-s`, `-a`, live `--search`, `--add-dir`
- **Script it — `codex exec`** — non-interactive runs, stdin, `--json`, `-o`
- **Resume & fork sessions** — `resume --last`, picker, `fork`
- **Make it permanent — config.toml & profiles** — defaults; `-p name` as a preset shortcut

## Install & login

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh  # official macOS/Linux installer
npm install -g @openai/codex   # npm alternative (see node.md for supply-chain setup)
codex update                   # update when the installed release supports self-update
codex login                    # browser OAuth with your ChatGPT account
codex login status             # exit code 0 when credentials are present
```

API key instead of ChatGPT account: `printenv OPENAI_API_KEY | codex login --with-api-key`.

`codex doctor` diagnoses install/config/auth when something is off.

## Pick model & reasoning effort

`-m/--model` picks the model; reasoning effort has **no dedicated flag** — set it as a
config override with `-c`:

```bash
codex -m gpt-5.6-sol -c model_reasoning_effort=high
```

The set is model-dependent. The current `gpt-5.6-sol` catalog lists `low` |
`medium` | `high` | `xhigh` | `max` | `ultra`; `/model` switches model and effort
mid-session. Ultra adds automatic task delegation, so it is more than a normal
single-agent reasoning level.

Default gotcha: the official models page labels **medium** as the default, while
`codex debug models` on 0.144.5 reports `default_reasoning_level: low`. Set the
effort explicitly when reproducibility matters.

## Fast / priority mode — `service_tier`

Also a config key, not a flag. `fast` requests priority processing — the model
catalog (`codex debug models`) describes it as **"1.5x speed, increased usage"**,
and the config reference says legacy `fast` maps to the request value `priority`.
Normal priority is the key **unset**, not a value:

```bash
codex -c service_tier=fast
```

In the TUI, `/fast on` / `/fast off` / `/fast status` toggle it per session. To
persist it, the docs pair `service_tier = "fast"` with `[features] fast_mode = true`
(`fast_mode` is stable and enabled in 0.144.5). With ChatGPT sign-in, GPT-5.6
fast mode consumes credits at 2.5× the Standard rate. With API-key auth, normal
API token pricing applies instead; the ChatGPT credit multiplier does not.

Gotcha: `service_tier` is intentionally a string because model catalogs may provide
additional tier IDs. `--strict-config` catches unknown config fields, not unknown
catalog tier IDs; check `codex debug models` when in doubt.

## `-c` overrides a config key

`-c key=value` overrides anything from `~/.codex/config.toml` for this run only.
Dotted paths reach nested tables. The value is parsed as TOML; if that fails, it is
taken as a literal string — so bare words work without quoting:

```bash
codex -c model_reasoning_effort=high                  # bare word → literal string
codex -c 'model="gpt-5.6-sol"'                      # explicit TOML string
codex -c shell_environment_policy.inherit=all         # dotted path into a table
codex -c 'mcp_servers.context7.enabled=false'         # disable one MCP server
```

Values that *are* valid TOML but not what you meant need quoting — e.g. an unquoted
`true`/`false`/number parses as that TOML type, not a string.

## Control autonomy — sandbox & approvals

Two independent dials: what Codex **can touch** (`-s/--sandbox`) and when it **asks
you** (`-a/--ask-for-approval`).

```bash
codex -s workspace-write -a on-request   # write inside the repo, ask when unsure (good default)
codex -s read-only -a never              # inspect only; blocked actions fail instead of prompting
codex --add-dir ../other-repo            # extra writable root in workspace-write mode
codex --search                           # switch search from default cached to live
```

The columns below are unrelated — any `-s` combines with any `-a`:

| `-s` sandbox | `-a` approval |
| --- | --- |
| `read-only` | `untrusted` — only known-safe commands run unasked |
| `workspace-write` | `on-request` — model decides when to ask |
| `danger-full-access` | `never` — failures go back to the model |

`--dangerously-bypass-approvals-and-sandbox` disables **both** dials at once — Codex
runs anything, anywhere, unprompted. Only inside a container/VM that is itself the
sandbox; on your real machine one bad command owns your home directory. Prefer
`--add-dir` over reaching for `danger-full-access`.

## Script it — `codex exec`

Non-interactive one-shot runs (alias `codex e`). Prompt from the argument or stdin:

```bash
codex exec "summarize the repository"                 # read-only sandbox by default
codex exec -s workspace-write "fix the tests, then run them"
git diff | codex exec "review this diff"              # piped stdin is appended to the prompt
codex exec --json "..."                               # JSONL events on stdout
codex exec -o /tmp/last.md "..."                      # file plus normal stdout
codex exec --ephemeral "..."                          # don't persist session rollout files
codex exec --skip-git-repo-check "..."                # allow running outside a git repo
codex exec resume --last "now update the changelog"   # continue the last exec session
```

The official docs say `codex exec` defaults to a read-only sandbox. Most common
flags apply (`-m`, `-c`, `-p`, `-s`, `-C`, `--add-dir`), but `exec` has no direct
`-a` or `--search` option. Use the corresponding config keys explicitly:

```bash
codex exec -m gpt-5.6-sol -c model_reasoning_effort=high -s workspace-write "..."
codex exec -c approval_policy=never -c web_search=live "..."
```

## Resume & fork sessions

```bash
codex resume            # picker of past sessions in this directory
codex resume --last     # continue the most recent one
codex resume --all      # picker across all directories
codex fork --last       # branch off a past session without touching it
```

## Make it permanent — config.toml & profiles

Flags you type every time belong in `~/.codex/config.toml`:

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "high"
service_tier = "fast"
sandbox_mode = "workspace-write"
approval_policy = "on-request"
```

A profile is a named preset: a separate `~/.codex/<name>.config.toml` layered on top
of the base config with `-p/--profile <name>`. Use one per recurring flag combo —
e.g. a prioritised high-effort preset and a default-priority medium one.

`~/.codex/sol-high-fast.config.toml`:

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "high"
service_tier = "fast"
```

`~/.codex/sol-medium.config.toml`:

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "medium"
# no service_tier → normal priority (as long as the base config doesn't set one)
```

```bash
codex -p sol-high-fast   # = -m gpt-5.6-sol -c model_reasoning_effort=high -c service_tier=fast
codex -p sol-medium
```

Profiles **layer on top** of the base config — any key a profile omits inherits the
base value. So keep `service_tier` out of `~/.codex/config.toml` and set it only in
the profiles that want it; a base `service_tier = "fast"` leaks into every profile.

Gotchas (verified on 0.144.5):

- **Profile names can't contain dots** — `-p 5.6-sol-high` is rejected ("pass a
  plain name such as `work`"); official docs allow letters, digits, hyphens, and
  underscores.
- **Legacy `[profiles.name]` tables and top-level `profile = "name"` are no longer
  supported** as of 0.134.0; move each preset to `~/.codex/name.config.toml`.

Precedence, highest first (**project beats profile**):
CLI flags (`-c`, `-m`, …) → project `.codex/config.toml` (trusted projects only)
→ profile → user `~/.codex/config.toml` → system `/etc/codex/config.toml`
→ built-in defaults.

## Official references

- [Codex CLI overview and installation](https://developers.openai.com/codex/cli)
- [CLI command reference](https://developers.openai.com/codex/cli/reference)
- [Authentication](https://developers.openai.com/codex/auth)
- [Models](https://developers.openai.com/codex/models)
- [Fast mode](https://developers.openai.com/codex/agent-configuration/speed)
- [Non-interactive mode](https://developers.openai.com/codex/non-interactive-mode)
- [Config basics](https://developers.openai.com/codex/config-file/config-basic)
- [Advanced config and profiles](https://developers.openai.com/codex/config-file/config-advanced)
- [Config reference](https://developers.openai.com/codex/config-reference)
- [Sandboxing and approvals](https://developers.openai.com/codex/sandboxing)
