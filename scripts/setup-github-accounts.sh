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
#   PERSONAL_USER=alice PERSONAL_NAME="Alice" PERSONAL_EMAIL=alice@example.com \
#     WORK_USER=alice-corp WORK_ORG=corp-inc WORK_NAME="Alice L" \
#     WORK_EMAIL=alice@corp.com setup-github-accounts.sh   # non-interactive
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
# Besides the identity answers, the file records MANAGED_NS: the namespaces
# whose git entries THIS script created. Cleanup later removes exactly those,
# so user-created entries are never touched — even ones that happen to reuse
# our work gitconfig or SSH alias.
RECONF=""
case "$#" in
  0) ;;
  1)
    [ "$1" = "--reconfigure" ] \
      || die "Unknown argument: $1 (usage: setup-github-accounts.sh [--reconfigure])"
    RECONF=1
    ;;
  *) die "Usage: setup-github-accounts.sh [--reconfigure]" ;;
esac

# Remember which values came from the caller before sourcing the saved config.
# A reconfigure run should discard saved answers, but must preserve explicitly
# supplied environment values so it can still run non-interactively.
INPUT_PERSONAL_USER_SET="${PERSONAL_USER+x}";   INPUT_PERSONAL_USER="${PERSONAL_USER-}"
INPUT_PERSONAL_NAME_SET="${PERSONAL_NAME+x}";   INPUT_PERSONAL_NAME="${PERSONAL_NAME-}"
INPUT_PERSONAL_EMAIL_SET="${PERSONAL_EMAIL+x}"; INPUT_PERSONAL_EMAIL="${PERSONAL_EMAIL-}"
INPUT_WORK_USER_SET="${WORK_USER+x}";           INPUT_WORK_USER="${WORK_USER-}"
INPUT_WORK_ORG_SET="${WORK_ORG+x}";             INPUT_WORK_ORG="${WORK_ORG-}"
INPUT_WORK_NAME_SET="${WORK_NAME+x}";           INPUT_WORK_NAME="${WORK_NAME-}"
INPUT_WORK_EMAIL_SET="${WORK_EMAIL+x}";         INPUT_WORK_EMAIL="${WORK_EMAIL-}"

PREV_MANAGED=""
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck source=/dev/null
  . "$CONFIG_FILE"
  PREV_MANAGED="${MANAGED_NS-}"
fi
if [ -n "$RECONF" ] || [ ! -f "$CONFIG_FILE" ]; then
  if [ -n "$RECONF" ]; then
    echo "Reconfiguring — enter new values (previous managed git entries will be cleaned up)."
    unset PERSONAL_USER PERSONAL_NAME PERSONAL_EMAIL
    unset WORK_USER WORK_ORG WORK_NAME WORK_EMAIL
    [ -z "$INPUT_PERSONAL_USER_SET" ]   || PERSONAL_USER="$INPUT_PERSONAL_USER"
    [ -z "$INPUT_PERSONAL_NAME_SET" ]   || PERSONAL_NAME="$INPUT_PERSONAL_NAME"
    [ -z "$INPUT_PERSONAL_EMAIL_SET" ]  || PERSONAL_EMAIL="$INPUT_PERSONAL_EMAIL"
    [ -z "$INPUT_WORK_USER_SET" ]       || WORK_USER="$INPUT_WORK_USER"
    [ -z "$INPUT_WORK_ORG_SET" ]        || WORK_ORG="$INPUT_WORK_ORG"
    [ -z "$INPUT_WORK_NAME_SET" ]       || WORK_NAME="$INPUT_WORK_NAME"
    [ -z "$INPUT_WORK_EMAIL_SET" ]      || WORK_EMAIL="$INPUT_WORK_EMAIL"
  else
    echo "First-time setup — answers are saved to $CONFIG_FILE (not in any repo)."
  fi
  ask PERSONAL_USER "Personal GitHub username" is_gh_user -
  ask PERSONAL_NAME "Name for personal commits" - "$(git config --global user.name || echo -)"
  ask PERSONAL_EMAIL "Email for personal commits" is_email "$(git config --global user.email || echo -)"
  ask WORK_USER     "Work GitHub username" is_gh_user -
  WORK_ORG="${WORK_ORG-}"
  if [ -z "$WORK_ORG" ] && [ -t 0 ] && [ -z "$INPUT_WORK_ORG_SET" ]; then
    read -rp "Work GitHub org (optional, Enter to skip): " WORK_ORG
  fi
  ask WORK_NAME  "Name for work commits" - "$PERSONAL_NAME"
  ask WORK_EMAIL "Email for work commits" is_email -
  NEED_SAVE=1
else
  log "Using config: $CONFIG_FILE (run with --reconfigure to change)"
fi
WORK_ORG="${WORK_ORG-}"

