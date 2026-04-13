# Claude Code Worktree

Isolated copy of the repo with its own branch and files.
Two workflows depending on whether you're starting new work or reviewing existing work.

## Starting New Work

```bash
claude -w                    # auto-named worktree
claude -w feature-auth       # named worktree
```

- Creates a **new** branch `worktree-<name>` off `origin/HEAD`
- Creates directory at `.claude/worktrees/<name>/`
- Auto-cleaned if no changes on exit; prompts to keep/remove if changes exist
- Non-tracked files (.env, etc.) are NOT copied — use a `.worktreeinclude` file or SessionStart hook

## Reviewing an Existing Branch (MR/PR)

`claude -w` always creates a **new** branch off `origin/HEAD` — it won't checkout an existing branch.
To review someone's branch, use git directly.

Example — reviewing a colleague's `fix-auth` branch:

```bash
# Run from the main repo
git fetch origin fix-auth
git worktree add ../review-fix-auth fix-auth

# Work in the worktree
cd ../review-fix-auth
claude

# Cleanup: must run from the main repo, not from inside the worktree
cd /path/to/main-repo
git worktree remove ../review-fix-auth
```

**`claude -w`** — creates new branch off `origin/HEAD`, auto-cleanup on exit
**`git worktree add`** — checks out existing branch, manual cleanup with `git worktree remove`

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
