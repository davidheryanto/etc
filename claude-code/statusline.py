#!/usr/bin/env python3
"""
Claude Code statusline script.

Shows: model + effort, 5-hour session usage + reset countdown, directory, git branch + state, context tokens.

effort.level is low/medium/high/xhigh/max, and is absent for models without effort support.

Session segment uses rate_limits.five_hour (Pro/Max only, present after first API response).
Falls back to cost if rate_limits is absent (API plans, or before first response).

Git segment: branch, then only what needs attention. Nothing extra means clean and level with upstream.
  main*      uncommitted changes (staged, unstaged or untracked)
  main ↑2    2 commits to push        main ↓3    3 commits to pull (as of the last fetch)
  main ↑?    branch has no upstream yet (never pushed)

References:
- https://code.claude.com/docs/en/statusline (setup & JSON schema)
"""
import json, sys, subprocess, os, time

d = json.load(sys.stdin)

cwd_path = d.get('cwd') or os.getcwd()
cwd = os.path.basename(cwd_path)
model = d['model']['display_name'].replace('(1M context)', '(1M)')
effort = (d.get('effort') or {}).get('level')
if effort:
    model += f" · {effort}"
if d.get('fast_mode'):
    model += " ⚡"
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


def git(*args):
    # --no-optional-locks: never take the index lock, so this can't collide with a git command Claude is running
    return subprocess.run(["git", "--no-optional-locks", "-C", cwd_path, *args],
                          capture_output=True, text=True, timeout=1)


def git_segment():
    result = git("status", "--porcelain=v2", "--branch")
    if result.returncode != 0:
        return ""
    head = oid = ""
    upstream = ab = None
    dirty = False
    for line in result.stdout.splitlines():
        if line.startswith('# branch.head '):
            head = line[14:]
        elif line.startswith('# branch.oid '):
            oid = line[13:]
        elif line.startswith('# branch.upstream '):
            upstream = line[18:]
        elif line.startswith('# branch.ab '):
            ab = line[12:].split()  # ['+2', '-3']
        elif line and not line.startswith('#'):
            dirty = True  # any staged, unstaged, conflicted or untracked path
    detached = head == '(detached)'
    name = f"@{oid[:7]}" if detached else head
    if dirty:
        name += "*"
    sync = ""
    if ab:
        ahead, behind = int(ab[0]), -int(ab[1])
        sync = (f"↑{ahead}" if ahead else "") + (f"↓{behind}" if behind else "")
    elif not detached and (upstream or git("remote").stdout.strip()):
        sync = "↑?"  # nothing to compare with: never pushed, or upstream deleted (only if origin exists)
    return f"{name} {sync}".rstrip()


branch = ""
try:
    seg = git_segment()
except Exception:
    seg = ""
if seg:
    branch = f" | 🌿 {seg}"

tokens_k = f"{tokens // 1000}k" if tokens >= 1000 else str(tokens)
print(f"🤖 {model} | {session} | 📂 {cwd}{branch} | 🧠 {tokens_k} ({pct}%)")
