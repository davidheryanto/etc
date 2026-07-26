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
BOLD=$'\033[1m'; DIM=$'\033[2m'; RST=$'\033[0m'
ok()  { printf '  \033[1;32m✓\033[0m %-12s %s\n' "$1" "$2"; }  # aligned checklist line
att() { printf '  \033[1;33m!\033[0m %-12s %s\n' "$1" "$2"; }  # attention, same layout
tilde() { case $1 in "$HOME"/*) printf '~%s' "${1#"$HOME"}";; *) printf '%s' "$1";; esac; }

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
  log "Using config $(tilde "$CONFIG_FILE") ${DIM}(run with --reconfigure to change)${RST}"
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
log "Personal ${BOLD}$PERSONAL_USER${RST}  |  Work ${BOLD}${WORK_NAMESPACES[*]}${RST} ${DIM}<$WORK_EMAIL>${RST}"
echo

# --- 1. SSH keys (generate only if missing) ---------------------------------
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
for key in "$PERSONAL_KEY" "$WORK_KEY"; do
  if [ -f "$key" ]; then
    ok "SSH key" "$(tilde "$key")"
    if [ ! -f "$key.pub" ]; then
      ssh-keygen -y -f "$key" > "$key.pub"
      ok "SSH key" "recreated missing $(tilde "$key.pub") from the private key"
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
ok "SSH config" "$(tilde "$SSH_CONFIG")"
if printf '%s\n' "$rest" | grep -q "^Host github.com"; then
  att "" "your old 'Host github.com' entry is still in this file, but it no"
  printf '                 %s\n' "longer has any effect (the managed block above it wins)."
  printf '                 %s\n' "${DIM}Nothing to do — delete it whenever you want a tidy file.${RST}"
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
ok "Git routing" "includeIf + url.insteadOf in ~/.gitconfig"

git_global_converge user.name "$PERSONAL_NAME"
git_global_converge user.email "$PERSONAL_EMAIL"
ok "Identity" "personal in ~/.gitconfig"

git_file_converge "$WORK_GITCONFIG" user.name "$WORK_NAME"
git_file_converge "$WORK_GITCONFIG" user.email "$WORK_EMAIL"
ok "Identity" "work in $(tilde "$WORK_GITCONFIG")"

# --- 4. Directory layout ----------------------------------------------------
mkdir -p "$HOME/github.com/$PERSONAL_USER"
for ns in "${WORK_NAMESPACES[@]}"; do mkdir -p "$HOME/github.com/$ns"; done
ok "Directories" "~/github.com/<account>/ ${DIM}— mirror the repo URL: a repo at${RST}"
printf '                 %s\n' "${DIM}github.com/<account>/<repo> is cloned into ~/github.com/<account>/${RST}"

# --- 4b. Directory-aware gh wrapper -----------------------------------------
# gh acts as one "active" account regardless of directory; on the wrong account
# it either 404s on private repos or silently acts as the wrong identity on
# public ones. This generated shell function (sourced from the user's rc) makes
# gh auto-switch to match ~/github.com/<owner>/ before every invocation, so the
# user never has to remember `gh auth switch`.
GH_WRAPPER="${CONFIG_FILE%/*}/github-accounts-gh.sh"
gen_wrapper() {
  echo "# Generated by setup-github-accounts.sh — do not edit (re-run it instead)."
  echo "# Makes the gh CLI follow the ~/github.com/<owner>/ directory convention:"
  echo "# running gh inside a personal/work directory auto-switches gh's active"
  echo "# account to match, so git AND gh both pick identity from the directory."
  echo 'gh() {'
  echo '  # env token or a non-github.com GH_HOST pins the account deliberately — do not fight it'
  echo '  if [ -z "${GH_TOKEN-}${GITHUB_TOKEN-}" ] && [ "${GH_HOST:-github.com}" = github.com ]; then'
  echo '    local _want=""'
  echo '    case "$PWD/" in'
  echo "      \"\$HOME/github.com/$PERSONAL_USER/\"*) _want=$PERSONAL_USER ;;"
  local ns
  for ns in "${WORK_NAMESPACES[@]}"; do
    echo "      \"\$HOME/github.com/$ns/\"*) _want=$WORK_USER ;;"
  done
  echo '    esac'
  echo '    if [ -n "$_want" ]; then'
  echo '      local _hosts="${GH_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/gh}/hosts.yml" _active=""'
  echo '      if [ -f "$_hosts" ]; then'
  echo '        _active=$(awk '\''/^github\.com:/ { f=1; next } /^[^ ]/ { f=0 } f && $1 == "user:" { print $2; exit }'\'' "$_hosts")'
  echo '      fi'
  echo '      if [ -n "$_active" ] && [ "$_active" != "$_want" ]; then'
  echo '        if command gh auth switch --hostname github.com --user "$_want" >/dev/null 2>&1; then'
  echo '          printf '\''gh: switched active account to %s to match this directory\n'\'' "$_want" >&2'
  echo '        else'
  echo '          printf '\''gh: this directory belongs to %s, but gh could not switch to that account\n'\'' "$_want" >&2'
  echo '          printf '\''gh: refusing to run as %s. Check logins with: gh auth status\n'\'' "$_active" >&2'
  echo '          printf '\''gh: (to bypass this safety check: command gh ...)\n'\'' >&2'
  echo '          return 1'
  echo '        fi'
  echo '      fi'
  echo '    fi'
  echo '  fi'
  echo '  command gh "$@"'
  echo '}'
}
wrapper_tmp=$(mktemp "$GH_WRAPPER.XXXXXX")
if gen_wrapper > "$wrapper_tmp"; then
  if [ -f "$GH_WRAPPER" ] && cmp -s "$wrapper_tmp" "$GH_WRAPPER"; then
    rm -f "$wrapper_tmp"
  elif ! mv "$wrapper_tmp" "$GH_WRAPPER"; then
    rm -f "$wrapper_tmp"
    die "Could not replace $GH_WRAPPER"
  fi
else
  rm -f "$wrapper_tmp"
  die "Could not write $GH_WRAPPER"
fi
# "Enabled" means: the rc file of the user's CURRENT shell has a real
# (uncommented) source line — a mention in a comment, or a line in the other
# shell's rc, doesn't load the wrapper for this user.
case "${SHELL-}" in
  */zsh)  rc_candidates=("$HOME/.zshrc") ;;
  */bash) rc_candidates=("$HOME/.bashrc") ;;
  *)      rc_candidates=("$HOME/.zshrc" "$HOME/.bashrc") ;;
