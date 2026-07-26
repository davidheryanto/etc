#!/usr/bin/env bash
# Idempotent setup for using personal + work GitHub accounts on one machine.
# See git.md "Multiple GitHub accounts" for the full explanation of the layers.
#
# No identities are hardcoded here (this repo is public). On first run the
# script prompts for them and saves the answers to a per-machine config file
# (~/.config/github-accounts.conf), so later runs are non-interactive.
#
# Usage:
#   setup-github-accounts.sh                 # first run prompts, later runs converge
#   setup-github-accounts.sh --reconfigure   # re-ask everything
#   PERSONAL_USER=alice WORK_USER=alice-corp WORK_ORG=corp-inc \
#     WORK_NAME="Alice L" WORK_EMAIL=alice@corp.com setup-github-accounts.sh   # non-interactive
#
# Safe to re-run any time: every step is skipped or converged if already done,
# and it never deletes existing SSH/git config entries.
set -euo pipefail

CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/github-accounts.conf"
PERSONAL_KEY="$HOME/.ssh/github"
WORK_KEY="$HOME/.ssh/github-work"
SSH_ALIAS="gh-work"
SSH_CONFIG="$HOME/.ssh/config"
WORK_GITCONFIG="$HOME/.gitconfig-work"

BEGIN_MARK="# >>> github-accounts (managed by setup-github-accounts.sh) >>>"
END_MARK="# <<< github-accounts <<<"

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

is_gh_user() { [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$ ]]; }
is_email()   { [[ "$1" == *@*.* ]]; }

# ask <var> <prompt> <validator|-> <default|-> — prompt until valid; keeps
# a pre-set value from the environment (enables non-interactive use).
ask() {
  local var="$1" prompt="$2" validator="$3" default="$4" val
  val="${!var:-}"
  while :; do
    if [ -z "$val" ]; then
      [ -t 0 ] || die "$var is not set and there is no terminal to prompt on. Set it via environment variable or run interactively."
      if [ "$default" != "-" ]; then
        read -rp "$prompt [$default]: " val; val="${val:-$default}"
      else
        read -rp "$prompt: " val
      fi
    fi
    if [ "$validator" = "-" ] || "$validator" "$val"; then break; fi
    warn "Invalid value: '$val' — try again."
    val=""
  done
  printf -v "$var" '%s' "$val"
}

# --- 0. Identity config (prompt once, then reuse) ---------------------------
if [ "${1:-}" = "--reconfigure" ]; then
  rm -f "$CONFIG_FILE"
fi
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck source=/dev/null
  . "$CONFIG_FILE"
  log "Using config: $CONFIG_FILE (run with --reconfigure to change)"
else
  echo "First-time setup — answers are saved to $CONFIG_FILE (not in any repo)."
  ask PERSONAL_USER "Personal GitHub username" is_gh_user -
  ask WORK_USER     "Work GitHub username" is_gh_user -
  WORK_ORG="${WORK_ORG-}"
  if [ -z "$WORK_ORG" ] && [ -t 0 ]; then
    read -rp "Work GitHub org (optional, Enter to skip): " WORK_ORG
  fi
  ask WORK_NAME  "Name for work commits" - "$(git config --global user.name || echo -)"
  ask WORK_EMAIL "Email for work commits" is_email -
  NEED_SAVE=1
fi

# Validate regardless of source (env var, prompt, or hand-edited config file),
# and only after passing is a first-run config persisted.
is_gh_user "${PERSONAL_USER-}" || die "Invalid personal username: '${PERSONAL_USER-}'"
is_gh_user "${WORK_USER-}"     || die "Invalid work username: '${WORK_USER-}'"
[ -z "${WORK_ORG-}" ] || is_gh_user "$WORK_ORG" || die "Invalid work org: '$WORK_ORG'"
is_email "${WORK_EMAIL-}"      || die "Invalid work email: '${WORK_EMAIL-}'"
[ -n "${WORK_NAME-}" ]         || die "WORK_NAME must not be empty"

if [ -n "${NEED_SAVE-}" ]; then
  mkdir -p "$(dirname "$CONFIG_FILE")"
  {
    printf 'PERSONAL_USER=%q\n' "$PERSONAL_USER"
    printf 'WORK_USER=%q\n'     "$WORK_USER"
    printf 'WORK_ORG=%q\n'      "$WORK_ORG"
    printf 'WORK_NAME=%q\n'     "$WORK_NAME"
    printf 'WORK_EMAIL=%q\n'    "$WORK_EMAIL"
  } > "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
  log "Saved $CONFIG_FILE"
fi

# Work namespaces = the GitHub owners whose repos use the work identity.
WORK_NAMESPACES=("$WORK_USER"); [ -n "$WORK_ORG" ] && WORK_NAMESPACES+=("$WORK_ORG")

echo
log "Personal: $PERSONAL_USER  |  Work: ${WORK_NAMESPACES[*]} <$WORK_EMAIL>"
echo

# --- 1. SSH keys (generate only if missing) ---------------------------------
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
for key in "$PERSONAL_KEY" "$WORK_KEY"; do
  if [ -f "$key" ]; then
    log "SSH key exists: $key"
  else
    log "Generating $key"
    ssh-keygen -t ed25519 -f "$key"
  fi
done

