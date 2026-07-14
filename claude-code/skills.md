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
skills list -g                   # what's installed globally  (bare `list` = project scope)
skills update -g grilling handoff # update only named skills you've checked
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
skills add <owner/repo> -s "a,b" # install only named skills, no picker (* = all)
skills add <owner/repo@skill>    # install one named skill directly, no picker
skills add <owner/repo> -g       # force GLOBAL (otherwise prompts for scope)
skills add <owner/repo> --all    # every skill, every agent, no prompts
skills find [query]              # fuzzy-search the WHOLE registry (skills.sh), then add
```

`add` is interactive: it prompts for **which skills**, **scope** (global/project), and **which
agents** (`-a`, `*` = all). Install method is a choice: **symlink** (recommended — one shared source, updates in
place) or a per-agent **copy** (`--copy` forces it; a single-agent install copies; a
multi-agent install prompts which).

**Long lists garble the picker — name skills instead.** The multi-select prompt repaints by
walking the cursor back up over its own output, so a list taller than your terminal can't scroll:
frames stack into duplicated group headers and stale, repeated rows. It's the CLI's TUI, not your
terminal (any emulator shows it). Skip it — `-l` to read the real names, then `-s "a,b"` (or
`<repo@skill>`, or `--all`); or `skills find <query>` to fuzzy-search the whole registry (filtered =
short, so it never overflows). Enlarging the window / shrinking the font also works. (Running
*inside* an agent like Claude Code dodges it entirely: the CLI detects the agent and installs
non-interactively.)

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

## Update — applies immediately, no preview

`update` writes changes the moment it finds them — **no "proceed?" step and no dry-run** (and
`-g`/`-p`/`-y` skip even the scope prompt). It re-pulls each skill from its *current* source, so a
blind `skills update` re-trusts whatever those repos contain *now* — the same supply-chain
exposure as a fresh install, applied to everything at once. You see the `Updating …` lines only
*as it applies*, never before.

**So don't blind-update.** See what you have and from where, then update deliberately:

```bash
skills list -g                     # installed skills, grouped by source repo
skills update -g grilling handoff  # update only ones you've checked  (bare names from `list`)
```

Blanket-update is the shortcut for when you trust every source:

```bash
skills update            # everything; asks only for scope (global / project / both)
skills update -g         # everything global, no scope prompt
```

`update`'s alias is `upgrade`. Past the scope prompt it runs unattended — the one thing that can
still stop it is a skill **deleted upstream** (it asks whether to remove your local copy); add
`-y` to skip even that (CI/scripts).

## Seeing what changed — the CLI won't tell you

The CLI shows no diff on `update`. To see what actually landed, **track the store in git once,
then `git diff` when you care:**

```bash
# one-time setup (runs from any directory):
git -C ~/.agents/skills init && git -C ~/.agents/skills add -A && git -C ~/.agents/skills commit -m baseline

# after any `skills update`, whenever you're curious:
git -C ~/.agents/skills diff        # exactly what changed since the baseline
```

The baseline is your **"reviewed / known-good" marker**: `git diff` shows everything changed since
it. So re-commit whenever *you judge the current state a good baseline* — typically after you've
looked at a diff and you're happy with what landed. That resets the marker, and the next `git diff`
shows only what's new since:

```bash
git -C ~/.agents/skills diff                  # what changed since your last baseline
# ...reviewed, happy with it...
git -C ~/.agents/skills commit -am reviewed   # re-baseline → next diff starts fresh from here
```

It's a judgement call, not a mechanical step. Commit after an update you've vetted to keep future
diffs down to just-the-new-stuff; or leave it and let several updates accumulate into one diff —
whichever suits the moment. Either way is safe: forgetting to commit loses nothing, because the
update overwrote the files but the baseline commit still holds the old bytes.

**Why this is needed, and why it works.** `update` keeps no before-image to diff against: the lock
records only a content **hash** (`skillFolderHash`), not the upstream commit it pulled, and files
are overwritten in place. Worse, **"✓ Updated N skill(s)" does not mean N skills changed** — it
re-pulls and rewrites *every* skill it checks and reports each "Updated" regardless of whether a
byte differs (green ticks mean *re-synced*, not *new content*). The store is diffable anyway
because the CLI copies each source repo's folder **verbatim**: `~/.agents/skills/<name>` is a
byte-for-byte copy of that skill's folder in its source repo — which is what makes the local git
repo above meaningful.

**Alternative — read the source repo's history** (no local setup): each skill's folder is the
lock's `skillPath`; view that folder's commits upstream:

```bash
# skillPath e.g. skills/productivity/grilling/SKILL.md → view its folder's history:
https://github.com/mattpocock/skills/commits/main/skills/productivity/grilling
```

Caveats: the git repo tracks the **global** store (`~/.agents/skills`), covering `skills update -g`
and the global half of a bare `update`; project-scope skills live under a repo's own
`./.agents/skills`, not covered here. (A `skills` shell wrapper could auto-print the diff on every
update, but that's automation to maintain — the manual repo stays transparent.)

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
