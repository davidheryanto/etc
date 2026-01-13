#!/usr/bin/env python3
"""
Claude Code statusline script.

Shows: model, cost, directory, git branch, token usage (percentage from builtin).

Token display uses input_tokens + cache tokens (excludes output which folds into next turn).
Percentage uses Claude Code's builtin used_percentage field.
"""
import json, sys, subprocess, os

d = json.load(sys.stdin)

# Get short directory name
cwd = os.path.basename(d.get('cwd', os.getcwd()))
model = d['model']['display_name']
cost = d['cost']['total_cost_usd']
cw = d['context_window']
u = cw['current_usage']
tokens = u['input_tokens'] + u['cache_creation_input_tokens'] + u['cache_read_input_tokens']
pct = cw['used_percentage']

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
