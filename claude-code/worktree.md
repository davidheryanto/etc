# Claude Code Worktree

Isolated copy of the repo with its own branch and files.
Two workflows depending on whether you're starting new work or reviewing existing work.

## Starting New Work

```bash
claude -w                    # auto-named worktree
claude -w feature-auth       # named worktree (reused if it already exists)
claude -w "#1234"            # checkout PR 1234 into .claude/worktrees/pr-1234/
claude -w --tmux             # pair the worktree with its own tmux session
```

- Creates a **new** branch `worktree-<name>` off the repo's default branch
  (configurable: `worktree.baseRef` in settings — `"fresh"` = default branch (default), `"head"` = current work)
- Creates directory at `.claude/worktrees/<name>/`
- Reusing an existing name opens that worktree; beware — with the default `"fresh"` base,
  a clean reused worktree is reset to the default branch
- Cleanup on exit: unnamed + clean → auto-removed; named or dirty → prompts to keep/remove.
  With `-p` (non-interactive) no cleanup happens — `git worktree remove` manually
- Prerequisite: directory must be trusted already (run plain `claude` once first) or `-w` errors
- Non-tracked files (.env, etc.) are NOT copied — use a `.worktreeinclude` file or SessionStart hook

## Reviewing an Existing Branch (MR/PR)

For a GitHub PR, the flag handles it directly: `claude -w "#1234"`.
For a non-PR branch, `claude -w` won't checkout an existing branch — use git directly.

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

**`claude -w`** — new branch off default branch (or PR via `#N`), auto-cleanup on exit
**`git worktree add`** — checks out existing branch, manual cleanup with `git worktree remove`

## .worktreeinclude

Gitignore-style patterns in a `.worktreeinclude` file at the repo root; matching files
are copied into every new worktree. Simpler than the SessionStart hook for the plain
`.env` case — the hook is only needed for dynamic/conditional logic.

```
# .worktreeinclude
.env
.env.*
config/local.json
```

- A file is copied only if it matches a pattern **and** is gitignored
  (tracked files come with the branch already)
- Snapshot at worktree creation time — later changes to the originals don't sync

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