esac
wrapper_sourced=false
for rc in "${rc_candidates[@]}"; do
  if [ -f "$rc" ] && \
     grep -Eqs '^[[:space:]]*(source|\.)[[:space:]]+[^#]*github-accounts-gh\.sh' "$rc"; then
    wrapper_sourced=true
  fi
done
if $wrapper_sourced; then
  ok "gh CLI" "picks the right account from the directory automatically"
else
  att "gh CLI" "can still pick the WRONG account ${DIM}— fix offered at the end of this output${RST}"
fi

# --- 5. Remaining manual steps (interactive / browser-based) ----------------
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
ghq() {  # gh restricted to its saved github.com accounts — immune to
  # GH_TOKEN/GITHUB_TOKEN/GH_HOST overrides from direnv or CI
  env -u GH_TOKEN -u GITHUB_TOKEN GH_HOST=github.com gh "$@"
}
gh_account_ok() {  # gh holds a token for account $1 that GitHub still accepts
  local tok login
  tok=$(ghq auth token --user "$1" 2>/dev/null) || return 1
  login=$(env -u GITHUB_TOKEN GH_TOKEN="$tok" GH_HOST=github.com \
          gh api user --jq .login 2>/dev/null) || return 1
  [ "$(printf '%s' "$login" | tr '[:upper:]' '[:lower:]')" = \
    "$(printf '%s' "$1"    | tr '[:upper:]' '[:lower:]')" ]
}
have_gh=false
command -v gh >/dev/null && have_gh=true
had_todo=false

print_account_todo() {  # $1 label, $2 GitHub username, $3 key path
  local label=$1 user=$2 key=$3 need_key=false need_login=false n=1
  key_on_github "$key" "$user" || need_key=true
  if $have_gh; then
    gh_account_ok "$user" || need_login=true
  fi
  $need_key || $need_login || return 0
  had_todo=true
  local kd="~${key#"$HOME"}"   # display paths as ~/... (shell re-expands on paste)
  echo
  warn "$label account ($user):"
  if $have_gh && $need_login; then
    echo
    echo "  $n. Log in gh as $user:"
    echo
    echo "       env -u GH_TOKEN -u GITHUB_TOKEN gh auth login -h github.com"
    echo
    echo "     Answers: protocol -> SSH"
    if $need_key; then
      echo "              SSH key  -> $kd.pub   (uploads it too — completes step 2)"
      echo "              title    -> a name for this computer, e.g. \"$(hostname -s)\"."
      echo "                          It labels the key at github.com/settings/keys"
      echo "                          so you can tell your computers' keys apart."
    fi
    echo "              auth     -> Login with a web browser, and sign in as $user"
    echo "                          (private window if browser is on another account)"
    if $need_key; then
      echo "     When it prints 'Uploaded the SSH key' and 'Logged in as $user',"
      echo "     step 2 below is already done — skip it and re-run this script."
    fi
    n=$((n+1))
  fi
  if $need_key; then
    echo
    if [ "$n" -gt 1 ]; then
      echo "  $n. Add the SSH key to the $user account (skip if step 1 uploaded it):"
    else
      echo "  $n. Add the SSH key to the $user account:"
    fi
    echo
    echo "     Browser (signed in as $user):"
    echo "       https://github.com/settings/keys -> New SSH key -> paste $kd.pub"
    if $have_gh; then
      echo "     Or gh (acting as $user):"
      echo "       env -u GH_TOKEN -u GITHUB_TOKEN gh auth switch -h github.com -u $user"
      echo "       env -u GH_TOKEN -u GITHUB_TOKEN -u GH_HOST gh ssh-key add $kd.pub --title \"$(hostname -s)\""
      echo "       ('env -u ...' = ignore any token/host set by direnv or CI, so the"
      echo "        command really acts on the $user keyring login; missing-scope"
      echo "        error? gh auth refresh -h github.com -s admin:public_key)"
    fi
  fi
}

