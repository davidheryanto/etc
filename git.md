# Git cheatsheet

## Contents

- **Setup**
    - Initial setup from existing project
    - Clone

- **Everyday branch workflow**
    - Common workflow (dev branch → main)
    - Branches
    - Pull when you have uncommitted changes
    - Stash
    - Rebase current branch onto latest main
    - Reset a working branch to latest main

- **History modification**
    - Rebase / squash commits
    - Cherry-pick
    - Undo / reset / revert
    - Conflicts and mergetool

- **Inspection**
    - Diff
    - Log and history

- **Remote / collaboration**
    - Remotes
    - Working with forks
    - Checkout PR
    - Tags

- **Power tools**
    - Submodules
    - Worktree
    - SSH / private key / custom port
    - Multiple GitHub accounts (personal + work)
    - BFG repo cleaner (remove sensitive text)

- **Reference / appendix**
    - Config (global / local / line endings / proxy / credentials)
    - Github API / hooks
    - HEAD~ and HEAD^ reference
    - Misc

## Initial setup from existing project

```bash
git init
git add .
git commit -m "First commit"
git remote add origin <remote repository URL>
git remote -v
# Only for first time pushing. We set the upstream
git push -u origin main
# If need to merge with existing project in origin, do pull first
git pull --allow-unrelated-histories origin main
```

## Clone

```bash
# Clone specific branch: https://stackoverflow.com/a/1911126
git clone --single-branch --branch <branchname> <remote-repo>

# Only clone the last 10 revisions
git clone --depth=10 <url>
```

## Common workflow (dev branch → main)

https://stackoverflow.com/questions/14168677/merge-development-branch-with-master

```bash
git switch -c dev            # legacy: git checkout -b dev
# Do work
git add -A
git commit -m "Work done"
git merge main
# Resolve any merge conflicts if there are any
git switch main              # legacy: git checkout main
git merge dev
```

## Branches

```bash
# List all branches
git branch -a

# List branches sort by commit date
git branch -l --sort=committerdate
git branch -l --sort=-committerdate  # Reversed

# List all remote branches
git branch -r / --remote

# Make current local branch track a remote branch
git branch -u upstream/foo

# Additionally, prune stale remote branches first
git remote prune origin && git branch -r

# List branches that have been merged into the current branch
# https://stackoverflow.com/a/28464339/3949303
git branch --merged

# Create branch
git branch newbranch
# Create branch and switch to it (modern)
git switch -c newbranch
# Legacy combined command (still works):
git checkout -b newbranch

# Switch to an existing branch (modern)
git switch newbranch
# Legacy: git checkout newbranch

# Push the local branch to remote
# https://stackoverflow.com/questions/2765421/how-do-i-push-a-new-local-branch-to-a-remote-git-repository-and-track-it-too
git push -u origin <branch>

# Create remote branch
git switch -c newbranch [REMOTE/BRANCH]    # legacy: git checkout -b newbranch [REMOTE/BRANCH]
git push -u origin newbranch

# Checkout remote branch: https://stackoverflow.com/a/1783426/3949303
git fetch origin 'remote_branch':'local_branch_name'
# May need to run this first: git fetch REMOTE_NAME
git switch --track REMOTE_NAME/REMOTE_REF   # legacy: git checkout --track/-t REMOTE_NAME/REMOTE_REF

# Delete remote branch
git push --delete/-d origin <branchName>
# Delete local branch
git branch --delete/-d mybranch

# Delete all local branches except main/master
# https://stackoverflow.com/questions/28572293/can-i-delete-all-the-local-branches-except-the-current-one
git branch --format='%(refname:short)' | grep -vE '^(main|master)$' | xargs -n1 git branch -D

# Set upstream branch, i.e. push local branch to remote
git push [--set-upstream|-u] <upstream> <branch>
# i.e. git push -u origin newbranch

# Set remote tracking, upstream is normally origin
git branch --set-upstream-to=upstream/foo foo
# OR
git branch -u upstream/foo foo
```

## Pull when you have uncommitted changes

Problem: `git pull` refuses — local edits would be overwritten.

