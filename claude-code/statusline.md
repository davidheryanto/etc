# Statusline Setup

Shows: `🤖 Opus 5.5 · high | ⏳ 13% · 1h11m | 📂 my-project | 🌿 main* ↑2 | 🧠 38k (19%)`

The `⏳` segment shows 5-hour session usage % and time until reset (Pro/Max only,
populated after the first API response). Falls back to total cost otherwise.

The `🌿` segment shows the branch, plus only what needs attention:

| Shows | Meaning |
|---|---|
| `main` | Clean and level with upstream |
| `main*` | Uncommitted changes (staged, unstaged or untracked) |
| `main ↑2` | 2 commits to push |
| `main ↓3` | 3 commits to pull, as of the last `git fetch` |
| `main ↑?` | No upstream yet (never pushed, or upstream deleted) |
| `@003acfc` | Detached HEAD |

Git never fetches on its own, so `↓` is only as fresh as your last fetch, pull or push.
The script runs `git status` in the session's directory, so worktrees show their own state.

## Quick Setup

```bash
# Copy script
cp statusline.py ~/.claude/statusline.py
chmod +x ~/.claude/statusline.py

# Add to settings (create file if needed)
cat >> ~/.claude/settings.json << 'EOF'
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.py"
  }
}
EOF
```

If `~/.claude/settings.json` already exists, manually add the `statusLine` block.

## Reference

- https://code.claude.com/docs/en/statusline
