# Claude Code Agent Skills (the `skills` CLI)

**Goal — install reusable agent skills from a GitHub repo once, into whichever agents you choose.**

[`skills`](https://github.com/vercel-labs/skills) pulls `SKILL.md` packages from a GitHub repo
into a shared, agent-agnostic store (`~/.agents/skills/`) and **installs** them into each agent's
own skills dir — for Claude Code that's `~/.claude/skills/`. One store, fanned out to the agents
you target.

## TL;DR — the loop you'll forget

```bash
npm install -g skills            # install the CLI ONCE (not npx-each-time — see below)
skills add mattpocock/skills     # add from a repo (interactive: pick skills, scope, agents)
skills update                    # update installed skills to latest from their source
skills list -g                   # what's installed globally  (bare `list` = project scope)
```

## Install the CLI safely

`skills` is built to run via `npx`, but a tool you use repeatedly is safer installed once — a
mistyped name then fails with `command not found` instead of fetching and running a stranger's
package (full reasoning: [node.md](../node.md) → *Supply-chain safety*):

```bash
npm install -g skills            # verified publisher: vercel-labs
```

## Add skills

```bash
skills add <owner/repo>          # e.g. mattpocock/skills, vercel-labs/agent-skills
skills add <owner/repo> -l       # list what the repo offers, install nothing
skills add <owner/repo> -g       # force GLOBAL (otherwise prompts for scope)
skills add <owner/repo> --all    # every skill, every agent, no prompts
skills find [query]              # search for skills interactively
```

`add` is interactive: it prompts for **which skills**, **scope** (global/project), and **which
agents** (`-a`, `*` = all). Install method is a choice: **symlink** (recommended — one shared source, updates in
place) or a per-agent **copy** (`--copy` forces it; a single-agent install copies; a
multi-agent install prompts which).

## Scope — just two: global (= user-level) or project

One boolean, `-g`. There is **no "local" scope** — that's a *plugins* concept
([plugins.md](plugins.md) uses user/project/local); the `skills` CLI has only these two:

| Scope | Means | Store + lock | Use when |
| --- | --- | --- | --- |
| **global** (`-g`) | user-level, `~/` (all projects) | `~/.agents/skills/` + `~/.agents/.skill-lock.json`, exposed in `~/.claude/skills/` | personal skills you want everywhere |
| **project** (`-p`) | the current directory | `<repo>/skills-lock.json` (+ the repo's `.claude/skills/`) | repo-specific; committable for the team |

Without `-g`/`-p`, commands **prompt** for scope (or under `-y` auto-detect: project if you're in
a project dir, else global). `update` also offers a **both** option — a convenience, not a third
scope. One copy lives in `~/.agents/skills/`; each agent you pick with `-a` is wired to it — Claude
Code at `~/.claude/skills/` (symlink or `--copy`; see *Add skills*). Heads-up: the `list` *Agents* column and the lock's
`lastSelectedAgents` reflect your *selection*, not verified file locations — don't read install
paths from them (`lastSelectedAgents` just pre-fills the next agent prompt).

## Update — auto-applies, no confirmation

`update` writes changes the moment it finds them — there is **no "proceed?" step**. The only
interactive gate is the scope prompt, and `-g`/`-p`/`-y` skip even that, so those run fully
unattended:

```bash
skills update            # all skills; asks only for scope (global / project / both)
skills update -g         # ALL global skills, auto-applied, no prompt      (-p = project)
skills update -y         # skip the scope prompt (auto-detects project vs global)
```

To update only some, **list what you have first** to get the exact names, then target them
(still auto-applied — just limited to the ones you name):

```bash
skills list -g                     # installed names  (bare `list` = project scope)
skills update -g grilling handoff  # by bare name (from `list`) — not the owner/repo
```

`update` re-pulls each skill from its source repo (alias `upgrade`). It pauses to ask in just
one case: a skill **deleted upstream** → it asks whether to remove your local copy.

## Remove / use

```bash
skills remove [name]       # remove a skill (no name → interactive picker; -g for global)
skills use <repo>@<skill>  # print a prompt for a skill WITHOUT installing it
```

## Security — a skill is instructions your agent will run

Installing a skill means trusting that repo's `SKILL.md`, which can direct the agent to execute
commands. Vet the source repo like any dependency, prefer named publishers (e.g. `vercel-labs`,
`mattpocock`), and **never** pass `--dangerously-accept-openclaw-risks` (unverified community
skills) on something you haven't read. For the CLI itself, install once and read the name at any
prompt — see [node.md](../node.md).

**Name-shadowing.** Skills are keyed by name per scope, so an `add` from another repo can
overwrite a same-named skill you already trust — the lock's `source` silently flips to the new
one. The yellow `overwrites:` line in the install summary is your only cue, so when you see it,
check *whose* skill you're replacing before confirming.
