# Claude Code

## Common settings

`~/.claude/settings.json` — pre-approve safe tools so sessions prompt less:

```json
{
  "permissions": {
    "allow": [
      "WebSearch",
      "WebFetch",
      "Bash(ls:*)",
      "Bash(find:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git push:*)"
    ],
    "deny": []
  }
}
```

## Multi-line prompts

```bash
# Heredoc (quote 'EOF' to prevent $variable expansion)
claude <<'EOF'
Your multi-line
prompt here
EOF

# From a file (works with @file references in the prompt)
claude < prompt.txt
cat prompt.txt | claude
```

## Claude in Chrome: multiple connected browsers

Multiple browsers may be connected and the default is often not this machine. Before any
browser work: `list_connected_browsers`, then `select_browser` the `isLocal: true` one.
If every page fails to load (screenshots too), re-check the browser selection before
debugging anything else. Put the rule in `~/.claude/CLAUDE.md` so it applies to every session.

## claude-trace

Record all Claude Code interactions while developing —
<https://github.com/badlogic/lemmy/tree/main/apps/claude-trace>.
Logs land in `.claude-trace/log-YYYY-MM-DD-HH-MM-SS.{jsonl,html}`.

```bash
npm install -g @mariozechner/claude-trace
claude-trace --include-all-requests
```
