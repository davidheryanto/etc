#!/usr/bin/env python3
"""
Claude Code statusline script.

Token calculation (matches Claude Code's internal implementation):
  tokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens

output_tokens excluded because they fold into next turn's input.
Auto-compact triggers at ~40-45K buffer based on this input count.

References:
- https://code.claude.com/docs/en/statusline (setup & JSON schema)
- https://platform.claude.com/docs/en/build-with-claude/context-windows
"""
import json, sys, subprocess, os

d = json.load(sys.stdin)

# Get short directory name
cwd = os.path.basename(d.get('cwd', os.getcwd()))
model = d['model']['display_name']
cost = d['cost']['total_cost_usd']
u = d['context_window']['current_usage']
tokens = u['input_tokens'] + u['cache_creation_input_tokens'] + u['cache_read_input_tokens']
pct = tokens * 100 // d['context_window']['context_window_size']

# Get git branch if in a git directory
branch = ""
try:
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        capture_output=True, text=True, timeout=1
    )
    if result.returncode == 0 and result.stdout.strip():
        branch = f" | 🌿 {result.stdout.strip()}"
except:
    pass

tokens_k = f"{tokens // 1000}k" if tokens >= 1000 else str(tokens)
print(f"🤖 {model} | 💰 ${cost:.2f} | 📂 {cwd}{branch} | 🧠 {tokens_k} ({pct}%)")
