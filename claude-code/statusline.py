#!/usr/bin/env python3
"""
Claude Code statusline script.

Shows: model, 5-hour session usage + reset countdown, directory, git branch, context tokens.

Session segment uses rate_limits.five_hour (Pro/Max only, present after first API response).
Falls back to cost if rate_limits is absent (API plans, or before first response).

References:
- https://code.claude.com/docs/en/statusline (setup & JSON schema)
"""
import json, sys, subprocess, os, time

d = json.load(sys.stdin)

cwd = os.path.basename(d.get('cwd', os.getcwd()))
model = d['model']['display_name'].replace('(1M context)', '(1M)')
cw = d['context_window']
u = cw.get('current_usage') or {}
tokens = u.get('input_tokens', 0) + u.get('cache_creation_input_tokens', 0) + u.get('cache_read_input_tokens', 0)
pct = cw.get('used_percentage') or 0

# Session segment: 5h usage % + time until reset, fall back to cost
five_hour = (d.get('rate_limits') or {}).get('five_hour')
if five_hour:
    used = int(five_hour.get('used_percentage') or 0)
    diff = int((five_hour.get('resets_at') or 0) - time.time())
    if diff > 0:
        h, m = diff // 3600, (diff % 3600) // 60
        when = f"{h}h{m:02d}m" if h else f"{m}m"
        session = f"⏳ {used}% · {when}"
    else:
        session = f"⏳ {used}%"
else:
    session = f"💰 ${d['cost']['total_cost_usd']:.2f}"

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
print(f"🤖 {model} | {session} | 📂 {cwd}{branch} | 🧠 {tokens_k} ({pct}%)")