```bash
# Option A (preferred): commit first, then pull
git add -A && git commit -m "WIP" && git pull
# Later: squash or amend the WIP commit

# Option B: stash, pull, pop
git stash push -m "WIP"          # or: git stash push <file>  for one file
git pull                         # or: git pull --rebase
git stash pop                    # if conflict markers appear:
                                 #   edit files → git add <file> → git stash drop

# Option C (one-shot, same as B):
git pull --rebase --autostash
```

## Stash

```bash
# Working on wrong branch - how to copy changes to existing topic branch
git stash
git switch branch123             # legacy: git checkout branch123
git stash apply
# OR below, equivalent to: git stash apply && git stash drop
git stash pop

# List stash
git stash list

# Drop the top stash
git stash drop
# Drop a specific stash
git stash drop stash@{0}
```

## Rebase current branch onto latest main

Rebase current branch (e.g. dev/hotfix) onto latest main without switching.

```bash
git fetch origin main
git rebase origin/main
# or:
git pull --rebase origin main

# If conflicts:
#   fix files → git add <files> → git rebase --continue
#   abort rebase → git rebase --abort

# If branch is already pushed:
git push --force-with-lease
```

## Reset a working branch to latest main

Useful after MR is merged and you want a fresh branch from main. `-B` creates the branch or resets it if it already exists.

```bash
git fetch origin main && git checkout -B <branch> origin/main && git branch -f main origin/main
# e.g. git fetch origin main && git checkout -B david origin/main && git branch -f main origin/main
```

## Rebase / squash commits

Videos that explain `git reset`, default is `--mixed`:
- https://www.youtube.com/watch?v=220qkGeEn6A (soft: normally to group commits)
- https://www.youtube.com/watch?v=aYNOCvVevic (mixed)
- https://www.youtube.com/watch?v=V66d5e8Ku4w (hard)

```bash
# Merge two commits into one
# http://stackoverflow.com/questions/2563632/how-can-i-merge-two-commits-into-one
git rebase --interactive HEAD~2
# Then squash from the last line commits (i.e. most recent)

# Squash commits after pushing
# http://stackoverflow.com/questions/5667884/how-to-squash-commits-in-git-after-they-have-been-pushed
git rebase -i origin/main~4 main           # Squash commits locally
git push --force-with-lease origin main    # Force push (safer than --force)

# Combine many commits into fewer commits when merging different branch to main
git rebase -i main

# Undo git rebase
# https://stackoverflow.com/questions/134882/undoing-a-git-rebase
git reflog  # Find which head to reset to, e.g it's HEAD@{5}
git reset --hard HEAD@{5}

# Exclude, skip specific commit when merging: create a new branch, do rebase, drop the commit
# https://stackoverflow.com/questions/332528/is-it-possible-to-exclude-specific-commits-when-doing-a-git-merge
git switch -c newbranch   # legacy: git checkout -b newbranch
git rebase -i HEAD~3      # Review most recent 3 commits
# drop the commit to exclude
```

## Cherry-pick

```bash
# Cherry pick commit
git cherry-pick COMMIT_SHA
git cherry-pick -x ...  # append commit name, useful when cherry-picking from
                        # public branch for easier tracking
git cherry-pick --abort
```

## Undo / reset / revert

