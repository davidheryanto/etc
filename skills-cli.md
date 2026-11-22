# The `skills` CLI (Vercel)

[`skills`](https://github.com/vercel-labs/skills) is Vercel's open-source CLI for installing
agent skills from any GitHub repo into Claude Code, Codex, Cursor and other agents. It also
searches the [skills.sh](https://skills.sh) registry.

**Why use it:**

- Works with any repo that has a `SKILL.md`, whether or not it ships a plugin.
- One command installs into several agents, which share one copy in `~/.agents/skills/`.
- You choose which skills to take from a repo, and can edit them locally.

**Use the repo's plugin instead when it has one:** plugins update themselves (but overwrite local
edits). See [plugins.md](claude-code/plugins.md) and
[codex.md](codex.md#plugins-update-from-git-at-every-session-start).

Useful skills to install: [agent-skills.md](agent-skills.md).

## TL;DR: the loop you'll forget

```bash
npm install -g skills                # install the CLI once (not npx each time)
skills add vercel-labs/agent-skills  # add from a repo (interactive: pick skills, scope, agents)
skills list -g                       # what's installed globally (bare `list` = project scope)
skills update -g <names>             # update only skills you've reviewed
```

## Install the CLI once, not via npx

`skills` is built to run via `npx`, but a tool you use repeatedly is safer installed once: a
mistyped name then fails with `command not found` instead of fetching and running a stranger's
package (see [node.md](node.md) → *Supply-chain safety*).

```bash
npm install -g skills            # verified publisher: vercel-labs
```

## Add skills

```bash
skills add <owner/repo>          # e.g. mattpocock/skills, vercel-labs/agent-skills
skills add <owner/repo> -l       # list what the repo offers, install nothing
skills add <owner/repo> -s a b   # install only named skills ('*' = all; space-separated, NOT "a,b")
skills add <owner/repo@skill>    # install one named skill directly
skills add <owner/repo> -g       # install globally (otherwise prompts for scope)
skills add <owner/repo> --all    # every skill, every agent, no prompts
skills find [query]              # fuzzy-search the whole registry (skills.sh), then add
```

`add` prompts for **which skills**, **scope** (global or project) and **which agents** (`-a`,
`*` = all). Inside an agent like Claude Code it skips the prompts and installs non-interactively.

**Name skills instead of ticking them in the picker.** `-l` shows the real names, then `-s a b`
installs them. It's faster on long lists and leaves a command you can repeat.

**Prefer the repo's own group in the picker.** When a repo ships `.claude-plugin/plugin.json`,
the picker groups the skills that manifest lists under the plugin's name and everything else under
**Other**. "Other" only means *not in the manifest* (for `mattpocock/skills`: in-progress, misc
and course-specific skills). Read an "Other" skill before taking it.

**Symlink (default) or copy.** Symlink keeps one copy in `~/.agents/skills/` and links each agent
to it, so an update reaches every agent. `--copy` writes straight into each agent's dir instead,
skipping the shared store. The `list` *Agents* column only checks that a folder of that name
exists in each agent's dir, not whether it's a symlink or the same content.

## Scope: global or project, nothing else

`-g` selects global. There is **no "local" scope**; that's a plugins concept.

| Scope | Means | Store + lock | Use when |
| --- | --- | --- | --- |
| **global** (`-g`) | user-level, all projects | `~/.agents/skills/` + `~/.agents/.skill-lock.json` | personal skills you want everywhere |
| **project** (default) | the current directory | `<repo>/skills-lock.json` + the repo's `.claude/skills/` | repo-specific; committable for the team |

**Pass `-g` whenever you mean global:** without a flag, each command picks scope differently.

| Command | No scope flag |
| --- | --- |
| `add` | prompts; with `-y` → **project**, even outside a repo |
| `list`, `remove` | **project**, no prompt |
| `update` (no names) | prompts Project / Global / Both; `-y` or non-TTY → project if it has skills, else global |
| `update <names>` | **both** scopes, no prompt |

## Update: applies immediately, no preview

**Don't blind-update.** `update` has no dry-run and no "proceed?" step: it rewrites every skill
whose upstream content changed, so a blanket update re-trusts whatever those repos contain *now*.
Check what you have, then update by name:

```bash
skills list -g                     # installed skills, grouped by source repo
skills update -g grilling handoff  # update only ones you've checked (names from `list`)
```

When you trust every source:

```bash
skills update            # everything; asks only for scope
skills update -g         # everything global, no prompt
```

Past the scope prompt it runs unattended, except to ask about a skill **deleted upstream**; `-y`
skips that too. Alias: `upgrade`.

## See what an update changed: track the store in git

The CLI shows no diff and keeps no old copy; the lock stores only a content hash. But the store
mirrors each skill's folder from its source repo, so a local git repo gives you the diff:

```bash
# once:
git -C ~/.agents/skills init && git -C ~/.agents/skills add -A && git -C ~/.agents/skills commit -m baseline

# after any update or add:
git -C ~/.agents/skills add -A              # stage first, so new skills and files show up
git -C ~/.agents/skills diff --cached       # everything changed since the last commit
git -C ~/.agents/skills commit -m reviewed  # when happy: next diff starts from here
```

Committing is optional; skip it and diffs accumulate. This covers the global store only;
project-scope and `--copy` installs live elsewhere.

No local setup? Read the upstream folder's history instead: the lock's `skillPath` names it, e.g.
`https://github.com/mattpocock/skills/commits/main/skills/productivity/grilling`.

## Remove a skill, or try one without installing

```bash
skills remove [name]       # no name → interactive picker; -g for global
skills use <repo>@<skill>  # print a skill's prompt WITHOUT installing it
```

## Security: a skill is instructions your agent will run

**Read a skill before you install it.** A `SKILL.md` can direct the agent to run commands, so vet
the source repo like any dependency and prefer known publishers (e.g. `vercel-labs`,
`mattpocock`).

**Check the yellow `overwrites:` line.** Skills are keyed by name per scope, so an `add` from
another repo can replace a same-named skill you already trust, and the lock's `source` silently
flips. That line in the install summary is your only cue: check *whose* skill you're replacing.

**A skill named like a Claude Code built-in replaces it, but not its aliases.** Install a
`code-review` skill and `/code-review` runs yours while `/review` still runs the built-in
([docs](https://code.claude.com/docs/en/skills.md)). Don't hide the built-in with
`skillOverrides: {"code-review": "off"}`: overrides match by name, so that hides yours too. Type
`/code-review` once and check the description is yours.

**Read why before trusting the risk table's colour.** `add` prints Gen / Socket / Snyk verdicts
per skill; they're pattern-matched heuristics. The reasons are at:

```text
https://skills.sh/<owner>/<repo>/<skill>/security/snyk
https://skills.sh/<owner>/<repo>/<skill>/security/agent-trust-hub   # the "Gen" column
```

Example: `mattpocock/skills@code-review` scored Snyk **High** only because it quotes diff hunks
verbatim, which would echo a secret if your diff contained one. Worth a closer look: a network
call, a script download, or an instruction to hide output.
