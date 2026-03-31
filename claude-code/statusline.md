# Statusline Setup

Shows: `🤖 Opus 4.5 | 💰 $1.45 | 📂 my-project | 🌿 main | 🧠 38k (19%) | 🔑 a1b2c3d4`

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