```bash
# Force git pull overwriting local files
# http://stackoverflow.com/questions/1125968/how-to-force-git-pull-to-overwrite-local-files
git fetch --all
git reset --hard origin/main
# Alternative: http://stackoverflow.com/questions/9589814/how-do-i-force-git-pull-to-overwrite-everything-on-every-pull
git fetch origin main
git reset --hard FETCH_HEAD

# Undo working copy modifications (modern)
# http://stackoverflow.com/questions/692246/undo-working-copy-modifications-of-one-file-in-git
git restore .                    # For all files
git restore modified_file
# Legacy combined command (still works):
# git checkout -- .
# git checkout -- modified_file
# If there are still untracked files, can remove with
# git clean -fd

# Remove files from index after updating .gitignore
# http://stackoverflow.com/questions/1274057/making-git-forget-about-a-file-that-was-tracked-but-is-now-in-gitignore
git rm -r --cached .
git rm --cached <file-name>
git rm --cached *.sql

# removes staged and working directory changes
# sometimes need to do this first:
# git rm --cached -r .
git reset --hard

# remove untracked files (-f) and directory (-d)
git clean -fd --dry-run  # Verify first, no going back!
git clean -fd

# Remove local untracked files
# http://stackoverflow.com/questions/61212/how-do-i-remove-local-untracked-files-from-my-current-git-branch
git clean -f --dry-run   # preview what's coming
git clean -f -d          # -d includes directory

# Undo git add (modern)
git restore --staged .              # all files
git restore --staged <file>         # specific file
# Legacy:
# git reset
# git reset SPECIFIC_FILE
# git reset HEAD <file>

# Undo last commit
# http://stackoverflow.com/questions/927358/undo-the-last-git-commit
git reset --soft HEAD~1

# Undo, revert to specific commit
# https://stackoverflow.com/a/1470452/3949303
# e.g A--B--C--master ==> A--B--C--A'--master
git revert --no-commit <commit-A>..
git revert --no-commit HEAD~2..
# Then after reverting, commit and push it

# Revert specific file to specific revision
git checkout <commit> -- <filename>

# Changing last commit examples
git commit -m 'initial commit'
git add forgotten_file
git commit --amend

# Amend without changing commit message
git commit --amend --no-edit
```

## Conflicts and mergetool

```bash
# Resolving conflict when only want to use ours / theirs version
# When state is in conflict
# Search for all conflicting files
grep -lr '<<<<<<<' .
git checkout --ours filepath
git checkout --theirs filepath
git add -A
git commit

# Accept theirs for ALL files
grep -lr '<<<<<<<' . | xargs git checkout --theirs

# For all files, think this will work too?
# git checkout --ours .
```

Setup mergetool (KDiff3):