# Migrate config files written by versions that predate the personal identity
# fields. Prefer the existing global identity, then prompt (or give a useful
# non-interactive error through ask).
if [ -z "${PERSONAL_NAME-}" ] || [ -z "${PERSONAL_EMAIL-}" ]; then
  log "Adding personal Git identity to the saved account config"
  PERSONAL_NAME="${PERSONAL_NAME-}"
  PERSONAL_EMAIL="${PERSONAL_EMAIL-}"
  if [ -z "$PERSONAL_NAME" ]; then
    PERSONAL_NAME="$(git config --global user.name || true)"
  fi
  if [ -z "$PERSONAL_EMAIL" ]; then
    PERSONAL_EMAIL="$(git config --global user.email || true)"
  fi
  ask PERSONAL_NAME "Name for personal commits" - -
  ask PERSONAL_EMAIL "Email for personal commits" is_email -
  NEED_SAVE=1
fi

# Validate regardless of source (env var, prompt, or hand-edited config file),
# and only after passing is the config persisted.
is_gh_user "${PERSONAL_USER-}" || die "Invalid personal username: '${PERSONAL_USER-}'"
[ -n "${PERSONAL_NAME-}" ]      || die "PERSONAL_NAME must not be empty"
is_email "${PERSONAL_EMAIL-}"   || die "Invalid personal email: '${PERSONAL_EMAIL-}'"
is_gh_user "${WORK_USER-}"     || die "Invalid work username: '${WORK_USER-}'"
[ -z "$WORK_ORG" ] || is_gh_user "$WORK_ORG" || die "Invalid work org: '$WORK_ORG'"
is_email "${WORK_EMAIL-}"      || die "Invalid work email: '${WORK_EMAIL-}'"
[ -n "${WORK_NAME-}" ]         || die "WORK_NAME must not be empty"

