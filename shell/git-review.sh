# git-review.sh — PR-review helpers: review() and pr-push().
#
# Single source of truth for these functions. Load from ~/.bashrc or
# ~/.zshrc (POSIX function syntax, works identically in both shells):
#
#   source ~/github.com/davidheryanto/etc/shell/git-review.sh
#
# Workflow docs and design rationale: git.md → "Review a PR".
# shellcheck shell=bash

# Check out PR #N onto a local pr-N branch for review.
review() {
  if [ -z "$1" ]; then
    echo "usage: review <PR#>" >&2
    return 1
  fi
  git reset --hard HEAD >/dev/null
  local out base
  # -f resets the local pr-N branch to the PR's current head — discards any
  # local commits on pr-N. Branch off first (git switch -c review-fixes-N)
  # if you want to keep work-in-progress.
  out=$(gh pr checkout -f -b "pr-$1" "$1" 2>&1) || { echo "$out" >&2; return 1; }
  # Refresh origin/<base> so `git diff origin/<base>...HEAD` reflects only
  # this PR's contribution. `gh pr checkout` fetches refs/pull/N/head but
  # not the base branch, so a stale origin/<base> silently widens the diff
  # to include commits from other already-merged PRs.
  base=$(gh pr view "$1" --json baseRefName -q .baseRefName) || return 1
  git fetch --quiet --no-tags origin "$base" ||
    { echo "review: failed to fetch origin/$base" >&2; return 1; }
  # Also sync local <base> to origin/<base> — coding agents routinely diff
  # against local main assuming it mirrors origin/main, and a stale local
  # base widens their diff the same way. If local <base> is checked out in
  # some other worktree (usually your main one, ~/myrepo — found via
  # `git worktree list`), a direct `fetch origin <base>:<base>` is refused,
  # so fast-forward it in that worktree via `merge --ff-only` instead. Only
  # when that worktree has no staged or unstaged changes: if dirty, the
  # sync is skipped with a warning — work in progress is never touched,
  # local <base> just stays stale (diff against origin/<base> then).
  # Untracked files don't block the sync on purpose — blocking on their
  # mere presence would mean the sync ~never runs (.env, artifacts).
  # They're protected instead: git refuses to overwrite a plain untracked
  # file on merge, but treats IGNORED files as expendable and silently
  # clobbers them (.env-style local config is exactly this case) — so the
  # collision check below catches those before merging.
  local wt clobber
  wt=$(git worktree list --porcelain |
    awk -v b="branch refs/heads/$base" '/^worktree /{w=substr($0,10)} $0==b{print w; exit}')
  if [ -z "$wt" ]; then
    git fetch --quiet origin "$base:$base" 2>/dev/null ||
      echo "review: local $base diverged from origin/$base — not updated" >&2
  elif git -C "$wt" diff --quiet 2>/dev/null &&
       git -C "$wt" diff --cached --quiet 2>/dev/null; then
    # Paths the ff would newly create, vs files already present in <wt>:
    # any hit is an untracked or ignored file the merge would touch (git
    # aborts on untracked collisions but silently overwrites ignored ones).
    # A path "added" between HEAD and origin/<base> can't be tracked at
    # HEAD, so existing-on-disk means untracked/ignored — no status call.
    clobber=$(git -C "$wt" diff --name-only --no-renames --diff-filter=A "HEAD..origin/$base" 2>/dev/null |
      while IFS= read -r f; do [ -e "$wt/$f" ] && printf '%s\n' "$f"; done)
    if [ -n "$clobber" ]; then
      { echo "review: local $base not updated — fast-forward would overwrite existing file(s) in $wt:"
        printf '%s\n' "$clobber" | sed 's/^/  /'; } >&2
    else
      git -C "$wt" merge --quiet --ff-only "origin/$base" >/dev/null 2>&1 ||
        echo "review: local $base diverged from origin/$base — not fast-forwarded" >&2
    fi
  else
    echo "review: worktree at $wt is dirty — local $base not updated; diff against origin/$base" >&2
  fi
  gh pr view "$1" \
    --json number,title,author,baseRefName,additions,deletions,changedFiles,commits,url,isDraft \
    --template $'\e[1m#{{.number}}{{if .isDraft}} [DRAFT]{{end}} by @{{.author.login}}: {{.title}}\e[0m
  \e[2m+{{.additions}} -{{.deletions}} in {{.changedFiles}} files, {{len .commits}} commits → {{.baseRefName}}\e[0m
  {{.url}}

  \e[2mDescription:\e[0m  gh pr view {{.number}}
  \e[2mDiff:\e[0m         git diff origin/{{.baseRefName}}...HEAD
  \e[2mChecks:\e[0m       gh pr checks {{.number}}
'
}

# pr-push: push commits from a pr-N branch to the PR's upstream branch
# (e.g. the contributor's branch on their fork). Needed because `pr-N` is a
# local rename and default push.default=simple rejects pushes when local
# and upstream branch names differ. Reads branch.pr-N.remote/.merge that
# `gh pr checkout` already configured, so fork remotes work too.
# Args pass through, e.g. `pr-push --force-with-lease`.
pr-push() {
  local b
  b=$(git symbolic-ref --short HEAD 2>/dev/null) || {
    echo "pr-push: not on a branch (detached HEAD?)" >&2
    return 1
  }
  # Guard: refuse from non-pr-N branches. Otherwise this function silently
  # bypasses push.default=simple's name-mismatch safety for any tracked
  # branch — exactly the safety we kept by not setting push.default=upstream.
  # Two checks because these are globs, not regexes: `pr-[0-9]*` alone would
  # accept pr-1-wip (`*` matches anything), so also require that nothing
  # but digits follows the `pr-` prefix.
  case "$b" in
    pr-[0-9]*) ;;
    *) echo "pr-push: must be on a pr-N review branch, got '$b'" >&2; return 1 ;;
  esac
  case "${b#pr-}" in
    *[!0-9]*) echo "pr-push: must be on a pr-N review branch, got '$b'" >&2; return 1 ;;
  esac
  local remote merge
  remote=$(git config "branch.$b.remote")
  merge=$(git config "branch.$b.merge")
  if [ -z "$remote" ] || [ -z "$merge" ]; then
    echo "pr-push: '$b' has no upstream configured" >&2
    return 1
  fi
  git push "$remote" "HEAD:${merge#refs/heads/}" "$@"
}
