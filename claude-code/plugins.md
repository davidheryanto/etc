# Claude Code Plugins

**Goal — use a plugin only when you need it, at zero context cost the rest of the time.**

An enabled plugin sits in context every turn; a disabled one costs nothing. So the pattern is:
**install once, keep it disabled, flip it on around the work that needs it, off when done.**

## TL;DR — the loop you'll forget

```bash
# turn it ON before the relevant work
/plugin enable <plugin>@<marketplace>
/reload-plugins

#  ... do the work ...

# turn it OFF when finished  → back to zero context cost
/plugin disable <plugin>@<marketplace>
/reload-plugins
```

- `/plugin list` — check what's installed and its enabled/disabled state.
- Same actions work from the terminal: `claude plugin enable|disable|list <plugin>@<marketplace>`.
- `/reload-plugins` is only needed for **in-session** toggles. A fresh session just loads the saved state.

## One-time install

```bash
/plugin install <plugin>@<marketplace>          # e.g. frontend-design@claude-plugins-official
/reload-plugins                                 # apply now (in-session)
claude plugin details <plugin>@<marketplace>    # components + projected token cost (terminal)
```

- `claude-plugins-official` is **built-in** — no `/plugin marketplace add` needed.
- Installing also **enables** it. Disable it straight after if you want it off by default.
- `claude plugin details` only works **after** install (errors "not found" before).

## Enable auto-update for third-party marketplaces

**Enable auto-update after installing from a third-party marketplace** — it's off by default.
Add the marketplace and install the plugin:

```bash
claude plugin marketplace add mattpocock/skills       # registers as "mattpocock"
claude plugin install mattpocock-skills@mattpocock
# enable auto-update inside Claude Code: /plugin → Marketplaces → mattpocock → Enable auto-update
```

- **Choose whose updates you trust.** Anthropic reviews each update in the official marketplace,
  which auto-updates by default. The repo's own marketplace follows the author's `main` branch.
- **Install from the repo's own marketplace when the official one lags.** The official
  marketplace pins plugins to commits Anthropic updates by hand (Oct 2026: `mattpocock-skills`
  held at 1.2.3, repo on 1.3.1). Compare `claude plugin list` → `Version` with the repo's latest
  release.
- **Load downloaded updates with `/reload-plugins` or start a new session.** Auto-update
  downloads changes after a session starts.
- Update now: `claude plugin update mattpocock-skills@mattpocock`.

## Bare `/skill` works — use `/plugin:skill` when a name is taken

**Type the short name**: `/grill-me`. The `/` menu lists the full command with the short alias in
parentheses, `/mattpocock-skills:grill-me (grill-me)`. The short name works unless another
command already uses it:

- **Use `/mattpocock-skills:code-review` for the plugin's review.** `/code-review` runs Claude
  Code's bundled review, including when another skill calls it.
- **Remove old personal copies when switching to a plugin:** run `skills remove -g <names>`.
  Copies with matching names compete with the plugin's short names.

## Choosing a scope

The installer asks where to install. Pick by who needs it:

| Scope | Available in | Shared via git | Pick when |
| --- | --- | --- | --- |
| **user** | all your projects | no | personal, general-purpose plugin (default choice) |
| **project** | this repo, all collaborators | yes — `.claude/settings.json` | the whole team should get it |
| **local** | this repo, only you | no — `.claude/settings.local.json` | repo-specific + personal |

Install **and** enabled/disabled state persist across sessions (stored in the scope's settings).

## Context cost — why bother disabling

| State | Cost per turn | Available |
| --- | --- | --- |
| **Enabled** | skill *description* (~tens of tokens) every turn; full body loads only when it fires | yes (auto + manual) |
| **Disabled** | **zero** | no |

`claude plugin details <plugin>` prints the projected numbers.
Example — frontend-design: **~80 tokens/turn** while enabled, **~2.7k** when actually invoked.

## Gotchas

- **In-session toggles need `/reload-plugins`.** Across a fresh session the saved state just applies.
- **`skillOverrides` does NOT apply to plugin skills** — it covers your own skills
  (`.claude/skills/`, `.claude/commands/`) and the bundled ones, never a plugin's. A plugin's
  *author* can ship a manual-only skill (`disable-model-invocation: true` in its frontmatter),
  but you can't add that without editing the plugin. Your only lever is `/plugin enable|disable` — no per-skill "installed but silent"
  middle state.
- Slash commands run **inside** a Claude session; `claude plugin …` runs in the **terminal** — same actions.

## Example — frontend-design

> "Create distinctive, production-grade frontend interfaces with high design quality.
> Generates creative, polished code that avoids generic AI aesthetics." (skill: `frontend-design`)

```bash
# install once (user scope)
/plugin install frontend-design@claude-plugins-official
/reload-plugins

# when building or polishing UI
/plugin enable frontend-design@claude-plugins-official
/reload-plugins
#   → the frontend-design skill is now available; use it on the HTML/CSS work

# when done  → zero context cost again
/plugin disable frontend-design@claude-plugins-official
/reload-plugins
```

Cost: ~80 tokens/turn enabled, ~2.7k when invoked.
