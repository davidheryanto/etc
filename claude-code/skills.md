# Claude Code Agent Skills (the `skills` CLI)

**Goal — install reusable agent skills from a GitHub repo once, into whichever agents you choose.**

[`skills`](https://github.com/vercel-labs/skills) pulls `SKILL.md` packages from a GitHub repo
into a shared, agent-agnostic store (`~/.agents/skills/`) and **installs** them into each agent's
own skills dir — for Claude Code that's `~/.claude/skills/`. One store, fanned out to the agents
you target.

**Prefer a repo's plugin for automatic updates.** For example, `mattpocock/skills` provides a
plugin for Claude Code and Codex: follow the [Claude Code plugin setup](plugins.md) or the
[Codex plugin setup](../codex.md#plugins-update-from-git-at-every-session-start). Use the
`skills` CLI when no plugin is available, or when you want to select, edit or review individual
skills — plugin updates overwrite local edits.

## TL;DR — the loop you'll forget

```bash
npm install -g skills            # install the CLI once (not npx each time)
skills add vercel-labs/agent-skills  # add from a repo (interactive: pick skills, scope, agents)
skills list -g                   # what's installed globally  (bare `list` = project scope)
skills update -g <names>         # update only skills you've reviewed
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
skills add <owner/repo> -s a b   # install only named skills, no picker ('*' = all; space-separated, NOT "a,b")
skills add <owner/repo@skill>    # install one named skill directly, no picker
skills add <owner/repo> -g       # force GLOBAL (otherwise prompts for scope)
skills add <owner/repo> --all    # every skill, every agent, no prompts
skills find [query]              # fuzzy-search the WHOLE registry (skills.sh), then add
```

`add` is interactive: it prompts for **which skills**, **scope** (global/project), and **which
agents** (`-a`, `*` = all). Install method is a choice: **symlink** (recommended — one shared source, updates in
place, the default) or a per-agent **copy** (`--copy` forces it; a multi-agent install
without `-y` prompts which).

**Long lists: name skills instead of scrolling the picker.** Up to 1.5.x the multi-select prompt
couldn't scroll a list taller than the terminal, so frames stacked into duplicated group headers
and stale rows. 1.7.0 fits the frame to the terminal height and scrolls a window instead. Naming
skills is still faster and leaves a command you can repeat: `-l` to read the real names, then
`-s a b` (or `<repo@skill>`, or `--all`); or `skills find <query>` to fuzzy-search the whole
registry. (Running *inside* an agent like Claude Code skips the picker: the CLI detects the agent
and installs non-interactively.)

**Grouped picker — manifest vs "Other".** When a repo ships a `.claude-plugin/plugin.json`, the
picker groups the skills that manifest lists under its plugin `name`, and every other `SKILL.md`
it finds under **Other**. Nothing starts ticked. "Other" only means *not in the manifest* —
for `mattpocock/skills` that's in-progress, misc and course-specific skills, but don't assume
it in general. Prefer the manifest group; read an "Other" skill before taking it.

## Scope — just two: global (= user-level) or project

`-g` selects global. There is **no "local" scope** — that's a *plugins* concept
([plugins.md](plugins.md) uses user/project/local); the `skills` CLI has only these two:

| Scope | Means | Store + lock | Use when |
| --- | --- | --- | --- |
| **global** (`-g`) | user-level, `~/` (all projects) | `~/.agents/skills/` + `~/.agents/.skill-lock.json`, exposed in `~/.claude/skills/` | personal skills you want everywhere |
| **project** (default; `-p` on `update`) | the current directory | `<repo>/skills-lock.json` (+ the repo's `.claude/skills/`) | repo-specific; committable for the team |

Each command decides scope differently without a flag, so **pass `-g` whenever you mean global**:

| Command | No scope flag |
| --- | --- |
| `add` | prompts Project / Global; with `-y` → **project**, even outside a repo |
| `list`, `remove` | **project**, no prompt |
| `update` (no names) | prompts Project / Global / Both; `-y` or non-TTY → project if it has skills, else global |
| `update <names>` | **both** scopes, no prompt |

`-p` exists only on `update`; "both" is a convenience, not a third scope.

**Symlink mode** keeps one copy in `~/.agents/skills/` and links each agent you pick with `-a` to
it — Claude Code at `~/.claude/skills/`. **Copy mode** (`--copy`) skips
the shared store and writes straight into the agent's dir, so a Claude-only copy lives *only* in
`~/.claude/skills/`. The `list` *Agents* column checks which agent dirs have a folder by that
name — not whether it's a symlink or the same content. The lock's `lastSelectedAgents` is
separate: it only pre-fills the next agent prompt.

## Update — applies immediately, no preview

`update` writes changes the moment it finds them — **no "proceed?" step and no dry-run** (and
`-g`/`-p`/`-y` or named skills skip even the scope prompt). It checks each skill against its
*current* source and rewrites every one whose content hash changed, so a blind `skills update`
re-trusts whatever those repos contain *now* — the same supply-chain exposure as a fresh install,
applied to everything at once. You see the `Updating …` lines only *as it applies*, never before.

**So don't blind-update.** See what you have and from where, then update deliberately:

```bash
skills list -g                     # installed skills, grouped by source repo
skills update -g grilling handoff  # update only ones you've checked  (bare names from `list`)
```

Blanket-update is the shortcut for when you trust every source:

```bash
skills update            # everything; asks only for scope (project / global / both)
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

# after any `skills update` or `add`, whenever you're curious:
git -C ~/.agents/skills add -A               # stage, so NEW skills/files show up too
git -C ~/.agents/skills diff --cached        # exactly what changed since the baseline
```

Stage first: plain `git diff` ignores untracked files, so a newly added skill (or a new file
inside one) would never appear. The baseline is your **"reviewed / known-good" marker**: the
staged diff shows everything changed since it. So re-commit whenever *you judge the current state
a good baseline* — typically after you've looked at a diff and you're happy with what landed. That
resets the marker, and the next diff shows only what's new since:

```bash
git -C ~/.agents/skills add -A && git -C ~/.agents/skills diff --cached
# ...reviewed, happy with it...
git -C ~/.agents/skills commit -m reviewed    # re-baseline → next diff starts fresh from here
```

It's a judgement call, not a mechanical step. Commit after an update you've vetted to keep future
diffs down to just-the-new-stuff; or leave it and let several updates accumulate into one diff —
whichever suits the moment. Either way is safe: forgetting to commit loses nothing, because the
update overwrote the files but the baseline commit still holds the old bytes.

**Why this is needed, and why it works.** `update` keeps no before-image to diff against: the lock
records only a content **hash** (`skillFolderHash`), not the upstream commit it pulled, and files
are overwritten in place. (As of 1.7.0 it compares that hash first, so "Updated N skill(s)" means
N changed for **global** updates, and an idle run says "All global skills are up to date".
*Project* updates still reinstall every tracked skill without comparing, so there "Updated" means
re-synced, not changed — as it did everywhere in earlier versions.) The store is diffable anyway because the CLI copies each skill's folder
**almost verbatim**: `~/.agents/skills/<name>` matches that folder in its source repo, minus
`.git/`, `__pycache__/`, `__pypackages__/` and `metadata.json`, with symlinks resolved to
real files — which is what makes the local git repo above meaningful.

**Alternative — read the source repo's history** (no local setup): each skill's folder is the
lock's `skillPath`; view that folder's commits upstream:

```bash
# skillPath e.g. skills/productivity/grilling/SKILL.md → view its folder's history:
https://github.com/mattpocock/skills/commits/main/skills/productivity/grilling
```

Caveats: the git repo tracks the **global** store (`~/.agents/skills`), covering `skills update -g`
and the global half of a bare `update`; project-scope skills live under a repo's own
`./.agents/skills`, and `--copy` installs live only in the agent's dir — neither is covered here. (A `skills` shell wrapper could auto-print the diff on every
update, but that's automation to maintain — the manual repo stays transparent.)

## Remove / use

```bash
skills remove [name]       # remove a skill (no name → interactive picker; -g for global)
skills use <repo>@<skill>  # print a prompt for a skill WITHOUT installing it
```

## Security — a skill is instructions your agent will run

Installing a skill means trusting that repo's `SKILL.md`, which can direct the agent to execute
commands. Vet the source repo like any dependency, prefer named publishers (e.g. `vercel-labs`,
`mattpocock`), and read a skill before you install it. For the CLI itself, install once and read
the name at any prompt — see [node.md](../node.md). (Older versions had
`--dangerously-accept-openclaw-risks` for unverified community skills; 1.7.0 no longer has it.)

**Name-shadowing.** Skills are keyed by name per scope, so an `add` from another repo can
overwrite a same-named skill you already trust — the lock's `source` silently flips to the new
one. The yellow `overwrites:` line in the install summary is your only cue, so when you see it,
check *whose* skill you're replacing before confirming.

**Clashing with a Claude Code bundled skill.** A skill named like a bundled command (e.g.
`code-review`) **replaces** that command, but not its aliases: `/code-review` runs yours,
`/review` still runs the built-in
([docs](https://code.claude.com/docs/en/skills.md)). Don't reach for `skillOverrides:
{"code-review": "off"}` to hide the built-in — overrides are keyed by **name**, so that hides
yours too. `disableBundledSkills: true` turns off the bundled skills wholesale (`/doctor` stays
typable unless you also hide it with `"doctor": "off"`). Usually: install, let
yours win, then type `/code-review` once and check the description is yours.

**Reading the Security Risk Assessments table.** `add` prints Gen / Socket / Snyk verdicts per
skill. These are pattern-matched heuristics — read *why* before trusting the colour:

```text
https://skills.sh/<owner>/<repo>/<skill>/security/snyk
https://skills.sh/<owner>/<repo>/<skill>/security/agent-trust-hub   # the "Gen" column
```

Example: `mattpocock/skills@code-review` scored Snyk **High** (W007) only because it quotes diff
hunks verbatim — which would echo a secret *if your diff contained one*. Gen flagged it for
running `git diff <ref>` on user input. Neither is a malicious instruction. Flags worth a closer
read are a network call, a script download or an instruction to hide output: check where it
goes, what data it sends and what runs, before you decide.
