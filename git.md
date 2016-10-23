# List all branches
git branch -a

# Clean local git repo for referencing expired remote branch
git remote prune <remote-name>

# Refresh local repo with updated remote branch
git remote update

# Delete remote branch
git push origin --delete <branchName>
# Delete local branch
git branch -d mybranch

# Check whether a branch has been merged (usually means safe to delete)
# http://stackoverflow.com/questions/226976/how-can-i-know-in-git-if-a-branch-has-been-already-merged-into-master
git branch --merged  # Check which branch has been merged to HEAD

# Create branch
git branch newbranch
# Create branch and checkout
git checkout -b newbranch

# Remove files from index after updating .gitignore
# hhttp://stackoverflow.com/questions/1274057/making-git-forget-about-a-file-that-was-tracked-but-is-now-in-gitignore
git rm -r --cached .
git rm --cached <file-name>
git rm --cached *.sql

# Global gitignore
git config --global core.excludesfile '~/.gitignore'

# Check which files will be pushed
git diff --stat --cached origin/master

# Git show difference between added (staged) file and HEAD
git diff --cached (or git diff --staged)

# Setup mergetool
1.Add the KDiff3 directory to your Windows System Path (e.g. C:\Program Files\KDiff3\)
2.Add kdiff3 as your Git mergetool (From Git Bash, run git config --global merge.tool kdiff3)
3.Add kdiff3 complete path to Git Config (From Git Bash, run git config --global mergetool.kdiff3.path "C:/Program Files/KDiff3/kdiff3.exe")
4.Go into Git GUI settings and set the mergetool to kdiff3 (if Git GUI doesn't pick up this setting from git config, which it should)
# In CentOS, after sudo yum install kdiff3
git config --global merge.tool kdiff3

After that, to use (when conflict present): git mergetool

# Create alias
git config --global alias.lol "log --oneline --graph --decorate --all

# Videos that explain git reset, default is --mixed
https://www.youtube.com/watch?v=220qkGeEn6A   # soft: normally to group commits
https://www.youtube.com/watch?v=aYNOCvVevic   # mixed
https://www.youtube.com/watch?v=V66d5e8Ku4w   # hard

# removes staged and working directory changes
git reset --hard 

# remove untracked files(-f) and directory (-d)
git clean -fd --dry-run  # Verify first, no going back!
git clean -fd 

# Revert specific file to specific revision
git checkout ea10718c7b9a47b9e1 file/to/restore
git checkout ea10718c7b9a47b9e1~1 file/to/restore  # To commit before ea10718c7b9a47b9e1
git checkout HEAD~5 -- file/to/restore  # To 5th commits before HEAD

# Add new commit that revert changes
git revert commit-sha

# Changing last commit examples
git commit -m 'initial commit'
git add forgotten_file
git commit --amend

# Undo last commit
http://stackoverflow.com/questions/927358/undo-the-last-git-commit
http://stackoverflow.com/questions/927358/how-to-undo-the-last-commit
git reset --soft HEAD~1

# Working on wrong branch - how to copy changes to existing topic branch
git stash
git checkout branch123
git stash apply
# OR below, equivalent to: git stash apply && git stash drop
git stash pop 

# List stash 
git stash list 

# Drop the top stash 
git stash drop  
# Drop a specific stash
git stash drop stash@{0}

# Set upstream branch, i.e. push local branch to remote
git push [--set-upstream|-u] <upstream> <branch>
i.e. git push -u origin newbranch

# Set remote tracking, upstream is normally origin
git branch --set-upstream-to=upstream/foo fooh OR
git branch -u upstream/foo foo

# Combine many commits into fewer commits
# When merging different branch to master
git rebase -i master

# Show remote url
git remote -v

# Update the remote url
git remote show origin 
git remote set-url origin git://new.url.here

# Set default push behaviour
git config --global push.default simple

# Undo git add
git reset

# Undo git add for specific file
git reset HEAD <file>

# Google chrome
http://chrome.richardlloyd.org.uk/

# Set global profile
git config --global user.name "David Heryanto"
git config --global user.email david.heryanto@hotmail.com
git config --global push.default simple

# Change how git handles line endings: Windows
# https://help.github.com/articles/dealing-with-line-endings/
git config --global core.autocrlf true

# Remove LF replaced with CRLF warning
git config --global core.safecrlf false

# See log, --all includes unmerged branches, --stat shows what files changed
git log [-count] [--oneline] [--graph] [--decorate] [--all] 
--stat     # See files involved
--patched  # See the content changed

# See all file changes between commits
git diff --name-status START_COMMIT..END_COMMIT

# See diff b/w staged and recent commits
git diff --staged
git diff HEAD  # Combine chg in working & staged, compare with HEAD

# Github hooks auto pull
In Windows important to set HOME environment var to %USERPROFILE%
e.g. in php 
	<?php echo putenv("HOME=C:\Users\Administrator");
http://code.tutsplus.com/tutorials/the-perfect-workflow-with-git-github-and-ssh--net-19564
https://gist.github.com/cowboy/619858
http://jondavidjohn.com/git-pull-from-a-php-script-not-so-simple/
# May need to disable selinux (see linux_commands.txt)

# (gnome-ssh-askpass:7807): Gtk-WARNING **: cannot open display:
http://stackoverflow.com/questions/16077971/git-push-produces-gtk-warning
unset SSH_ASKPASS

# Remove tag
git tag -d 12345
git push origin :refs/tags/12345

# Remove local untracked files
http://stackoverflow.com/questions/61212/how-do-i-remove-local-untracked-files-from-my-current-git-branch
git clean -f --dry-run (preview what's coming)
git clean -f -d (-d includes directory)

# Show local commit history
git reflog

# Add tag
git tag -a v1.4 -m 'my version 1.4'
git push --follow-tags

# Remove tag (in this case, tag called '12345')
git tag -d 12345  # delete locally
git push origin :refs/tags/12345  

# Add folder to Places in nautilus
vim ~/.config/gtk-3.0/bookmarks 

# Save password in cache
git config --global credential.helper cache  # Default 15m
git config --global credential.helper "cache --timeout=43200"  # 12 hours

# Github commits API
# https://developer.github.com/v3/repos/commits/
GET api.github.com/repos/:owner/:repo/commits
GET api.github.com/repos/lisa-lab/pylearn2/commits?until=2014-01-01T16:00:49Z

# Git setup proxy
git config --global https.proxy https://user:password@proxy.company.com:8888

# Reset proxy
git config --global --unset http.proxy
git config --global --unset https.proxy

# Setup proxy in Windows. Set this environment variable
https_proxy=remote.proxy.com:8080
GIT_SSL_NO_VERIFY=true

# Only clone the last 10 revision 
git clone --depth=10 <url>
# Remove data from repository
https://help.github.com/articles/remove-sensitive-data/

# Use https instead of git for github
# https://github.com/npm/npm/issues/5257
git config --global url."https://github.com/".insteadOf git@github.com:
git config --global url."https://".insteadOf git://

#.gitignore all folder with name: <folder-name>
# http://stackoverflow.com/questions/1470572/gitignore-ignore-any-bin-directory
<folder-name>/

# Git ignore certificate error
# http://stackoverflow.com/questions/11621768/how-can-i-make-git-accept-a-self-signed-certificate
git config --global http.sslVerify false
# Only for single command
git -c http.sslVerify=false clone https://domain.com/path/to/git
# Add the path to cert
git config http.sslCAInfo /c/Users/user1/mycert.crt

# Exclude only for MY repo
.git/info/exclude

# Create new SSH key
# https://help.github.com/articles/generating-a-new-ssh-key/
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"