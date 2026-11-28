# Claude Code

## Settings

See [claude-code/settings.md](claude-code/settings.md): permissions allowlist and hiding
commit/PR attribution.

## Microsoft Foundry (Azure)

See [claude-code/microsoft-foundry.md](claude-code/microsoft-foundry.md): a `claude-az` shell
function for pay-per-token Claude on Azure with Entra sign-in, next to the subscription `claude`.

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

## Claude in Chrome

See [claude-code/browser.md](claude-code/browser.md): which browser Claude drives, and
the `~/.claude/CLAUDE.md` rule that pins it to this machine.

## claude-trace

Record all Claude Code interactions while developing —
<https://github.com/badlogic/lemmy/tree/main/apps/claude-trace>.
Logs land in `.claude-trace/log-YYYY-MM-DD-HH-MM-SS.{jsonl,html}`.

```bash
npm install -g @mariozechner/claude-trace
claude-trace --include-all-requests
```