# --- 2. SSH config (managed block, replaced in full on every run) -----------
# The block is kept at the TOP of the file: ssh config is first-match-wins,
# so this wins over any legacy Host entries below it without deleting them.
touch "$SSH_CONFIG" && chmod 600 "$SSH_CONFIG"
# Identity options are scoped to the two GitHub entries (not "Host *") so
# unrelated hosts — e.g. ones relying on agent-only keys — are unaffected.
#   IgnoreUnknown UseKeychain  skip UseKeychain on ssh builds without it;
#                              must be top-level (before any Host/Match):
#                              ssh validates keywords even in unmatched
#                              blocks but only honors IgnoreUnknown from
#                              matched ones, so a conditional copy would
#                              still break every non-GitHub connection
#   IdentitiesOnly yes         offer only the listed key; avoids "Too many
#                              authentication failures" with a loaded agent
#   UseKeychain yes            macOS: passphrases from the login Keychain
block=$(cat <<EOF
$BEGIN_MARK
IgnoreUnknown UseKeychain

# Work GitHub ($WORK_USER)
Host $SSH_ALIAS
    HostName github.com
    User git
    IdentityFile $WORK_KEY
    IdentitiesOnly yes
    AddKeysToAgent yes
    UseKeychain yes

# Personal GitHub ($PERSONAL_USER). Match originalhost, not Host:
# some systems re-parse against the resolved hostname, which would
# make "Host github.com" also match $SSH_ALIAS connections.
Match originalhost github.com
    User git
    IdentityFile $PERSONAL_KEY
    IdentitiesOnly yes
    AddKeysToAgent yes
    UseKeychain yes

# "Match all" ends the Match above so entries below this block
# are unconditional again.
Match all
$END_MARK
EOF
)
# sed strips leading blank lines from the remainder so the separator blank
# line written below is not re-absorbed and duplicated on the next run.
rest=$(awk -v b="$BEGIN_MARK" -v e="$END_MARK" \
  '$0==b{skip=1} !skip{print} $0==e{skip=0}' "$SSH_CONFIG" | sed '/./,$!d')
if [ -n "$rest" ]; then
  printf '%s\n\n%s\n' "$block" "$rest" > "$SSH_CONFIG"
else
  printf '%s\n' "$block" > "$SSH_CONFIG"
fi
log "SSH config block converged in $SSH_CONFIG"
if printf '%s\n' "$rest" | grep -q "^Host github.com"; then
  warn "A legacy 'Host github.com' entry remains below the managed block;"
  warn "it is overridden (first match wins) but you may delete it."
fi

# --- 3. Git config (git config set is naturally idempotent) -----------------
for ns in "${WORK_NAMESPACES[@]}"; do
  git config --global includeIf."gitdir:~/github.com/$ns/".path "$WORK_GITCONFIG"
  git config --global url."git@$SSH_ALIAS:$ns/".insteadOf "git@github.com:$ns/"
done
log "Git includeIf + url.insteadOf converged in ~/.gitconfig"

git config --file "$WORK_GITCONFIG" user.name "$WORK_NAME"
git config --file "$WORK_GITCONFIG" user.email "$WORK_EMAIL"
log "Work identity converged in $WORK_GITCONFIG"

# --- 4. Directory layout ----------------------------------------------------
mkdir -p "$HOME/github.com/$PERSONAL_USER"
for ns in "${WORK_NAMESPACES[@]}"; do mkdir -p "$HOME/github.com/$ns"; done
log "Directory layout ready under ~/github.com/ (clone work repos ONLY into work dirs)"

# --- 5. Remaining manual steps (interactive / browser-based) ----------------
todo=()
key_on_github() {  # is local key $1 uploaded to the GitHub account named $2?
  # -F /dev/null isolates the test: without it the just-written ~/.ssh/config
  # also offers the other account's key, so a failed key silently "passes" via
  # fallback. Exact "Hi $2!" avoids substring matches between related
  # usernames. GitHub's ssh -T always exits 1 (no shell), so ignore the exit
  # status and inspect the greeting text instead.
  local out
  out=$(ssh -F /dev/null -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
        -o IdentityFile="$1" -o IdentitiesOnly=yes -T git@github.com 2>&1) || true
  grep -q "Hi $2!" <<<"$out"
}
key_on_github "$PERSONAL_KEY" "$PERSONAL_USER" \
  || todo+=("Upload personal key: gh ssh-key add $PERSONAL_KEY.pub --title \"\$(hostname)\" (while logged in as $PERSONAL_USER)")
key_on_github "$WORK_KEY" "$WORK_USER" \
  || todo+=("Upload work key:     gh ssh-key add $WORK_KEY.pub --title \"\$(hostname)\" (while logged in as $WORK_USER)")

if command -v gh >/dev/null; then
  for u in "$PERSONAL_USER" "$WORK_USER"; do
    gh auth token --user "$u" >/dev/null 2>&1 \
      || todo+=("gh login for $u: env -u GH_TOKEN gh auth login -h github.com")
  done
else
  todo+=("Install the gh CLI, then run 'gh auth login' once per account")
fi

echo
if [ ${#todo[@]} -gt 0 ]; then
  warn "Manual steps remaining (re-run this script afterwards to verify):"
  printf '  - %s\n' "${todo[@]}"
else
  log "All set. Quick checks:"
  echo "  ssh -T github.com     # -> $PERSONAL_USER"
  echo "  ssh -T $SSH_ALIAS         # -> $WORK_USER"
  echo "  gh auth switch        # flip gh between accounts when needed"
fi
