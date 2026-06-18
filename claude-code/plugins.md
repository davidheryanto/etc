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
- **`skillOverrides` / `disable-model-invocation` do NOT apply to plugin skills** — those are only
  for *your own* skills in `.claude/skills/` or `.claude/commands/`. For a plugin the only lever is
  `/plugin enable|disable`, so there is no "installed but silent / manual-only" middle state.
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
