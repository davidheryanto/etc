# Claude Code Worktree

Isolated copy of the repo with its own branch and files.

```bash
claude -w                    # auto-named worktree
claude -w feature-auth       # named worktree
```

- Creates directory at `.claude/worktrees/<name>/`
- Creates branch `worktree-<name>`
- Auto-cleaned if no changes on exit; prompts to keep/remove if changes exist
- Non-tracked files (.env, etc.) are NOT copied — use a SessionStart hook

## Worktree .env Setup (SessionStart hook)

```json
// .claude/settings.local.json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "GIT_DIR=$(git rev-parse --git-dir 2>/dev/null); GIT_COMMON=$(git rev-parse --git-common-dir 2>/dev/null); [ \"$GIT_DIR\" = \"$GIT_COMMON\" ] && exit 0; [ -f .env ] && exit 0; cp \"${GIT_COMMON%/.git}/.env\" .env 2>/dev/null; exit 0"
      }]
    }]
  }
}
```

Logic: detect worktree via git → skip if .env exists → copy from main repo.

## Large Monorepos — Sparse Checkout

```json
// .claude/settings.json
{
  "worktree": {
    "sparsePaths": ["src/services", "packages/api"]
  }
}
```

## Subagent Worktrees

In agent frontmatter:

```markdown
---
isolation: worktree
---
```

Or when spawning: `Agent(isolation: "worktree")`.
Auto-cleaned if no changes; worktree path and branch returned if changes made.