save_conf() {  # $1 = namespaces to record as managed
  local target="$CONFIG_FILE" link tmp
  mkdir -p "$(dirname "$target")"
  while [ -L "$target" ]; do
    link=$(readlink "$target")
    case "$link" in
      /*) target="$link" ;;
      *)  target="$(dirname "$target")/$link" ;;
    esac
  done
  tmp=$(mktemp "$target.XXXXXX")
  if {
    {
      printf 'PERSONAL_USER=%q\n'  "$PERSONAL_USER"
      printf 'PERSONAL_NAME=%q\n'  "$PERSONAL_NAME"
      printf 'PERSONAL_EMAIL=%q\n' "$PERSONAL_EMAIL"
      printf 'WORK_USER=%q\n'      "$WORK_USER"
      printf 'WORK_ORG=%q\n'       "$WORK_ORG"
      printf 'WORK_NAME=%q\n'      "$WORK_NAME"
      printf 'WORK_EMAIL=%q\n'     "$WORK_EMAIL"
      printf 'MANAGED_NS=%q\n'     "$1"
    } > "$tmp" &&
      chmod 600 "$tmp"
  }; then
    if [ -f "$target" ] && cmp -s "$tmp" "$target"; then
      rm -f "$tmp"
      chmod 600 "$target"
    elif mv "$tmp" "$target"; then
      :
    else
      rm -f "$tmp"
      die "Could not replace $target"
    fi
  else
    rm -f "$tmp"
    die "Could not write $target"
  fi
}
if [ -n "${NEED_SAVE-}" ]; then
  save_conf "$PREV_MANAGED"
  log "Saved $CONFIG_FILE"
fi

# Work namespaces = the GitHub owners whose repos use the work identity.
WORK_NAMESPACES=("$WORK_USER")
if [ -n "$WORK_ORG" ]; then WORK_NAMESPACES+=("$WORK_ORG"); fi

echo
log "Personal: $PERSONAL_USER  |  Work: ${WORK_NAMESPACES[*]} <$WORK_EMAIL>"
echo

# --- 1. SSH keys (generate only if missing) ---------------------------------
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
for key in "$PERSONAL_KEY" "$WORK_KEY"; do
  if [ -f "$key" ]; then
    log "SSH key exists: $key"
    if [ ! -f "$key.pub" ]; then
      ssh-keygen -y -f "$key" > "$key.pub"
      log "Recreated missing $key.pub from the private key"
    fi
  else
    log "Generating $key"
    ssh-keygen -t ed25519 -f "$key"
  fi
done

# --- 2. SSH config (managed block, rewritten only when changed) -------------
# The block is kept at the TOP of the file: ssh config is first-match-wins,
# so this wins over any legacy Host entries below it without deleting them.
[ -e "$SSH_CONFIG" ] || touch "$SSH_CONFIG"
# Resolve symlinks (dotfile managers often link ~/.ssh/config) so the atomic
# rename below rewrites the target file instead of replacing the link.
while [ -L "$SSH_CONFIG" ]; do
  link=$(readlink "$SSH_CONFIG")
  case "$link" in
    /*) SSH_CONFIG="$link" ;;
    *)  SSH_CONFIG="$(dirname "$SSH_CONFIG")/$link" ;;
  esac
done
chmod 600 "$SSH_CONFIG"
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
# Refuse to touch the file if the markers are malformed (missing, duplicated,
# or out of order after a hand-edit): the filter below would otherwise swallow
# unrelated config from a stray begin marker to EOF. The awk state machine
# accepts only properly paired begin→end sequences.
awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
  $0==b { if (open || seen) bad=1; open=1; seen=1 }
  $0==e { if (!open) bad=1; open=0 }
  END   { exit bad || open }' "$SSH_CONFIG" \
  || die "Malformed managed-block markers in $SSH_CONFIG — repair the file by hand, then re-run"

# sed strips leading blank lines from the remainder so the separator blank
# line written below is not re-absorbed and duplicated on the next run.
# Write via a temp file + rename so a failure mid-write cannot truncate.
rest=$(awk -v b="$BEGIN_MARK" -v e="$END_MARK" \
  '$0==b{skip=1} !skip{print} $0==e{skip=0}' "$SSH_CONFIG" | sed '/./,$!d')
tmp=$(mktemp "$SSH_CONFIG.XXXXXX")
if [ -n "$rest" ]; then
  printf '%s\n\n%s\n' "$block" "$rest" > "$tmp"
else
  printf '%s\n' "$block" > "$tmp"
fi
chmod 600 "$tmp"
if cmp -s "$tmp" "$SSH_CONFIG"; then
  rm -f "$tmp"
else
  mv "$tmp" "$SSH_CONFIG"
fi
log "SSH config block converged in $SSH_CONFIG"
if printf '%s\n' "$rest" | grep -q "^Host github.com"; then
  warn "A legacy 'Host github.com' entry remains below the managed block;"
  warn "it is overridden (first match wins) but you may delete it."
fi

# --- 3. Git config (git config set is naturally idempotent) -----------------
# Reconcile, don't just add: remove the entries recorded as managed by a
# previous run (MANAGED_NS in the state file), so a renamed org/user via
# --reconfigure doesn't leave stale rules. Only recorded namespaces are
# removed — never entries inferred from their values — so user-created
# config survives even if it reuses $WORK_GITCONFIG or $SSH_ALIAS.
# --replace-all: converge managed keys even if duplicates were added by hand.
# Avoid writes when a key already has exactly the expected value, making a
# normal repeat run a true no-op for git config files.
namespace_is_current() {
  local wanted="$1" current
  for current in "${WORK_NAMESPACES[@]}"; do
    [ "$wanted" != "$current" ] || return 0
  done
  return 1
}
git_global_converge() {
  local key="$1" value="$2" current
  current=$(git config --global --get-all "$key" 2>/dev/null || true)
  [ "$current" = "$value" ] \
    || git config --global --replace-all "$key" "$value"
}
git_file_converge() {
  local file="$1" key="$2" value="$3" current
  current=$(git config --file "$file" --get-all "$key" 2>/dev/null || true)
  [ "$current" = "$value" ] \
    || git config --file "$file" --replace-all "$key" "$value"
}
git_global_unset_all() {
  local key="$1" status
  if git config --global --unset-all "$key"; then
    return
  else
    status=$?
    [ "$status" -eq 5 ] || die "Could not remove git config key: $key"
  fi
}

for ns in $PREV_MANAGED; do
  is_gh_user "$ns" || continue
  namespace_is_current "$ns" && continue
  git_global_unset_all includeIf."gitdir:~/github.com/$ns/".path
  git_global_unset_all url."git@$SSH_ALIAS:$ns/".insteadOf
done
for ns in "${WORK_NAMESPACES[@]}"; do
  git_global_converge includeIf."gitdir:~/github.com/$ns/".path "$WORK_GITCONFIG"
  git_global_converge url."git@$SSH_ALIAS:$ns/".insteadOf "git@github.com:$ns/"
done
save_conf "${WORK_NAMESPACES[*]}"
log "Git includeIf + url.insteadOf converged in ~/.gitconfig"

git_global_converge user.name "$PERSONAL_NAME"
git_global_converge user.email "$PERSONAL_EMAIL"
log "Personal identity converged in ~/.gitconfig"

git_file_converge "$WORK_GITCONFIG" user.name "$WORK_NAME"
git_file_converge "$WORK_GITCONFIG" user.email "$WORK_EMAIL"
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
  out=$(ssh -F /dev/null -o BatchMode=yes -o ConnectTimeout=5 \
        -o StrictHostKeyChecking=accept-new \
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