if ! $have_gh; then
  had_todo=true
  echo
  warn "The gh CLI is not installed. Install it (e.g. brew install gh), then"
  warn "re-run this script for exact per-account login instructions."
fi
print_account_todo "Personal" "$PERSONAL_USER" "$PERSONAL_KEY"
print_account_todo "Work" "$WORK_USER" "$WORK_KEY"

echo
if $had_todo; then
  warn "When done, re-run this script — it verifies everything and prints 'All set'."
else
  if $wrapper_sourced; then
    log "All set — both SSH keys and both gh logins verified against GitHub."
  else
    warn "Almost done — ${BOLD}one thing left${RST}: unlike git, the gh CLI does not yet pick"
    warn "its account from your directory, so it can act as the wrong account."
    echo
    rc_file=""
    case "${SHELL-}" in
      */zsh)  rc_file="$HOME/.zshrc" ;;
      */bash) rc_file="$HOME/.bashrc" ;;
    esac
    src_line="source $(tilde "$GH_WRAPPER")"
    manual_hint() {
      echo "  To enable it, add this line to the end of ${1:-your shell startup file}:"
      echo
      echo "    $src_line"
      echo
      echo "  then open a new terminal. ${DIM}Until then: 'gh auth status' shows which${RST}"
      echo "  ${DIM}account gh is on, 'gh auth switch' flips it.${RST}"
    }
    if [ -n "$rc_file" ] && [ -t 0 ]; then
      echo "  The fix: append this line to the end of $(tilde "$rc_file"):"
      echo
      echo "    $src_line"
      echo
      printf '  Do it now? [Y/n] '
      reply=""
      read -r reply || reply=n
      echo
      case "$reply" in
        ""|[Yy]*)
          {
            echo ""
            echo "# gh follows ~/github.com/<account>/ (added by setup-github-accounts.sh)"
            echo "$src_line"
          } >> "$rc_file"
          log "Added. Every terminal you open from now on has this automatically."
          echo
          echo "  ${BOLD}Terminals that are already open (including this one) do NOT${RST} — they"
          echo "  read $(tilde "$rc_file") when they started. To activate it in this one, run:"
          echo
          echo "    source $(tilde "$rc_file")"
          ;;
        *)
          echo "  Skipped — nothing was changed. To enable it later, add the line above"
          echo "  to $(tilde "$rc_file") yourself, then open a new terminal."
          echo "  ${DIM}Until then: 'gh auth status' shows which account gh is on,${RST}"
          echo "  ${DIM}'gh auth switch' flips it.${RST}"
          ;;
      esac
    else
      if [ -z "$rc_file" ]; then
        echo "  Your shell was not recognized (SHELL='${SHELL-}'), so the script won't"
        echo "  guess where to install the fix."
      fi
      manual_hint "${rc_file:+$(tilde "$rc_file")}"
    fi
  fi
  echo
  echo "  ${BOLD}Where to clone${RST} ${DIM}— the directory decides which SSH key and commit${RST}"
  echo "  ${DIM}email git uses (automatic — no manual switching for git):${RST}"
  w=0
  for ns in "$PERSONAL_USER" "${WORK_NAMESPACES[@]}"; do
    p="~/github.com/$ns/"
    if [ ${#p} -gt "$w" ]; then w=${#p}; fi
  done
  printf '    %-*s  %s\n' "$w" "~/github.com/$PERSONAL_USER/" "${DIM}personal${RST}"
  for ns in "${WORK_NAMESPACES[@]}"; do
    printf '    %-*s  %s\n' "$w" "~/github.com/$ns/" "${DIM}work${RST}"
  done
  echo
  if $wrapper_sourced; then
    echo "  ${BOLD}gh CLI${RST} ${DIM}— also picks its account from the directory. gh alone cannot${RST}"
    echo "  ${DIM}do this (it always stays on one active account), so your shell loads a${RST}"
    echo "  ${DIM}small helper that runs 'gh auth switch' for you whenever the directory${RST}"
    echo "  ${DIM}calls for it — you see a notice each time it switches.${RST}"
    echo
  fi
  echo "  ${BOLD}Spot-checks${RST} ${DIM}(optional):${RST}"
  printf '    %-19s %s\n' "ssh -T github.com" "${DIM}# -> Hi $PERSONAL_USER!${RST}"
  printf '    %-19s %s\n' "ssh -T $SSH_ALIAS" "${DIM}# -> Hi $WORK_USER!${RST}"
fi