1. Add the KDiff3 directory to your Windows System Path (e.g. `C:\Program Files\KDiff3\`)
2. Add kdiff3 as your Git mergetool (From Git Bash, run `git config --global merge.tool kdiff3`)
3. Add kdiff3 complete path to Git Config (From Git Bash, run `git config --global mergetool.kdiff3.path "C:/Program Files/KDiff3/kdiff3.exe"`)
4. Go into Git GUI settings and set the mergetool to kdiff3 (if Git GUI doesn't pick up this setting from git config, which it should)

In CentOS, after `sudo dnf -y install kdiff3`:

```bash
git config --global merge.tool kdiff3
```

After that, to use (when conflict present): `git mergetool`

## Diff

```bash
# Check which files will be pushed
git diff --stat --cached origin/main

# Git show difference between added (staged) file and HEAD
git diff --cached       # (or: git diff --staged)

# Git show difference between 2 commits
git diff SHA1 SHA2
# Show the name, with status, M:modified. R:renamed etc
git diff --name-status SHA1 SHA2

# See all file changes between commits
git diff --name-status START_COMMIT..END_COMMIT

# See diff or changes in a file between 2 commits
git diff HEAD^^ HEAD main.c
git diff HEAD~2 HEAD -- main.c

# See diff b/w staged and recent commits
git diff --staged
git diff HEAD  # Combine chg in working & staged, compare with HEAD
```

## Log and history

```bash
# Create alias
git config --global alias.lol "log --oneline --graph --decorate --all"

# Git show log with files changed
# https://stackoverflow.com/questions/1230084/how-to-have-git-log-show-filenames-like-svn-log-v
git log -n3 --name-status
git log -n3 --stat

# Git show log with author, date and message
git log --pretty=format:"%Cred%h %Cgreen%aI %Cblue%an: %Creset%s" -n 3
git log --pretty=format:"%h%x09%an%x09%ad%x09%s"

# Check history of file
# https://stackoverflow.com/questions/278192/view-the-change-history-of-a-file-using-git-versioning
git log --follow -p -- /path/to/file

# See log, --all includes unmerged branches, --stat shows what files changed
git log [-count] [--oneline] [--graph] [--decorate] [--all]
# --stat     See files involved
# --patched  See the content changed

# See log which file is deleted or modified or added
git log --name-status

# Show commits that "main" has but "mybranch" does not
# https://stackoverflow.com/a/24186641
git log mybranch..main
git log mybranch..main --oneline

# Show local commit history
git reflog
```

Quickly browse history of Git repo:

```bash
yarn global add git-file-history
git-file-history path/to/file.ext
```

## Remotes

```bash
# Add remote url
git remote add {remote-name} {remote-url}
# Show / Verify new remote
git remote -v
# Push to new remote
git push {remote-name} {branch-name}
# e.g. git push origin main

# Update the remote url
git remote show origin
git remote set-url origin git://new.url.here

# Clean local git repo for referencing expired remote branch
git remote prune <remote-name>

# Refresh local repo with updated remote branch
git remote update

# Refresh list of remote branches
git remote update origin --prune
```

## Working with forks

https://docs.github.com/en/free-pro-team@latest/github/collaborating-with-issues-and-pull-requests/syncing-a-fork

```bash
# Check remote
git remote -v

# Specify a new remote "upstream" that will be synced with the fork
git remote add upstream https://github.com/ORIGINAL_OWNER/ORIGINAL_REPOSITORY.git

# Verify
git remote -v

# Syncing a fork with the original
git fetch upstream
git switch main                          # legacy: git checkout main
git merge upstream/main --ff-only
```

Pull different remote without creating a remote branch locally — e.g. when checking a pull request from a forked repo. In the example, `git@github.com:user/repo.git` is the forked repo.

https://stackoverflow.com/a/10200358/3949303

```bash
git fetch git@github.com:user/repo.git remote-branch-name:local-branch-name
git switch local-branch-name             # legacy: git checkout local-branch-name
```

## Checkout PR

```bash
# With gh CLI (handles forks and cross-repo PRs automatically)
gh pr checkout <PR#>

# Without gh CLI
# https://stackoverflow.com/questions/27567846/how-can-i-check-out-a-github-pull-request
git fetch origin pull/PULL_REQUEST_ID/head:NEW_BRANCH_NAME
```

## Tags

```bash
# Refresh local tags from remote
git fetch --tags --force

# List tag
git tag -l
# Sort tag in descending order
git tag -l --sort=-v:refname
# Sort tag in ascending order
git tag -l --sort=v:refname

# Add tag
git tag -a v1.4 -m 'my version 1.4'
git tag -a v1.5 -m ''  # No message
git push --follow-tags

# Tag previous commit
# https://stackoverflow.com/questions/4404172/how-to-tag-an-older-commit-in-git
git tag -a v1.2 9fceb02 -m "Message here"

# Remove or delete tag
git tag -d 12345                         # Local tag
git push --delete origin YOUR_TAG_NAME   # Remote tag
git push origin :refs/tags/12345         # Alternative for remote tag
```

## Submodules

```bash
# Adding
git submodule add GIT_SUBMODULE_URL [submodule_dir]

# Cloning
git clone --recursive GIT_URL_WITH_SUBMODULE

# If current repo doesn't have submodules configured
# https://stackoverflow.com/questions/3796927/how-to-git-clone-including-submodules
git submodule init
git submodule update

# To update the submodule in a repo to its latest
# https://stackoverflow.com/questions/5828324/update-git-submodule-to-latest-commit-on-origin
cd submodule_dir
git switch main              # legacy: git checkout main
git pull

# Update the repo config so the submodule points to the latest commit
cd ..
git commit -am "Pulled down update to submodule_dir"

# For convenience,
git submodule foreach git pull origin main
```

Host git server locally — Go Git Service: https://github.com/gogits/gogs

## Worktree

```bash
# Fetch latest from remote
git fetch origin

# New feature branch off main
git worktree add -b feature-x ../feature-x origin/main

# Checkout someone's existing branch (e.g., to review a PR)
git worktree add -b feature-y ../feature-y origin/feature-y

# Review a PR in an isolated worktree (with gh CLI)
git worktree add ../review && cd ../review && gh pr checkout <PR#>

# Create worktree from existing local branch
git worktree add <path> <branch>

# List all worktrees
git worktree list

# Remove a worktree
git worktree remove <path>

# Delete the branch after removing worktree
git branch -D <branch>

# Prune stale references (if directory was deleted manually)
git worktree prune
```

## SSH / private key / custom port

```bash
# Create new SSH key (modern: ed25519 is shorter, faster, and at least as secure)
# https://help.github.com/articles/generating-a-new-ssh-key/
ssh-keygen -t ed25519 -C "your_email@example.com"
# Legacy: `-t rsa -b 4096` still works on very old hosts.

# Specify private key when using git
# https://stackoverflow.com/questions/4565700/specify-private-ssh-key-to-use-when-executing-shell-command-with-or-without-ruby
ssh-agent bash -c 'ssh-add /somewhere/yourkey; git clone git@github.com:user/project.git'

# Access git ssh with port other than 22
# http://stackoverflow.com/questions/3596260/git-remote-add-with-other-ssh-port
git remote add origin ssh://user@host:1234/srv/git/example
```

Configure git config when network blocks git clone ssh port 22 (https://stackoverflow.com/a/55149904):

```
Host github.com
User git
Hostname ssh.github.com
PreferredAuthentications publickey
IdentityFile ~/.ssh/id_rsa
Port 443

Host gitlab.com
Hostname altssh.gitlab.com
User git
Port 443
PreferredAuthentications publickey
IdentityFile ~/.ssh/id_rsa
```

`(gnome-ssh-askpass:7807): Gtk-WARNING **: cannot open display:` — http://stackoverflow.com/questions/16077971/git-push-produces-gtk-warning

```bash
unset SSH_ASKPASS
```

## Multiple GitHub accounts (personal + work)

3 layers:

1. **SSH key per account**
   - Why: GitHub identifies you by which SSH key you present.
   - How: SSH host alias in `~/.ssh/config` routes to the correct key. `url.insteadOf` in `~/.gitconfig` rewrites clone/push/pull URLs so you never need to type the alias manually.
2. **Git identity per directory**
   - Why: Commits need the correct name/email for each account.
   - How: `includeIf` in `~/.gitconfig` loads `~/.gitconfig-work` for work repos.
3. **gh CLI account per directory**
   - Why: `gh pr`, `gh issue`, etc. need to act as the correct account.
   - How: direnv sets `GH_TOKEN` from the correct account when you cd into a project directory.

Placeholders:
- `<personal-user>` — GitHub username for personal account
- `<personal-email>` — email for personal account
- `<work-user>` — GitHub username for work account
- `<work-email>` — email for work account
- `<work-org>` — GitHub org name for work repos

Directory layout:

```
~/github.com/<personal-user>/   → personal repos
~/github.com/<work-org>/        → work repos
```

Prerequisites — install direnv and add the hook to your shell:

```bash
# bash: add to ~/.bashrc
eval "$(direnv hook bash)"
# zsh: add to ~/.zshrc
eval "$(direnv hook zsh)"
```

### Step 1: SSH keys

Generate separate keys and add each `.pub` to the respective GitHub account. Each key can only belong to one GitHub account.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github
ssh-keygen -t ed25519 -f ~/.ssh/github-work
```

Add the following to `~/.ssh/config` (keep any existing entries):

```
# Work GitHub (<work-user>)
Host gh-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/github-work
    IdentitiesOnly yes

# Personal GitHub (<personal-user>)
# Must use "Match originalhost" instead of "Host" here. Some systems
# (e.g. Fedora) re-parse SSH config against the resolved hostname,
# which would cause "Host github.com" to also match gh-work connections.
Match originalhost github.com
    User git
    IdentityFile ~/.ssh/github
    IdentitiesOnly yes
```

### Step 2: Git config

Add the following sections to `~/.gitconfig` (keep existing settings):

```
# Work repos: use work identity
[includeIf "gitdir:~/github.com/<work-org>/"]
    path = ~/.gitconfig-work

# Rewrites git@github.com:<work-org>/... to git@gh-work:<work-org>/...
# so clone/push/pull URLs stay normal while using the work SSH key.
[url "git@gh-work:<work-org>/"]
    insteadOf = git@github.com:<work-org>/
```

Create `~/.gitconfig-work`:

```
[user]
    name = Work Name
    email = <work-email>
```

### Step 3: gh CLI

Log in to both accounts (interactive, run these yourself):

```bash
gh auth login  # personal
gh auth login  # work
```

Create `.envrc` files for automatic account switching. The `|| { …; return 1; }` guard makes direnv fail loudly if the keyring token is missing/invalid, instead of silently exporting a dead token (which would cause every `gh` call in the directory to fail in ways that are hard to diagnose):

`~/github.com/<personal-user>/.envrc`:

```bash
GH_TOKEN="$(gh auth token --user <personal-user> 2>/dev/null)" || {
  echo "direnv: <personal-user> token missing/invalid — run: env -u GH_TOKEN gh auth login -h github.com" >&2
  return 1
}
export GH_TOKEN
```

`~/github.com/<work-org>/.envrc`:

```bash
GH_TOKEN="$(gh auth token --user <work-user> 2>/dev/null)" || {
  echo "direnv: <work-user> token missing/invalid — run: env -u GH_TOKEN gh auth login -h github.com" >&2
  return 1
}
export GH_TOKEN
```

Trust both:

```bash
cd ~/github.com/<personal-user> && direnv allow
cd ~/github.com/<work-org> && direnv allow
```

### Verify

Run each on a separate prompt — direnv doesn't activate with `&&`. Use `gh api user --jq .login` rather than `gh auth status` to verify the `gh` account: when `GH_TOKEN` is set, `gh auth status` reports "Logged in using token (GH_TOKEN)" and lists keyring accounts as inactive — it doesn't plainly confirm *which* user the token maps to. `gh api user --jq .login` queries the API and prints the resolved username unambiguously.

```bash
ssh -T gh-work                 # should show <work-user>
ssh -T github.com              # should show <personal-user>

cd ~/github.com/<work-org>/<repo>
git config user.email          # should show <work-email>
gh api user --jq .login        # should print <work-user>

cd ~/github.com/<personal-user>/<repo>
git config user.email          # should show <personal-email>
gh api user --jq .login        # should print <personal-user>
```

### Re-authenticating later

Tokens eventually go bad (expiry, revocation, rotation). Refreshing them is trickier than the initial login because `GH_TOKEN` is now exported by direnv:

- `gh auth login` **refuses to write to the keyring** while `GH_TOKEN` is set — it would be immediately overridden. Unset it for the single command: `env -u GH_TOKEN gh auth login -h github.com`.
- After a successful login, direnv keeps serving the **stale cached `GH_TOKEN`** — it only re-runs `.envrc` on directory entry or when the file's mtime changes, not when the keyring updates. Force a reload: `direnv reload` (or `cd ..; cd -`).

Full sequence for re-auth:

```bash
env -u GH_TOKEN gh auth login -h github.com
direnv reload
gh api user --jq .login        # verify the new token maps to the expected user
```

## BFG repo cleaner (remove sensitive text)

https://rtyley.github.io/bfg-repo-cleaner/

Also see: https://help.github.com/articles/remove-sensitive-data/

Replace sensitive text in Git history:

```bash
# 1. Create a file showing the replacement needed
vim /tmp/replacement
```

```
secret==>REMOVED
password==>deleted
```

```bash
# Apply bfg replacement
bfg --replace-text /tmp/replacement

# Force push (use --force-with-lease for safety over bare --force)
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force-with-lease origin main
```

## Config

### Global / local profile

```bash
# Set global profile
git config --global user.name "David Heryanto"
git config --global user.email david.heryanto@hotmail.com

# Only allow fast-forward for git pull
git config --global pull.ff only

# Where does Git store global config: ~/.gitconfig
# Global gitignore
git config --global core.excludesfile '~/.gitignore'

# Set local profile - only for one repo
git config user.name "David Heryanto"
git config user.email david.heryanto@hotmail.com
```

### .gitignore

https://www.atlassian.com/git/tutorials/saving-changes/gitignore

```
**/logs           # matches any directory/folder
**/logs/debug.log
*.log
/debug.log        # Prepending a slash matches files only in the repository root

.ipynb_checkpoints/
.idea/
*.orig
ignore_me/
```

gitignore all folders with name `<folder-name>`: http://stackoverflow.com/questions/1470572/gitignore-ignore-any-bin-directory

```
<folder-name>/
```

Exclude only for MY repo: `.git/info/exclude`

### Line endings

https://help.github.com/articles/dealing-with-line-endings/

```bash
# Linux / macOS
git config --global core.autocrlf input

# Windows
git config --global core.autocrlf true

# Remove LF replaced with CRLF warning
# Note: core.safecrlf is rarely useful in modern Git — usually unnecessary to set.
git config --global core.safecrlf false
```

### Credentials (save password)

```bash
git config --global credential.helper cache                        # Default 15m
git config --global credential.helper "cache --timeout=86400"      # 24 hours

# Reset credential.helper
git config --global --unset credential.helper
```

### Proxy

```bash
# Git setup proxy
git config --global https.proxy https://user:password@proxy.company.com:8888

# Reset proxy
git config --global --unset http.proxy
git config --global --unset https.proxy
```

Setup proxy in Windows — set these environment variables:

```
https_proxy=remote.proxy.com:8080
GIT_SSL_NO_VERIFY=true
```

### HTTPS vs SSH URL rewrites

```bash
# Use https instead of git for github. Note git usually writes global config to ~/.gitconfig
# https://github.com/npm/npm/issues/5257
git config --global url."https://github.com/".insteadOf git@github.com:
git config --global url."https://".insteadOf git://

# Use git instead of https
git config --global url.git@github.com:.insteadOf https://github.com/
git config --global url.git@gitlab.mycompany.com:.insteadOf https://gitlab.mycompany.com/

# For GitHub, to clone with personal access token
git config --global url."https://x-token-auth:<token>@github.com".insteadOf https://github.com
```

### SSL / self-signed certificate

http://stackoverflow.com/questions/11621768/how-can-i-make-git-accept-a-self-signed-certificate

```bash
git config --global http.sslVerify false
# Only for single command
git -c http.sslVerify=false clone https://domain.com/path/to/git
# Initial clone
GIT_SSL_CAINFO=/etc/ssl/certs/rorcz_root_cert.pem git clone https://repo.or.cz/org-mode.git
# Add the path to cert
git config http.sslCAInfo /c/Users/user1/mycert.crt
```

Alternatively, to ignore ssl for certain repo: edit `.git/config`:

```
[http]
    sslVerify = false
```

## Github API / hooks

Github commits API: https://developer.github.com/v3/repos/commits/

```
GET api.github.com/repos/:owner/:repo/commits
GET api.github.com/repos/lisa-lab/pylearn2/commits?until=2014-01-01T16:00:49Z
```

Github hooks auto pull — in Windows important to set HOME environment var to `%USERPROFILE%`, e.g. in php:

```php
<?php echo putenv("HOME=C:\Users\Administrator");
```

- http://code.tutsplus.com/tutorials/the-perfect-workflow-with-git-github-and-ssh--net-19564
- https://gist.github.com/cowboy/619858
- http://jondavidjohn.com/git-pull-from-a-php-script-not-so-simple/

May need to disable selinux (see linux_commands.txt).

## HEAD~ and HEAD^ reference

Difference between `~` and `^`: `~n` walks n generations up the **first-parent** chain. `^n` selects the **nth parent** of a merge commit. `~` and `^` are different axes — both precise, not "fuzzy vs precise".
https://stackoverflow.com/questions/2221658/whats-the-difference-between-head-and-head-in-git

```
G   H   I   J
 \ /     \ /
  D   E   F
   \  |  / \
    \ | /   |
     \|/    |
      B     C
       \   /
        \ /
         A

A =      = A^0
B = A^   = A^1     = A~1
C = A^2  = A^2
D = A^^  = A^1^1   = A~2
E = B^2  = A^^2
F = B^3  = A^^3
G = A^^^ = A^1^1^1 = A~3
H = D^2  = B^^2    = A^^^2  = A~2^2
I = F^   = B^3^    = A^^3^
J = F^2  = B^3^2   = A^^3^2
```

## Misc

- Google Chrome: http://chrome.richardlloyd.org.uk/
- Add folder to Places in nautilus: `vim ~/.config/gtk-3.0/bookmarks`
