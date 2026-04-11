# Statusline Setup

Shows: `🤖 Opus 4.6 (1M) | ⏳ 13% · 1h11m | 📂 my-project | 🌿 main | 🧠 38k (19%)`

The `⏳` segment shows 5-hour session usage % and time until reset (Pro/Max only,
populated after the first API response). Falls back to total cost otherwise.

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
