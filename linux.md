# Linux cheatsheet

Everyday commands first, followed by administration, desktop configuration, and historical setup notes. Examples use Linux tools and Bash unless labelled otherwise; replace sample paths, users, devices, and placeholders before use. Square brackets in command syntax denote optional arguments.

Related guides: [Bash](bash.md), [Fedora](fedora.md), [Git](git.md), [NVIDIA](nvidia.md), and [IPv6](ipv6.md).

For a fresh Fedora install or a workstation setup review, start with the [Fedora setup guide](fedora.md#workstation-setup-and-review). Use this guide for the shared procedures linked from that guide and for everyday reference.

## Contents

- [Quick reference](#quick-reference)
- [Files and directories](#files-and-directories)
- [Text and structured data](#text-and-structured-data)
- [Processes and system information](#processes-and-system-information)
- [Services and logs](#services-and-logs)
- [Network troubleshooting](#network-troubleshooting)
- [HTTP and downloads](#http-and-downloads)
- [SSH and remote access](#ssh-and-remote-access)
- [Users and permissions](#users-and-permissions)
- [Packages and development tools](#packages-and-development-tools)
- [Shell and command-line helpers](#shell-and-command-line-helpers)
- [Storage and filesystems](#storage-and-filesystems)
- [Network administration and security](#network-administration-and-security)
- [Desktop and hardware](#desktop-and-hardware)
- [Advanced diagnostics](#advanced-diagnostics)
- [Historical notes](#historical-notes)
- [References](#references)

## Quick reference

| Task | Command | More examples |
| --- | --- | --- |
| Check free disk space | `df -h` | [Disk usage](#disk-usage-and-devices) |
| Find large files | `find . -type f -size +100M` | [Finding files](#finding-files) |
| Search file contents | `grep -inr 'search token' .` | [Text filtering](#reading-and-filtering-text) |
| Find a process | `pgrep -fl 'process-name'` | [Processes](#inspecting-and-stopping-processes) |
| Inspect a service | `systemctl status --no-pager --full service_name` | [Services](#inspecting-and-managing-services) |
| Follow logs | `journalctl -f` | [Logs](#reading-logs) |
| Find a listening process | `lsof -t -i :8081 -s TCP:LISTEN` | [Ports](#ports-and-connections) |
| Resolve a hostname | `dig +short example.com` | [DNS](#dns-queries) |
| Download a file | `curl -sSL -o file https://example.com/file` | [curl](#curl-requests-and-downloads) |
| Sync a directory | `rsync -av project user@host:~` | [Copying and syncing](#copying-and-syncing) |
| Extract an archive | `tar -xf archive.tar -C /target/directory` | [Archives](#archives) |
| Locate a command | `command -v git` | [Shell helpers](#command-execution) |

## Files and directories

[Listing and paths](#listing-and-paths) · [Finding files](#finding-files) · [Copying and syncing](#copying-and-syncing) · [Archives](#archives) · [Renaming and cleanup](#renaming-and-cleanup)

### Listing and paths

**List a large directory without sorting**

<https://unix.stackexchange.com/a/120079>

```bash
# Tips: do not order the items
ls --sort=none  # or ls -U
```

**Create temporary directory**

```bash
mktemp -d
```

**Create a directory and its parents**

```bash
mkdir -p foo/bar/baz
```

**Limit directory listings**

```bash
ls -U | head -5  # -U skips the sorting to make ls faster
```

**Show full path of a file**

<https://stackoverflow.com/a/5265775>

```bash
readlink -f file.txt
```

**ls with absolute / full path**

```bash
ls -d $PWD/*
```

**ls sort by size**

<http://www.cyberciti.biz/faq/linux-ls-command-sort-by-file-size/>

```bash
ls --sort=size -l
```

**inotify tools**

<https://gist.github.com/mani95lisa/6740671>

**Watch for new files with inotifywait**

Install with `sudo dnf -y install inotify-tools`.

<https://linux.die.net/man/1/inotifywait>

<https://unix.stackexchange.com/questions/323901/how-to-use-inotifywait-to-watch-a-directory-for-creation-of-files-of-a-specific>

```bash
# Options: -r (recursive)
inotifywait -m -e create -e moved_to /path |
    while read path action file; do
        if [[ "$file" =~ .*xml$ ]]; then # Does the file end with .xml?
            echo "xml file" # If so, do your thing here!
        fi
    done
```

**Create a large test file**

<https://stackoverflow.com/questions/257844/quickly-create-a-large-file-on-a-linux-system>

```bash
fallocate -l 1G gentoo_root.img
fallocate -l 500M gentoo_root.img
```

**List files with uid**

```bash
ls -lhn /path
```

**Create a symbolic link**

```bash
ln -s /path/to/source /path/to/target/link
```

### Finding files

**ls with absolute path using find**

<https://stackoverflow.com/questions/246215/how-can-i-generate-a-list-of-files-with-their-absolute-path-in-linux>

```bash
find $PWD
find $PWD -name .htaccess
find $PWD -maxdepth 2 -name '*yaml'
```

**find filters by path and file name**

<https://stackoverflow.com/questions/4210042/how-to-exclude-a-directory-in-find-command>

```bash
# find file with name test*yaml which has *tests* in the full path
find $PWD -iname "*.yaml" -path "*/tests/*"
# find with exclude path
find $PWD -name "*.yaml" -not -path "*/tests/*"
```

**Find file and show the absolute paths**

<https://stackoverflow.com/questions/246215/how-can-i-generate-a-list-of-files-with-their-absolute-path-in-linux>

```bash
find "$PWD" -name .htaccess
find "$PWD" -iname .htaccess  # Case insensitive
find "$PWD" -name .htaccess -maxdepth 0 -type f
find "$PWD" -name "*query*" -maxdepth 0 -type f  # Wildcard query
```

**List all files with absolute path, starting with aa**

```bash
find $PWD -maxdepth 1 -iname "aa*"
```

**Find ignore permission denied**

```bash
find . -name 'file_to_found' 2>&1 | grep -v 'Permission denied'
# Find case insensitive
find -iname <file to find>
# Find with regex: https://stackoverflow.com/a/6845194/3949303
find . -regextype sed -regex ".*/[a-f0-9\-]\{36\}\.jpg"
# Find with wildcard simple
find . /search/folder -maxdepth 1 -name prefix*suffix
```

**Find location of file**

```bash
locate <filename>
# With wildcard
locate <filename*>
# Search only names in file i.e. basename
locate -b <filenames>
# Search case insensitive
locate -i <FilENAMe>
# Search, locate using regex
locate -r ^java*
locate -r .sh$ | grep intel  # Find files ends with .sh
# From current directory
locate $PWD/*{QUERY}
```

**Alternatively, find command**

```bash
find -iname <file-name>
find -type d -name <directory-name>
# http://stackoverflow.com/questions/6844785/how-to-use-regex-with-find-command
find . -regextype sed -regex ".*\.so"  # output: videoio.so, photo.so ...
```

**Update database so 'locate' command will work**

```bash
sudo ionice -c3 updatedb
```

**Find large files**

```bash
find . -type f -size +10M
find . -maxdepth 1 -type f -size +100M
```

### Copying and syncing

**Copy hidden files and directory**

<https://superuser.com/a/970185>

```bash
# -T (--no-target-directory), prevents contents of /etc/skel from being copied
# to a new folder /home/user/skel should the folder /home/user exist.
cp -rT /etc/skel /home/user
```

**Limit scp transfer rate in kilobits/second**

```bash
scp -l 400 Label.pdf mrarianto@202.x.x.x:.
```

**Move or copy multiple files to a directory/destination**

```bash
mv -t TARGET_DIRECTORY file1 file2 file3
cp -t TARGET_DIRECTORY file1 file2 file3
```

**Copy files with reference i.e. no-dereference: Work with the link (rather than the dereference)**

```bash
cp -P SOURCE TARGET
# If there is: myfile -> /b/c
# When cp -P myfile mytarget/
# Then mytarget/myfile will still contain a symlink to /b/c
# Useful when copying cudnn.so files which contain symlinks to cudnn.so.[VERSION]
```

**Sync changed files**

<https://gist.github.com/senko/1154509>

```bash
# For rsync folder, should not include trailing / i.e. project instead of project/
rsync -av project centos-2:~
# Rsync with compression
rsync -z <source-path> <target-path>
# Rsync suppress non-error messages: use -q or --quiet
```

**Rsync convert symlink to actual file. Useful if destination filesystem do**

```bash
# not support symlink.
rsync -avL <source> <dest>
rsync -avL /source/dir/containing/symlink/ /target/dir/no_more/symlink/
```

**rsync example**

```bash
for i in {1..4}
do
	rsync -av --delete $1 ulam$i:$1
done

rsync -av --delete $1 node2:$1
rsync -av --delete $1 node4:$1

rsync -u  # newer mode
```

### Archives

**Extract all .gz files in a folder**

```bash
for f in *.gz; do unar $f; done
```

**Unrar**

```bash
sudo dnf -y install unar
```

**Unzip to a directory**

```bash
unzip package.zip -d /directory
```

**Decompress gunzip *.gz**

```bash
gzip -d <file.gz>
```

**Create tar archive**

```bash
tar cvf output.tar input_folder
```

**If input_folder is in some other directory and don't want to include this directory**

```bash
# in the resulting tar archive
# https://stackoverflow.com/questions/5695881/how-do-i-tar-a-directory-without-retaining-the-directory-structure
tar cvf out.tar --directory parent_dir child_dir
```

**Parallel compress with pigz**

<http://stackoverflow.com/questions/12313242/utilizing-multi-core-for-targzip-bzip-compression-decompression>

```bash
tar cvf - paths-to-archive | pigz -9 -p 32 > archive.tar.gz
```

**Compress with gunzip tar.gz (with compr level 9)**

```bash
tar cvf - /path/to/directory | gzip -9 - > file.tar.gz
tar -zcvf output.tar.gz /home/jerry/folder  # Default
```

**Tar without compression**

<https://superuser.com/questions/529926/how-can-i-use-tar-command-to-group-files-without-compression>

```bash
tar cvf myfolder.tar myfolder
```

**Extract bz2**

```bash
bzip2 -d filename.bz2
tar xvjf firefox-31.0.tar.bz2
```

**Extract to specific directory, -C or --directory**

```bash
tar -xf archive.tar -C /target/directory
```

**Compress large files with lrzip**

<https://wiki.archlinux.org/index.php/Lrzip#Usage>

```bash
lrztar <directory>
lrzip  <file>
```

**Compress zip with password**

```bash
zip -r --encrypt out.zip folder
```

### Renaming and cleanup

**Batch rename using perl rename**

```bash
# Download from: http://anonscm.debian.org/cgit/perl/perl.git/plain/debian/rename
# Syntax: s/FIND/REPLACE/FLAGS where s/ means '/' is the delimiter
rename 's/_full/_500/' *.jpg  # "a_full.jpg" to "a_500.jpg" current dir
find . -type f -iname "*.jpg" -exec rename 's/_full/_500/' {} \;  # Recursive
# Use 'rename -n' to preview the changes
```

**Remove / delete *.gz files older than 7 days**

<https://askubuntu.com/questions/589210/removing-files-older-than-7-days>

```bash
find /path/to/ -type f -mtime +7 -name '*.gz' -delete
find /path/to/ -type f -mtime +7 -name '*.gz' -print0 | xargs -r0 rm --
```

**Remove directories / folders with a certain name**

<https://stackoverflow.com/a/13032768/3949303>

```bash
find . -type d -name <dirname> -prune -exec rm -rf '{}' +
```

**Move the last line in ls**

```bash
mv "$(echo -n $(ls | tail -n 1))" /tmp/target

ls | tail -n1 | xargs echo -n | xargs mv /tmp/TARGET
```

## Text and structured data

[Reading and filtering text](#reading-and-filtering-text) · [Replacing text](#replacing-text) · [Comparing files](#comparing-files) · [JSON and CSV](#json-and-csv) · [Checksums and encoding](#checksums-and-encoding)

### Reading and filtering text

**Print all except last N lines (e.g. last 5 lines)**

```bash
head -n -5
```

**Print all except first N lines, or starting at line +X**

```bash
tail -n +[N+1] myfile
```

**Print middle of file**

<http://serverfault.com/questions/133692/how-to-display-certain-lines-from-a-text-file-in-linux>

```bash
sed -n '100,+20p'  filename  # Line 100-120
```

**Extended grep, -i: ignore case**

```bash
egrep 'pattern1|pattern2' <filename>  # OR
egrep 'pattern1.*pattern2' <filename>  # AND fixed order
egrep 'pattern1.*pattern2|pattern2.*pattern1' <filename>  # AND any order
```

**Find which files in current directory contains string**

```bash
grep -inr 'search token' ./*
```

**grep multiple words**

```bash
cat file.txt | grep 'this\|that'
# grep with regex
cat file.txt | grep -E 'this|that'
```

**Split a file into N equal parts**

<https://stackoverflow.com/questions/7764755/how-to-split-a-file-into-equal-parts-without-breaking-individual-lines>

```bash
split --lines=250 -d --additional-suffix=.csv big.csv
```

**Select the n-th column from bash output, eg. select 2nd column**

<https://stackoverflow.com/questions/7315587/bash-shortest-way-to-get-n-th-column-of-output>

```bash
awk '{print $2}'
```

**See hidden character in Bash, e.g some reset character**

```bash
echo $MY_VARIABLE | cat -v
```

### Replacing text

**Replace line containing string with sed**

```bash
sed -i "s/oldtext/newtext/g" file.txt
# Replace whole line containing string
# https://stackoverflow.com/questions/11245144/replace-whole-line-containing-a-string-using-sed
# Note: "no /s /g " and "with c\"
sed -i "/oldtext/c\newtext" file.txt
```

**sed replace with regex**

<https://unix.stackexchange.com/questions/78625/using-sed-to-find-and-replace-complex-string-preferrably-with-regex>

```bash
sed -i -E "s/(<username>.+)name(.+<\/username>)/\1something\2/" file.xml
```

**sed: Stream editor. Search for line with 'bind-address'**

```bash
# and replace 127.0.0.1 with 0.0.0.0 in file 50-server.cnf
sed -i "/bind-address/s/127.0.0.1/0.0.0.0/g" /etc/mysql/mariadb.conf.d/50-server.cnf
```

### Comparing files

**Create patch from diff**

<https://stackoverflow.com/a/437241/3949303>

```bash
# -u, --unified  output in unified context
diff -u oldfile newfile > patchfile
```

**Check diff for output of two different commands**

<https://stackoverflow.com/questions/345505/how-can-you-diff-two-pipelines-in-bash>

```bash
diff <(cat file1) <(cat file2)
```

**Show diff with nice color output**

<https://github.com/so-fancy/diff-so-fancy>

```bash
# Install with: npm install -g diff-so-fancy
# Note that -u shows diff output in unified context (suitable for git patch file)
diff -u file1 file2 | diff-so-fancy
```

### JSON and CSV

**Parse json, sudo dnf -y install jq**

```bash
run_command | jq
```

**Using jq in a shell pipeline: Using identity filter: '.'**

```bash
curl -s https://api.github.com/users/octocat/repos | jq '.' | cat
```

**Tools to work csv**

```bash
pip install csvkit
```

**Convert .xlsx to .csv then insert to MySQL database**

```bash
in2csv --sheet <sheetname> <infile>.xlsx | csvsql --insert \
  --db mysql://user:password@<hostname>/<dbname> \
  --table <newtablename>
```

### Checksums and encoding

**Calculate hash**

```bash
echo -n "text to hash" | shasum
```

**Encode base64 without new line**

```bash
echo -n "xxxxx" | base64 -w0
```

**Check sha1 of file**

```bash
sha1sum filename
```

**Checksum: check hash of file**

<http://unix.stackexchange.com/questions/78338/a-simpler-way-of-comparing-md5-checksum>

```bash
# DOUBLE space after hash
echo "ff9f75d4e7bda792fca1f30fc03a5303  package.deb" | md5sum -c -
```

## Processes and system information

[Inspecting and stopping processes](#inspecting-and-stopping-processes) · [Background jobs](#background-jobs) · [System and hardware information](#system-and-hardware-information) · [Resource monitoring](#resource-monitoring)

### Inspecting and stopping processes

**Check which user start a process**

```bash
pgrep <process-name>
ps -p <pid> -o ruser=
```

**Stop processes**

```bash
kill -SIGKILL 1686
# Kill all process by name
pkill <process-name>
# http://stackoverflow.com/questions/6381229/how-to-kill-all-processes-matching-a-name
kill -9 $(pgrep amarok)
# Kill process by username: https://stackoverflow.com/questions/15452081/kill-all-processes-for-a-given-user
pkill -9 -u `id -u username`
```

**pgrep with pattern -f and listing -l**

```bash
pgrep -fl .*beav.*
```

**Find process by name**

```bash
# Check which user runs the process
ps aux | grep [process_name]
```

**Show process including start time in wide format**

```bash
# Use [p]rocess_name trick so results will exclude grep itself
# https://unix.stackexchange.com/questions/74185/how-can-i-prevent-grep-from-showing-up-in-ps-results
ps -ww -eo pid,lstart,cmd | grep "[p]rocess_name"
watch -n1 "ps -ww -eo pid,lstart,cmd | grep '[p]rocess_name'"
```

**View non-trimmed (non truncated) ps output: -w (wide)**

<https://stackoverflow.com/questions/2159860/viewing-full-output-of-ps-command>

```bash
ps auxw
ps auxww
```

**List process full arguments**

<https://stackoverflow.com/questions/821837/how-to-get-the-command-line-args-passed-to-a-running-process-on-unix-linux-syste>

```bash
ps -ww -fp <pid>  # -ww for wide output
cat /proc/<pid>/cmdline
```

**Show process start time**

<https://stackoverflow.com/questions/5731234/how-to-get-the-start-time-of-a-long-running-linux-process>

```bash
ps -eo pid,lstart,cmd | grep node
```

**Find process by user**

```bash
pgrep -u <username> | xargs ps -f -p
```

**Kill process by name, 2 methods (pgrep is more reliable):**

<https://unix.stackexchange.com/questions/74185/how-can-i-prevent-grep-from-showing-up-in-ps-results>

```bash
pgrep
ps aux | grep -ie [a]marok | awk '{print $2}' | xargs kill -9
# [a]marok trick
# Intent: look for word starts with a, followed by marok
# Literal: Because of the bracket, grep will not match itself, because
#          the process name is 'grep -ie [a]marok'. There's "]" after a
# Alternative to [a]marok trick is to grep all except the last line, ps aux | grep amarok | head -n -1
```

**Check if file is being used by a process**

<https://superuser.com/questions/97844/how-can-i-determine-what-process-has-a-file-open-in-linux>

```bash
lsof <filepath>
```

**List Linux Signals**

```bash
kill -l
 1) SIGHUP   2) SIGINT   3) SIGQUIT  4) SIGILL   5) SIGTRAP
 6) SIGABRT  7) SIGBUS   8) SIGFPE   9) SIGKILL 10) SIGUSR1
11) SIGSEGV 12) SIGUSR2 13) SIGPIPE 14) SIGALRM 15) SIGTERM
```

**Send SIGHUP to an application**

```bash
kill -1 $PID
```

### Background jobs

**Put running process to background**

<http://stackoverflow.com/questions/625409/how-do-i-put-an-already-running-process-under-nohup>

```text
Ctrl + Z; bg; disown -h [job-spec]  # Where %1 is the first running job, use 'jobs' to list jobs
```

**Write pid of nohup process: echo $! > run.pid**

<https://stackoverflow.com/questions/20254155/how-to-run-nohup-and-write-its-pid-file-in-a-single-bash-statement>

```bash
nohup ./myprogram.sh > /dev/null 2>&1 & echo $! > run.pid
```

**nohup multiple commands**

<https://unix.stackexchange.com/questions/47230/how-to-execute-multiple-command-using-nohup>

```bash
nohup bash -c 'wget "$0" && wget "$1"' "$url1" "$url2" &> /dev/null &
```

**Run background process with sudo (use -b option)**

<http://stackoverflow.com/questions/17475098/getting-sudo-and-nohup-to-work-together>

```bash
sudo -b ./ascii_loader_script.pl 20070502 ctm_20070502.csv
```

**Prevent processes from being killed after loggin out of ssh client**

```bash
nohup program &
nohup program &> program.log &  # Redirect all stdout and stderr to a log file
```

### System and hardware information

**Check kernel version**

```bash
uname -r
cat /proc/version
dmesg | grep 'Linux version'
```

**Get hardware and system info**

```bash
cat /proc/meminfo
# Memory in GB: https://stackoverflow.com/questions/29811297/how-to-display-proc-meminfo-into-megabytes
awk '$3=="kB"{$2=$2/1024**2;$3="GB";} 1' /proc/meminfo | column -t | head
cat /proc/cpuinfo
uname -a or uname --help
```

**Distro**

```bash
cat /etc/*-release
```

**Check all the components**

```bash
sudo dmidecode
# Get devices location on PCI bus i.e. device manager in Linux
lspci
# Get GPU information
lspci | grep -i vga OR lspci | grep -i nvidia
# Get computer model number
# https://unix.stackexchange.com/questions/75750/how-can-i-find-the-hardware-model-in-linux
sudo dmidecode | grep -A5 'System Information'
sudo dmidecode -t1
```

### Resource monitoring

**htop**

```bash
F4  # Filter
F6  # Sort by
I   # Inverse sorting
```

**Multiprocessor sys monitor**

<http://www.cyberciti.biz/tips/top-linux-monitoring-tools.html>

```bash
mpstat -P ALL
```

**Monitor disk activity**

```bash
sudo dnf -y install iotop
sudo iotop [-oP]  # Show only processes using IO
```

**Monitor CPU temperature**

```bash
sudo dnf install lm_sensors
sudo sensors-detect
watch -n 1 sensors
```

**Watch a sequence of commands**

```bash
watch -n1 "sensors | grep temp | awk '{ print $2 }'"
```

## Services and logs

[Inspecting and managing services](#inspecting-and-managing-services) · [Reading logs](#reading-logs) · [Writing systemd services](#writing-systemd-services) · [Systemd timers](#systemd-timers) · [Cron and scheduled commands](#cron-and-scheduled-commands)

### Inspecting and managing services

**Systemctl tips**

```bash
# Show all, no horizontal scroll
# https://askubuntu.com/questions/747156/how-to-avoid-horizontal-scrolling-in-systemctl-status
systemctl status --no-pager --full service_name
```

**List all services**

```bash
systemctl list-units --all | grep airflow
systemctl -a | grep airflow
```

**List all services**

<https://fedoraproject.org/wiki/SysVinit_to_Systemd_Cheatsheet>

```bash
systemctl list-unit-files --type=service
```

**Startup service**

```bash
systemctl enable <service-name>
```

**Change default runlevel targets: login in console / graphical mode**

<https://onemoretech.wordpress.com/2014/07/23/changing-runlevels-with-systemctl/>

```bash
# One time
systemctl isolate graphical.target
# Set default
systemctl set-default graphical.target
```

**Switch systemctl target: Useful when trying to unload some module like nvidia-drm**

<https://unix.stackexchange.com/questions/440840/how-to-unload-kernel-module-nvidia-drm/441079>

```bash
sudo systemctl isolate multi-user.target
# Then to start normally again
systemctl start graphical.target
```

### Reading logs

**Journalctl for systemd logs**

<https://www.digitalocean.com/community/tutorials/how-to-use-journalctl-to-view-and-manipulate-systemd-logs>

```bash
timedatectl status  # Check system time
journalctl
-b: logs from current boot (-1/caf0524a1d394ce0bdbcff75b94444fe: specific boot)
--list-boots
```

**Filter by time**

```bash
--since "2015-01-10 17:15:00" --until "2015-01-11 03:00"
--since yesterday
--since 09:00 --until "1 hour ago"
--since '1m ago'
```

**Filter by message interest**

```bash
journalctl -u nginx.service [--since today]
journalctl -u nginx.service -u php-fpm.service --since today  # Nginx connected to PHP-FPM
journalctl _PID=8088
id -u user / id -G usergroup
journalctl _UID=33 --since today  # _GID
```

**Check available fields**

```bash
man systemd.journal-fields
journalctl -F _GID  # check which group IDs the systemd journal has entries for

journalctl /usr/bin/bash  # Those involve that executable
journalctl -k  # Kernel messages

journalctl -p err -b   # Error level and above from current boot
                       # crit, error, warning, info, debug

journalctl --no-pager  # Prints to stdout, default is pager
journalctl -b -u nginx -o json
journalctl -b -u nginx -o json-pretty

journalctl -n [10]     # Recent 10 messages
journalctl -f          # Follow logs as they are being written

journalctl --disk-usage  # How much storage is used by journal
sudo journalctl --vacuum-size=1G  # Remove old entries until space taken is 1G
sudo journalctl --vacuum-time=1years
```

**Journalctl save past boots**

```bash
sudo mkdir -p /var/log/journal OR
sudo vim /etc/systemd/journald.conf
  [Journal]
  Storage=persistent
  SystemMaxUse=1G/500M
```

**Access syslog**

```bash
journalctl -f
```

### Writing systemd services

References: [startup scripts](http://stackoverflow.com/questions/28420466/fedora-20-how-to-run-script-at-the-end-of-startup), [KillMode](https://www.freedesktop.org/software/systemd/man/systemd.kill.html#), [startup troubleshooting](http://stackoverflow.com/questions/29508981/systemd-service-startup-issue), and [service options](https://www.freedesktop.org/software/systemd/man/systemd.service.html).

Create `/etc/systemd/system/<service_name>.service`:

```ini
[Unit]
Description=[description_string]
After=syslog.target network.target

[Service]
WorkingDirectory=[working_directory]
Type=simple
ExecStart=[absolute path to command]
KillMode=process
User=[user]
Group=[usergroup]
Restart=[on-failure/on-success/always/no]
RestartSec=30s

[Install]
WantedBy=multi-user.target

```

**Additional service settings**

For a one-shot service (`Type=oneshot`):

- Use `RemainAfterExit=true` if the service maintains state, such as a PID file created by `ExecStart` and removed by `ExecStop`.
- Multiple `ExecStart` entries are allowed.

```ini
[Service]
Environment=JAVA_HOME=/opt/jdk
EnvironmentFile=/run/metadata/coreos
EnvironmentFile=/etc/environment
LimitNOFILE=65536  # Max no of file desciptors
ExecStartPre=/bin/sleep 30  # To add startup delay for instance

```

**One-shot service**

<https://gist.github.com/drmalex07/d006f12914b21198ee43>

```ini
[Unit]
Description=Setup foo
After=network.target

[Service]
Type=oneshot
ExecStart=/opt/foo/setup-foo.sh
RemainAfterExit=true
ExecStop=/opt/foo/teardown-foo.sh
StandardOutput=journal

[Install]
WantedBy=multi-user.target

```

Reload systemd after changing a unit file:

```bash
sudo systemctl daemon-reload
```

### Systemd timers

**Schedule a service with a timer**

<https://unix.stackexchange.com/questions/198444/run-script-every-30-min-with-systemd>

Create a matching `.service` and `.timer` file, then start the timer with `systemctl start myapp.timer`.

`/etc/systemd/system/test.service`:

```ini
[Unit]
Description=test job

[Service]
Type=oneshot
ExecStart=/bin/bash /tmp/1.sh

```

`/etc/systemd/system/test.timer`:

```ini
[Unit]
Description=test

[Timer]
OnUnitActiveSec=120s
OnBootSec=60s

[Install]
WantedBy=timers.target

```

**Alternative timer settings**

<https://www.freedesktop.org/software/systemd/man/systemd.time.html>

```ini
# e.g. daily at midnight: OnCalendar=*-*-* 00:00:00 UTC
[Timer]
OnBootSec=10min
OnUnitActiveSec=1w 1d 5h 30min 10sec

[Timer]
OnCalendar=weekly/daily
Persistent=true

```

List timers:

```bash
systemctl list-timers --all --no-pager
```

### Cron and scheduled commands

**Schedule a command to run later**

<https://askubuntu.com/questions/339298/conveniently-schedule-a-command-to-run-later>

```bash
at now +8 hours -f ~/myscript.sh
echo "tweet fore" | at teatime
```

**Cron tabs**

<https://en.wikipedia.org/wiki/Cron>

```text
┌───────────── min (0 - 59)
│ ┌────────────── hour (0 - 23)
│ │ ┌─────────────── day of month (1 - 31)
│ │ │ ┌──────────────── month (1 - 12)
│ │ │ │ ┌───────────────── day of week (0 - 6) (0 to 6 are Sunday to
│ │ │ │ │                  Saturday, or use names; 7 is also Sunday)
│ │ │ │ │
│ │ │ │ │
* * * * *  command to execute

# Every 5 minutes: https://crontab.guru/every-5-minutes
*/5 * * * *

# Add a cron job non-interactively
# https://stackoverflow.com/a/9625233
(crontab -l 2>/dev/null; echo "00 09 * * 1-5 echo hello") | crontab -

# Alternatively
cat <<EOF > /tmp/cronjobs
0 0 * * * /usr/bin/echo job1
0 0 * * * /usr/bin/echo job2
EOF
crontab -u root /tmp/cronjobs

# Clean up /tmp folder every month (For server that rarely restarts)
# https://askubuntu.com/questions/380238/how-to-clean-tmp
sudo su -

> vim /root/scripts/clean_tmp.sh
find /tmp -ctime +30 -exec rm -rf {} +

crontab -e
0 0 1 * * /root/scripts/clean_tmp.sh

crontab -l
```

## Network troubleshooting

[Addresses and connectivity](#addresses-and-connectivity) · [DNS queries](#dns-queries) · [Routing](#routing) · [Ports and connections](#ports-and-connections) · [Traffic capture and monitoring](#traffic-capture-and-monitoring) · [Wi-Fi diagnostics](#wi-fi-diagnostics)

### Addresses and connectivity

**Check public ip address**

```bash
curl ipecho.net/plain
curl ipinfo.io/ip
```

**Check network connectivity with ping**

```bash
while true; do ping -c 1 google.com; sleep 1; done
```

**Path MTU Discovery: Check MTU path and size between two devices**

<https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/network_mtu.html>

```bash
tracepath amazon.com
```

**Get current machine internal ip address**

```bash
hostname --ip-address
```

**Find location of ip address**

```bash
curl ipinfo.io/203.211.151.197
```

**IP calculator CIDR with ipcalc**

<https://linux.die.net/man/1/ipcalc>

```bash
ipcalc 192.168.1.1/24
```

**IP calculator CIDR tool online**

<https://www.ipaddressguide.com/cidr>

**List of private subnet**

<https://en.wikipedia.org/wiki/Private_network>

```text
10.0.0.0/8        (10.0.0.0    - 10.255.255.255 )
172.16.0.0/12     (172.16.0.0  - 172.31.255.255 )
192.168.0.0/16    (192.168.0.0 - 192.168.255.255)
```

**Definition of IP address, port number in networking**

<https://stackoverflow.com/questions/37496411/what-is-difference-between-ip-address-and-port-number-in-networking>

```text
"IP address" is address of the system in the Network.
"Port" is address of the service within the System.
"IP address + Port" defines "address" of the particular service on the particular system.
```

### DNS queries

**Query specific nameserver / dns server; apt-get install dnsutils**

```bash
nslookup somewhere.com some.dns.server
dig google.com @8.8.8.8
```

**Check dns latency for queries**

<https://serverfault.com/a/599912>

```bash
dig google.com +trace
```

**Install dig**

```bash
apt-get -y install dnsutils
```

**Tools to query dns server: host server.local mydns.server.ip**

```bash
sudo dnf -y install bind-utils
sudo apt-get -y install dnsutils
```

**Install BIND tools e.g. to find ip of host**

```bash
sudo dnf -y install bind-utils
```

**Find ip address of domain or hostname**

<http://unix.stackexchange.com/questions/20784/how-can-i-resolve-a-hostname-to-an-ip-address-in-a-bash-script>

```bash
dig +short google.com
# Alternatively
nslookup unix.stackexchange.com
getent hosts unix.stackexchange.com
host yahoo.com [DNS_SERVER] # 2nd alternative
```

**Find whois data**

```bash
whois yahoo.com
```

### Routing

**Get route / routing table**

```bash
ip route show table all
```

**Get routing table for specific table**

<https://serverfault.com/questions/618857/list-all-route-tables>

```bash
ip route show table 220
```

**Get name of routing table**

```bash
ip route show table all | grep "table" | sed 's/.*\(table.*\)/\1/g' | awk '{print $2}' | sort | uniq
```

**Check the route or path to specific ip**

```bash
traceroute google.com
```

**Check route to specific ip**

```bash
ip route get <ip_addr>
```

**Find the gateway of the connection**

```bash
ip route | grep default
```

**Find the gateway ip (-n means don't resolve names).**

```bash
# This command useful to debug VPN
route -n
```

**Add routes and delete routes**

```bash
sudo ip route add 172.16.0.0/20 via 10.8.0.1 [dev DEVICE]
sudo ip route del 172.16.0.0/20 via 10.8.0.1 [dev DEVICE]
```

**Set NetworkManager to prefer WiFi over Ethernet for internet access**

<https://bbs.archlinux.org/viewtopic.php?id=141949>

```bash
route add default gw {ip-of-gateway} {wifi-interface}  # check with route -n
```

### Ports and connections

**Check local and foreign address: Useful for finding public ip on vpn server**

```bash
netstat  # Look for matching Local Address and Foreign Address
```

**Show TCP ports that are being listened on**

```bash
# -p display PID/Program name for sockets
# -l display listening server sockets
# -n numeric, don't resolve names
# -t show TCP protocol only
sudo netstat -plnt
```

**Get only the pid of process listing to certain port: lsof -t (terse)**

<https://unix.stackexchange.com/a/443770>

```bash
# lsof -t -i :<port> -s <PROTO>:LISTEN
lsof -t -i :8081 -i :8082
lsof -t -i :8081 -s TCP:LISTEN
```

**Check outgoing / outbound connection for an application, eg sublime text**

```bash
sudo netstat -nputwc | grep subl
```

**Check open ports, sudo dnf -y install nmap**

<https://www.digitalocean.com/community/tutorials/how-to-use-nmap-to-scan-for-open-ports-on-your-vps>

```bash
nmap -Pn 10.0.0.1
```

**Alternatively**

```bash
sudo netstat -lptu
sudo netstat -lanp | grep 8088  # Alternatively
```

**Exit telnet**

```text
Ctrl + ]
```

**Ping with port**

<http://superuser.com/questions/769541/is-it-possible-to-ping-an-addressport>

```bash
nmap -p 80 onofri.org
telnet 192.168.153.1 1433
```

**Check which process listening to port N**

```bash
# --numeric, --listening, --programs
netstat -nlp | grep <port-num>
# To watch this, usually need to supress stderr
watch "netstat -nlp 2> /dev/null | grep -E '300*'"
# If not installed: sudo apt-get -y install netcat-openbsd
```

**Check if port on remote server is open**

```bash
# If netcat not installed: sudo apt-get -y install netcat
# http://superuser.com/questions/621870/test-if-a-port-on-a-remote-system-is-reachable-without-telnet
nc -z 127.0.0.1 9200; echo $?  # 0: open, 1: closed
nc 127.0.0.1 8080 < /dev/null; echo $?  # 0 is open
```

**Test UDP connection**

```bash
# On server
nc -ulvp 4500
# On client
nc -uv 4500
# Then type any text, type "Enter", server should echo same text
```

### Traffic capture and monitoring

**tcpdump filter by source IP**

<https://danielmiessler.com/study/tcpdump/>

```bash
sudo tcpdump src 10.140.0.2
```

**traffic going to or from 1.1.1.1**

```bash
tcpdump host 1.1.1.1
```

**tcpdump http traffic**

<https://stackoverflow.com/a/39013705>

```bash
sudo tcpdump -i any -s 0 'tcp port http'
```

**Monitor traffic to a destination IP with tcpdump**

<https://www.rationallyparanoid.com/articles/tcpdump.html>

```bash
sudo tcpdump -n dst host DESTINATION_IP
```

**Find who is pinging me**

<https://askubuntu.com/questions/430069/how-to-monitor-who-is-pinging-me>

```bash
sudo tcpdump -i eth0 icmp and icmp[icmptype]=icmp-echo
```

**tcpdump get HTTP request and response body**

<https://stackoverflow.com/questions/4777042/can-i-use-tcpdump-to-get-http-requests-response-header-and-response-body>

```bash
# HTTP GET
sudo tcpdump -s 0 -A 'tcp[((tcp[12:1] & 0xf0) >> 2):4] = 0x47455420'
# HTTP POST
sudo tcpdump -s 0 -A 'tcp dst port 80 and (tcp[((tcp[12:1] & 0xf0) >> 2):4] = 0x504f5354)'
```

**Monitor network speed**

```bash
sudo dnf -y install nethogs
sudo nethogs <interface>  # Use 'ip addr' to check
```

**Monitor UDP traffic**

```bash
sudo dnf -y install iptraf
iptraf-ng
```

**Monitor total network data usage**

<https://askubuntu.com/questions/15836/how-to-track-the-total-network-data-in-a-month>

```bash
sudo dnf -y install vnstat
sudo systemctl start vnstat
# First update the database
sudo vnstat -u -i [INTERFACE]
# Query the database
vnstat -q -i [INTERFACE]
```

**Monitor total network data usage with iftop**

```bash
sudo dnf -y install iftop
sudo iftop -i [INTERFACE_NAME]
```

### Wi-Fi diagnostics

**Check if wifi has a/c band. Command below should return results**

<https://unix.stackexchange.com/questions/283352/how-can-i-find-if-my-wifi-card-supports-802-11ac>

```bash
iw list | grep VHT
```

**Check if Intel wifi driver needs installation**

<https://askubuntu.com/a/706030>

```bash
sudo modprobe iwlwifi
dmesg | grep iwl
```

**Check if wifi is blocked**

<https://askubuntu.com/a/1138917>

```bash
rfkill
```

**Get Wifi BSSID / Mac Address of Access Points**

<https://askubuntu.com/questions/40068/show-bssid-of-an-access-point>

```bash
sudo iwlist scanning
```

**Monitor wifi signal**

<https://askubuntu.com/questions/95676/a-tool-to-measure-signal-strength-of-wireless>

```bash
sudo dnf -y install wavemon
wavemon
```

## HTTP and downloads

[curl requests and downloads](#curl-requests-and-downloads) · [wget downloads](#wget-downloads) · [HTTPie](#httpie) · [aria2 downloads](#aria2-downloads)

### curl requests and downloads

**Common curl options**

```bash
# -s: silent, -S: show error even when silent, -L: follow redirects
curl -sSL -o /output/path https://download/url
```

**Curl with header and POST method**

```bash
curl -XPOST -H 'Authorization:Bearer xxx' https://secure.endpoint.com
```

**Download file with curl**

```bash
curl -LO https://get.helm.sh/helm-v3.1.2-linux-amd64.tar.gz
```

**Curl show response header**

<https://stackoverflow.com/a/26644485>

```bash
# -D: dump header, "-" send to stdout
curl -D - http://example.com
```

**Curl with HTTP basic authentication**

```bash
curl -u <username>:<password> http://somesite.com
```

**Download (curl, wget) and extract tar archive**

```bash
curl http://mylink.tar.gz | tar xz
```

**Curl POST request**

<http://superuser.com/questions/149329/what-is-the-curl-command-line-syntax-to-do-a-post-request>

```bash
curl --data "param1=value1&param2=value2" https://example.com/resource.cgi
curl --form "fileupload=@my-file.txt" https://example.com/resource.cgi
```

**Curl POST JSON**

<http://stackoverflow.com/questions/7172784/how-to-post-json-data-with-curl-from-terminal-commandline-to-test-spring-rest>

```bash
curl -X POST -H "Content-Type: application/json" -d '{"key":"val"}' URL
```

**Check if server is serving gzipped content**

<http://stackoverflow.com/questions/9140178/how-can-i-tell-if-my-server-is-serving-gzipped-content>

```bash
curl http://example.com/ --silent --write-out "%{size_download}\n" --output /dev/null
curl http://example.com/ --silent -H "Accept-Encoding: gzip,deflate" --write-out "%{size_download}\n" --output /dev/null
```

**HTTP request, response service**

<https://httpbin.org>

<https://github.com/postmanlabs/httpbin>

```bash
docker run -p 8080:80 kennethreitz/httpbin
```

### wget downloads

**Follow remote name when downloading with wget**

```bash
wget --content-disposition [URL]
```

**wget to a specific directory (-P prefix / --directory-prefix)**

```bash
wget -P /save/at/this/directory/ http://download/file.txt
```

**wget save to a different filename**

<https://stackoverflow.com/questions/16678487/wget-command-to-download-a-file-and-save-as-a-different-filename>

```bash
wget -O foo.html google.com
```

**wget download and extract without saving: -O- (output to stdout), -q (quiet i.e. supress output)**

<https://unix.stackexchange.com/questions/85194/how-to-download-an-archive-and-extract-it-without-saving-the-archive-to-disk>

```bash
wget -qO- LINK_TO_DOWNLOAD.tar.gz | tar xz
wget -qO- LINK_TO_DOWNLOAD.tar.gz | tar xzf -
wget -qO- LINK_TO_DOWNLOAD.tar.gz | tar xzf - -C /existing_target_directory
# Other method:
wget -qO- your_link_here | tar xvz [-C /target/directory]
```

**If archive is not in gzip format**

```bash
tar xJ myarchive.xz
```

**For GNU tar**

```bash
wget -qO- your_link_here | tar --transform 's/^dbt2-0.37.50.3/dbt2/' -xvz
```

**wget background**

<http://stackoverflow.com/questions/21365251/how-to-run-wget-in-background-for-an-unattended-download-of-files>

**wget batch file (content-disposition so wget uses original output file)**

```bash
wget --content-disposition -i url-list.txt [--no-check-certificate]
```

**wget download all files with certain extension from url**

<http://stackoverflow.com/questions/8755229/how-to-download-all-files-but-not-html-from-a-website-using-wget>

```bash
wget -A pdf,jpg -m -p -E -k -K -np http://site/path/
wget -A pdf,jpg -m -p -E -k -K -np -nd http://site/path/  # No dir structure
```

### HTTPie

**HTTP Client: httpie,**

<https://github.com/jakubroztocil/httpie>

```bash
# sudo dnf -y install httpie
http [flags] [METHOD] URL [ITEM [ITEM]]
http -f POST example.org hello=World  # Forms
http -a USERNAME POST https://api.github.com/repos/jakubroztocil/httpie/issues/83/comments body='HTTPie is awesome! :heart:'  # Post comment on issue with authentication
http example.org/file > file  # Download file
http www.google.com search=='HTTPie logo' tbm==isch  # Query param
http :/foo  # Shortcut to http://localhost:foo
http PUT example.org name=John email=john@example.org  # Json is the default
```

**httpie: send body JSON from file**

```bash
http POST api.example.com/person/1 < person.json
```

**httpie: check for status code. Use --check-status and --ignore-stdin**

<https://httpie.org/doc#other-notes>

**httpie: query string / url parameters**

```bash
http example.com param1==value1
```

**Using session**

<https://httpie.org/doc#sessions>

```bash
http --session=/tmp/session POST :8080/secured 'Authorization: Bearer xxxx'
http --session=/tmp/session POST :8080/secured

#!/bin/bash
if http --check-status --ignore-stdin --timeout=2.5 HEAD example.org/health &> /dev/null; then
    echo 'OK!'
else
    case $? in
        2) echo 'Request timed out!' ;;
        3) echo 'Unexpected HTTP 3xx Redirection!' ;;
        4) echo 'HTTP 4xx Client Error!' ;;
        5) echo 'HTTP 5xx Server Error!' ;;
        6) echo 'Exceeded --max-redirects=<n> redirects!' ;;
        *) echo 'Other Error!' ;;
    esac
fi
```

**Helper site to check for status code**

<https://httpstat.us/401>

<https://httpstat.us/200>

### aria2 downloads

**Download manager: aria2**

```bash
sudo dnf -y install aria2

aria2c -x8 <download-link>

```

Example `~/.aria2/aria2.conf`:

```ini
  max-connection-per-server=5
  max-upload-limit=50K
  seed-time=0

```

**Torrent downloads**

```bash
aria2c <torrent-link> --seed-time=0  # Torrent: quit when finished

```

**Set the output filename**

```bash
aria2c -o myfile.zip "http://mirror1/file.zip" "http://mirror2/file.zip"

```

**Set filenames within a torrent**

1. Check the file index with `--show-files`.
2. Set the output path for each index:

```bash
aria2c --dir=/tmp --index-out=1=mydir/base.iso --index-out=2=dir/driver.iso file.torrent

aria2c -i <download-links-separated-by-newline>  # Download from input file

```

**Use the server's filename (Content-Disposition)**

```bash
URL="https://example.com/file"  # Replace with actual URL

# If aria2c ignores Content-Disposition and saves as index.html:
FILENAME=$(curl -sI "$URL" | grep -i content-disposition | sed 's/.*filename="\([^"]*\)".*/\1/')
echo "Downloading as: $FILENAME"
aria2c -x4 --out="$FILENAME" "$URL"

# One-liner version:
aria2c -x4 --out="$(curl -sI '$URL' | grep -i content-disposition | sed 's/.*filename="\([^"]*\)".*/\1/')" "$URL"

# Try this first (may not work on all versions):
aria2c --content-disposition-default-utf8=true "$URL"
```

## SSH and remote access

[Keys and ssh-agent](#keys-and-ssh-agent) · [Connection settings](#connection-settings) · [Tunnels and proxies](#tunnels-and-proxies) · [Remote commands and desktops](#remote-commands-and-desktops) · [Remote filesystems](#remote-filesystems)

### Keys and ssh-agent

**Gather ssh public keys. Aid in building and verifying ssh_known_hosts files**

```bash
# Note that this may be prone to man-in-the-middle attack
ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts
```

**Generate ssh public and private key**

```bash
ssh-keygen -t rsa -b 4096 -C "david.heryanto@hotmail.com"
```

**For non-interactive**

```bash
ssh-keygen -t rsa -b 4096 -P '' -f ~/.ssh/id_rsa
```

**Copy public key to a remote host**

```bash
ssh-copy-id -i ~/.ssh/id_rsa.pub [user@]remote-host
```

**Print ssh public key fingerprint**

```bash
ssh-keygen -E md5 -l -f your_public_key.pub
ssh-keygen -l -f id_rsa.pub
ssh-keygen -E sha256 -l -f /var/ssh/ssh_host_rsa_key.pub
```

**Auto start ssh-agent and ssh-add**

<http://unix.stackexchange.com/questions/90853/how-can-i-run-ssh-add-automatically-without-password-prompt>

```bash
vim ~/.bashrc  # Somehow ~/.bash_profile doesn't work
if [ -z "$SSH_AUTH_SOCK" ] ; then
  eval `ssh-agent -s`
fi
ssh-add &> /dev/null
ssh-add ~/.ssh/*.pem &> /dev/null
# Must add this to the top of ~/.bashrc, otherwise scp may work incorrectly (bug in scp)
# https://www.fir3net.com/UNIX/General/why-does-scp-file-transfer-fail-but-there-is-no-error.html
# If not running interactively, don't do anything
[[ $- == *i* ]] || return
```

**NOTE**

<http://docs.ansible.com/ansible/latest/intro_getting_started.html>

"ssh-agent bash" might also work in addition to eval `ssh-agent -s`

**Check which key is loaded by ssh-agent**

```bash
ssh-add -l

ssh-add -D  # Delete all manually added keys
```

**Prevent SSH Client for trying all keys added automatically**

<https://superuser.com/questions/268776/how-do-i-configure-ssh-so-it-dosent-try-all-the-identity-files-automatically>

```bash
ssh -o IdentitiesOnly=yes \
    -o IdentityFile=id1.key \
    -i id3.key \
    user123@example.com
```

### Connection settings

**Prevent ssh timeout: setting on client side**

<https://stackoverflow.com/questions/25084288/keep-ssh-session-alive>

```bash
vim ~/.ssh/config

Host *
ServerAliveInterval 180

chmod 600 ~/.ssh/config
```

**Stop adding new host to known hosts**

<https://superuser.com/questions/141344/dont-add-hostkey-to-known-hosts-for-ssh>

```bash
ssh -o "UserKnownHostsFile /dev/null" dheryanto@[ipaddress/hostname]
```

**Ignore known hosts signature mismatch error/warning**

<https://www.joedog.org/2012/07/13/ssh-disable-known_hosts-prompt/>

```bash
ssh -o StrictHostKeyChecking=no user@host
```

**Remove host key from known_hosts file**

<https://askubuntu.com/questions/20865/is-it-possible-to-remove-a-particular-host-key-from-sshs-known-hosts-file>

```bash
ssh-keygen -R hostname/ip-address
```

**Slow password prompt on ssh**

<http://askubuntu.com/questions/246323/why-ssh-password-prompt-takes-too-long-to-appear>

```bash
/etc/ssh/sshd_config: 'useDNS no' or 'GSSAPIAuthentication no'
```

**Disable SSH timeout**

<https://docs.oseems.com/general/application/ssh/disable-timeout>

```bash
# Set SSH client to ping server telling it's alive
ssh -o ServerAliveInterval=30 user@host
```

### Tunnels and proxies

**SSH tunneling (for port-forwarding) Add -f option to let ssh process to go background**

```bash
# -N: no remote commands to execute, -L: lists the configuration
# https://coderwall.com/p/ohk6cg/remote-access-to-ipython-notebooks-via-ssh
# The right value after colon is the remote host
ssh -NL localhost:8888:localhost:8888 remote_user@remote_host
```

**Setup SSH Tunnel**

```bash
# -D: dynamic application-level port forwarding
# -N: do not exec remote command, useful for port-forwarding
# https://linux.die.net/man/1/ssh
# https://superuser.com/a/827128

ssh -ND 1080 user@host
```

**Then for instance to use this socks proxy server in Google Chrome**

```bash
google-chrome --proxy-server="socks5://localhost:1080"
```

**Open google chrome with new session**

```bash
google-chrome --proxy-server="socks5://localhost:1080" --incognito --user-data-dir=/tmp/newsession
```

**Common environment variables for proxy settings: http proxy and https proxy**

```bash
export http_proxy=http://remote.proxy.com:8080
export https_proxy=https://remote.proxy.com:8080
```

### Remote commands and desktops

**Remote desktop to Windows**

```bash
# sudo dnf -y install freerdp
# https://github.com/awakecoding/FreeRDP-Manuals/blob/master/User/FreeRDP-User-Manual.markdown
xfreerdp /u:Administrator /v:192.168.2.65 /size:1200x800 +clipboard +fonts
# Old method
sudo dnf -y install rdesktop
# -z: rdp compression; -g: geometry
# -r: device redirection to share files
rdesktop -z -g 1280x720 -r disk:share=/home/davidheryanto/Downloads -u Administrator -p - notebook.jumpingcrab.com
```

**Execute remote command  (-f for shell to return immediately, no waiting)**

```bash
ssh -f "hostname; uptime"
```

**SSH with X forwarding**

```bash
ssh -X
ssh -Y  # Enable trused X11 forwarding
```

**Enable X11 after becoming root**

<http://blog.mobatek.net/post/how-to-keep-X11-display-after-su-or-sudo/>

### Remote filesystems

**Mount remote filesystem**

<https://github.com/libfuse/sshfs>

```bash
sudo dnf -y install fuse-sshfs , apt-get install -y sshfs
sshfs [user@]hostname:[directory] mountpoint
# Sometimes sshfs fails silently, good to use debug option
sshfs -o debug [user@]hostname:[directory] mountpoint
```

**Unmount**

```bash
fusermount -u mountpoint
```

**Unmount -z: lazy**

```bash
fusermount -uz mountpoint
```

**Unmount alternative. -l: lazy i.e. detach now, clean later**

```bash
sudo umount -l mountpoint
```

**See options of ssh fuse**

```bash
sshfs --help
# Common options
sshfs -o nonempty
```

**gcsfuse**

```bash
gcsfuse -o nonempty -o ro --implicit-dirs --only-dir [path/to/dir/] [BUCKET_NAME] [/local/mount/path/]
# Readonly
-o ro
# If have subdir
--implicit-dirs
# Don't go to background
--foreground
```

**Unmount gcsfuse, use -z to force unmount**

<https://stackoverflow.com/questions/24966676/transport-endpoint-is-not-connected>

```bash
# If "fusermount" command not found, install "fuse" package
/bin/fusermount -uz MOUNT_PATH
```

**NFS**

<http://www.server-world.info/en/note?os=CentOS_7&p=nfs>

```bash
# Check if NFS running
ps aux | grep nfsd
# List mounted folder
showmount -e <server ip>
```

## Users and permissions

[Users and groups](#users-and-groups) · [Ownership and permissions](#ownership-and-permissions) · [Running as another user](#running-as-another-user)

### Users and groups

**Get current uid and gid (user id and group id)**

```bash
id -u
id -g
```

**Get current uid and gid for a particular user**

```bash
id -u $USER
```

**List all users; use cut to split by delimited on bash**

```bash
# -d, --delimiter=DELIM   use DELIM instead of TAB for field delimiter]
# -f, --fields=LIST       select only these fields; also lines with no delim except with -s option
# -s, --only-delimited
# e.g. cut -d, -f1,2 file.txt (Split by comma and select 1st,2nd cols)
cut -d: -f1 /etc/passwd
```

**Check successful and failed logins**

<http://serverfault.com/questions/430895/finding-latest-successful-logins-and-failed-attempts-to-a-centos-server>

```bash
last    # successful
lastb   # failed
```

**Remove password**

```bash
passwd --delete <username>
```

**Expire user password**

```bash
sudo passwd -e <username>
```

**Add/Create user or delete/remove user**

```bash
# useradd -m -p <encryptedPassword> -s /bin/bash -u 3001 <user>
# https://askubuntu.com/questions/94060/run-adduser-non-interactively
useradd <username>  # -m: will create the home directory, -s: the login shell
userdel <username>  # --remove will remove the home directory
passwd <username>
```

**sudo useradd -m -s /bin/bash NEW_USER**

**Set password without prompt**

<https://unix.stackexchange.com/questions/306903/usermod-to-change-user-password-is-not-working>

```bash
usermod --password `openssl passwd -1 [PASSWORD]` [USERNAME]
```

**Add user to group: Add david to wheel**

```bash
usermod -aG wheel davidheryanto
```

**Refresh group without logout**

<https://superuser.com/a/354475>

```bash
sudo su - $USER
```

**Add user with specific user id**

```bash
useradd -u 999 navin
```

**Add group**

```bash
groupadd [-g GID] GROUPNAME
```

**Remove user from group**

```bash
gpasswd -d <user> <group>
```

**Delete group**

```bash
groupdel <groupname>
```

**Add service account, no password, no shell**

<http://superuser.com/questions/77617/how-can-i-create-a-non-login-user>

```bash
useradd -s /sbin/nologin -r <myser>  # Recommended
useradd -s /bin/false -r <myuser>
```

**Check which group I belong to**

```bash
groups
```

**Understand sudo and admin (wheel) group**

<http://www.cyberciti.biz/faq/linux-sudo-allows-people-in-group-admin/>

```bash
# Check user detail eg which group a user belongs to
id <username>
# Show all groups
getent group
# Show users belong to certain group
getent group <groupname>
```

**Add user (For Ubuntu)**

```bash
sudo adduser newuser
sudo passwd newuser
```

### Ownership and permissions

**Modify uid (user id) and gid (group id)**

<https://www.cyberciti.biz/faq/linux-change-user-group-uid-gid-for-all-owned-files/>

```bash
# We need extra steps, because old files still have old uid and gid
# In this, eg 1000 is the new id, 200 is the old id
USERNAME=myuser \
&& OLD_UID=$(id -u $USERNAME) \
&& OLD_GID=$(id -g $USERNAME) \
&& NEW_UID=1000 \
&& NEW_GID=1000 \
&& usermod -u $NEW_UID $USERNAME \
&& groupmod -g $NEW_GID $USERNAME \
&& find / -user $OLD_UID -exec chown -h $USERNAME {} \; \
; find / -group $OLD_GID -exec chown -h $USERNAME {} \; \
; exit 0
```

**Make a file executable**

```bash
chmod +x /usr/local/bin/my_executable
```

**Set default permissions for file and directory**

<https://unix.stackexchange.com/a/1315>

```bash
chmod g+s <directory>                 # set gid
setfacl -d -m g::rwX /<directory>     # set group to rwx default
setfacl -d -m o::rx /<directory>      # set other
getfacl /<directory>                  # verify
```

**File permission**

```bash
# Make folder permission 755, file permission 644
# http://stackoverflow.com/questions/18817744/change-all-files-and-folders-permissions-of-a-directory-to-644-755
find * -type d -print0 | xargs -0 chmod 0755 # for directories
find . -type f -print0 | xargs -0 chmod 0644 # for files
```

**Get file permission number of a file**

<http://askubuntu.com/questions/152001/how-can-i-get-octal-file-permissions-from-command-line>

```bash
stat -c "%a %n" *
```

**Alternative**

```bash
sudo find /your/location -type f -exec chmod 644 {}
sudo find /your/location -type d -exec chmod 755 {}
```

<http://superuser.com/questions/91935/how-to-chmod-755-all-directories-but-no-file-recursively>

<http://superuser.com/questions/264383/how-to-set-file-permissions-so-that-new-files-inherit-same-permissions>

```bash
chmod -R u+rwX,go+rX,go-w /path
```

**Make folder and child folders and files writable by all**

```bash
# u(user) g(group) (other)
chmod -R ugo+rwX /path
```

**Make files in folder inherit group ownership (sticky bit in group)**

<http://unix.stackexchange.com/questions/75381/keep-same-file-owner-for-newly-created-files>

```bash
chmod -R g+s <folder>
# Make all directory has the sticky bit
sudo find /var/www/html -type d -exec chmod g+s {} \;
```

**Allow a folder to be writable by all users in group**

<http://superuser.com/questions/19318/how-can-i-give-write-access-of-a-folder-to-all-users-in-linux>

```bash
sudo chgrp -R mygroup /var/www
sudo chmod -R g+w /var/www
```

**Change ownership**

```bash
chown options owner-user:owner-group file/directory
```

**Make files / folders group writeable**

<https://superuser.com/questions/19318/how-can-i-give-write-access-of-a-folder-to-all-users-in-linux>

```bash
sudo chmod -R g+w /var/www
```

**Enable normal user to run on port 80**

<https://www.digitalocean.com/community/tutorials/how-to-use-pm2-to-setup-a-node-js-production-environment-on-an-ubuntu-vps>

```bash
sudo apt-get install libcap2-bin
sudo setcap cap_net_bind_service=+ep /usr/local/bin/node
sudo setcap cap_net_bind_service=+ep /usr/bin/nodejs  # In Ubuntu
```

### Running as another user

**Sudo multiple commands**

<http://stackoverflow.com/questions/5560442/how-to-run-two-commands-in-sudo>

```bash
sudo sh -c "whoami; whoami"
```

**sudo no password. Add this add the LAST line cuz sudo reads sudoes from top to bottom**

<https://www.digitalocean.com/community/tutorials/how-to-edit-the-sudoers-file-on-ubuntu-and-centos>

```bash
$ sudo visudo
dheryanto ALL=(ALL) NOPASSWD: ALL
```

**Wall to specific user**

```bash
write <username> [tty]
# Asterisk * cannot expand folders w/o permission even with sudo
http://unix.stackexchange.com/questions/101847/cannot-expand-asterisk-without-proper-permission
sudo sh -c 'ls -l /temp/sit/build/*'
```

**Switch users**

```bash
su - user2
su -  # Switch to root
```

**Run command as root**

```bash
sudo su - -c "R -e \"install.packages('rmarkdown')\""
sudo -u root whoami  # Alternative, but above is recommended, can handle parentheses better
```

**Run command as user**

```bash
sudo su - [other-user] -c 'command_to_execute'
```

**Run command as other user with no login shell**

<https://serverfault.com/questions/351046/run-script-as-user-who-has-nologin-shell>

```bash
su -s /bin/bash -c '/path/to/your/script' testuser
```

**Run command as another user (For nologin user)**

<https://serverfault.com/questions/333321/executing-a-command-as-a-nologin-user>

```bash
# - Method 1. Launch shell for that user
sudo -u [other-user] bash
# - Method 2. Override the shell
sudo su - [other-user] -s /bin/bash -c 'command_to_execute'
```

## Packages and development tools

[DNF and RPM](#dnf-and-rpm) · [Package repositories and settings](#package-repositories-and-settings) · [Build tools and libraries](#build-tools-and-libraries)

### DNF and RPM

**DNF: remove package, keep dependencies**

```bash
sudo rpm -e --nodeps [PACKAGE_NAME]
```

**Dnf install without update metadata, i.e. use cached metadata**

```bash
sudo dnf -C install <package-name>
```

**Find the dnf packages which provides binary**

```bash
dnf provides dnf_release
```

**Running 32 bit app on linux 64 bit**

```bash
sudo dnf install glibc.i686
```

**Check dnf installation path**

```bash
rpm -qa | grep -i <package-name>  # Find the package name first
rpm -ql <package-name>
dnf list installed
# Remove rpm
rpm -e <package name>
```

**Remove packages**

```bash
sudo dnf remove <package name>
```

**Remove packages without dependencies, e.g php-sqlite2**

```bash
rpm -qa | grep "php-sqlite2"
rpm -e --nodeps "php-sqlite2"
```

**dnf install specific version of package**

```bash
dnf list docker-ce.x86_64  --showduplicates | sort -r  # List available versions
sudo dnf -y install docker-ce-<VERSION>
```

**Or update the package to latest version**

```bash
sudo dnf update [package]
```

**Search for packages in dnf repo**

```bash
dnf search [search term]
# Search exact match for package name
dnf list <package>  # e.g. dnf list R, dnf list R-dev*
```

**Find packages location installed from dnf**

```bash
rpm -ql [package-name]
```

**Check dnf installed version**

```bash
dnf list | grep [package_name]
```

**dnf install vim conflict with existing vim-minimal**

```bash
sudo dnf update vim-minimal
sudo dnf install vim
```

**Check which repo provides the package**

```bash
dnf info <package-name>
```

**Check which repo provdes the binary**

```bash
dnf provides /usr/bin/convert  # eg. for ImageMagick
```

**Check with repo provides the package or library**

```bash
dnf provides <package-name>
dnf provides /usr/lib64/libbz2.so
```

### Package repositories and settings

**Disable dnf repo**

```bash
sudo dnf-config-manager --disable Dropbox
```

**Stop dnf from updating kernel (why? eg. cuz nvidia driver works only for specific kernel)**

```bash
sudo vim /etc/dnf/dnf.conf
exclude=kernel*
```

**Install with dnf without updating i.e. disable dnf update**

```bash
sudo vim /etc/dnf/dnf.conf
metadata_expire=1209600  # seconds in 2 weeks / 14d
```

**Location of repo for dnf**

```bash
/etc/yum.repos.d/
# To disable a .repo
enabled=0
# Check if repo is installed with rpm and unistall rpm if yes
rpm -qa |grep -i <repo-name>
rpm -e <repo-name>
```

**dnf enable fastestmirror: to speed up downloads of packages**

```bash
sudo vim /etc/dnf/dnf.conf
fastestmirror=True
```

**dnf proxy and certificate check**

```bash
sudo vim /etc/dnf/dnf.conf
proxy=http://remote.proxy.com:8080
proxy_username=
proxy_password=
sslverify=False  # Disable certificate check
# socks5 proxy
# https://blog.emacsos.com/use-socks5-proxy-in-curl.html
proxy=socks5h://localhost:8080
```

### Build tools and libraries

**mpi**

```bash
mpirun -np 3 --host a,b,c a.out
# mpi installed via module
https://ask.fedoraproject.org/en/question/32864/mpirun-command-not-found/
```

**Alternatives to set different versions of command**

```bash
alternatives --list
alternatives --display java
sudo alternatives --install <link> <name> <path> <priority>
sudo alternatives --config java
```

**Configure and make**

```bash
./configure --prefix=$HOME/local  # to install at custom dir
--disable-shared
```

**Set dynamic library path**

```bash
export LD_LIBRARY_PATH=mylibpath
```

**Setup MKL env variables**

```bash
source /opt/intel/bin/compilervars.sh intel64
```

**Install gem**

```bash
dnf -y install rubygems
```

**Install gem to manage ruby package**

```bash
sudo dnf rubygem-bundler
```

**Set / Add include path / folder / location for gcc in Linux**

<http://stackoverflow.com/questions/558803/how-to-add-a-default-include-path-for-gcc-in-linux>

```bash
# CPATH is used for all languages, C_INCLUDE_PATH for C only
CPATH="..."
C_INCLUDE_PATH=/home/extra/header/location:$C_INCLUDE_PATH
```

**Install jsonnet**

```bash
git clone git@github.com:google/jsonnet.git; cd jsonnet
make
sudo mv jsonnet /usr/local/bin/jsonnet
jsonnet --version
```

## Shell and command-line helpers

See the [Bash cheatsheet](bash.md) for a fuller guide to shell syntax, configuration, and scripting.

[Command execution](#command-execution) · [Output and redirection](#output-and-redirection) · [Environment variables](#environment-variables) · [Prompt and history](#prompt-and-history) · [Dates and time zones](#dates-and-time-zones)

### Command execution

**Run command on shell exit**

```bash
trap 'echo "Doing cleanup*" && rm -rf /tmp/workfile' EXIT
```

**Run a command with a time limit**

<https://linux.die.net/man/1/timeout>

```bash
# Can include time units in the duration e.g 10s, 10m, 10h, 1d
timeout 10 sleep infinity
```

**Allow stopping a script with "timeout" command with --foreground option.**

<https://unix.stackexchange.com/a/233685>

```bash
timeout --foreground 30 <command>
```

**Wait until endpoint is ready with timeout**

```bash
timeout --foreground 45 bash -c "until curl --fail http://example.com; do sleep 2; done"
```

**For loop examples**

```bash
for i in {1..10}
do
  echo $i
done
for i in 1 3 5;do echo $i;done
```

**Find location of app in terminal**

```bash
which git
```

**Encode query string, Python 3**

<https://stackoverflow.com/questions/5607551/how-to-urlencode-a-querystring-in-python>

```bash
python -c "from urllib.parse import urlencode; print(urlencode({'key': 'my value'}))"
```

**Move cursor wordwise**

```bash
Alt+b Alt+f
```

**Sleep forever**

```bash
sleep infinity
```

**Vertical selection or column selection**

```text
Ctrl + Shift + Left Mouse Press and Hold
```

**Shebang**

```bash
#!/usr/bin/env python
```

**Perform operation on bash script**

<http://stackoverflow.com/questions/6348902/how-can-i-add-numbers-in-a-bash-script>

```bash
$((6 + 8))
```

**Get random number**

```bash
echo $RANDOM
# Get random number between 1-5
echo $(($RANDOM%5+1))
```

**Pass argument to piped program with xargs**

```bash
echo Hello | xargs echo
```

**Set current directory to the directory of the script file**

<https://stackoverflow.com/questions/3349105/how-to-set-current-working-directory-to-the-directory-of-the-script>

```bash
#!/bin/bash
cd "$(dirname "$0")"
```

**Understanding shell built-in commands**

<https://unix.stackexchange.com/questions/442945/understanding-shell-builtin-commands>

```bash
Commands like: export, set, exit are built-in because they directly manipulate the environment and program flow of the current shell session. An external utility would not be able to do that.
```

**Check command exists**

<https://stackoverflow.com/questions/592620/how-to-check-if-a-program-exists-from-a-bash-script>

```bash
command -v <the_command>
# Example
if [[ ! $(command -v command_not_exist) ]]; then echo "command not found"; fi
```

### Output and redirection

**Append lines of text to a file**

<https://stackoverflow.com/questions/2500436/how-does-cat-eof-work-in-bash>

```bash
cat <<EOF >> append-to-this-file
192.168.2.146 fedora-2
192.168.2.252 fedora-1
EOF
```

**Append lines of text to a file with sudo**

```bash
sudo bash -c "cat >> /tmp/file.out" <<EOF
line 1
line 2
EOF
```

**echo options:**

-n: no trailing newline

-e: interprets backslash escapes

**Redirect both stderr and stdout**

<https://stackoverflow.com/questions/818255/in-the-shell-what-does-21-mean>

```bash
# File descriptor 1: stdout
# File descriptor 2: stderr
# 2>&1 (Redirect stderr to stdout, need & indicate what follows is a file
#       descriptor vs a file called 1)
./command 2>&1 | tee /tmp/out
```

**Redirect both stderr and stdout to file**

<https://askubuntu.com/questions/625224/how-to-redirect-stderr-to-a-file>

```bash
run_command &> outfile
```

**Cannot redirect echo even with sudo, use sudo tee**

```bash
echo 'deb blah # blah' | sudo tee [--append|-a] /etc/apt/sources.list
```

**Save in vim with sudo**

<http://stackoverflow.com/questions/2600783/how-does-the-vim-write-with-sudo-trick-work>

```bash
:w !sudo tee %
```

**Clear terminal and previous lines**

<http://superuser.com/questions/122911/bash-reset-and-clear-commands>

```bash
echo -e '\0033\0143'
```

**Suppress stderr**

<http://askubuntu.com/questions/350208/what-does-2-dev-null-mean>

```bash
2>/dev/null
# Supress both stdout and stderr
&>/dev/null
```

**Echo no newline**

```bash
echo -n "text with no newline"
```

**Redirect time output to file**

```bash
{ time sleep 1; } 2> time.txt  # Must have space after and before { }
```

**Sound an alert**

```bash
echo -e "\a"  # -e to interpret escape char
```

**Pipe heredoc multiline**

<https://stackoverflow.com/questions/7046381/multiline-syntax-for-piping-a-heredoc-is-this-portable>

```bash
cmd << EOF
input
here
EOF
```

**Another example of heredoc with pipe**

<https://stackoverflow.com/a/21549836>

```bash
cat <<EOF | grep 'b' | tee b.txt
foo
bar
baz
EOF
```

**Use backtick in heredoc**

<https://unix.stackexchange.com/a/334404>

```bash
# Enclose EOF with single quote 'EOF'
tee -a "$HOME/.bashrc" <<'EOF'
...contents of here-document here...
EOF
```

### Environment variables

**Export environment variables from a file with lines of key=val**

<https://stackoverflow.com/questions/43958814/setting-environment-variables-based-on-key-value-pairs-in-a-file-where-some-val>

```bash
set -a
source .env.development.local
set +a
```

**Export environment var**

```bash
export PATH=$PATH:/usr/local/bin
```

**Delete, remove environment variables**

```bash
unset VARIABLE
```

**Print environment variable nicely**

```bash
# tr (translate)
# -s squeeze: replace <from> to>
echo $PATH | tr -s ':' '\n'
```

**Set environment variable for sudo**

```bash
sudo env "PATH=$PATH" sublime_text
```

**Setup startup script for everyone**

```bash
sudo mv script.sh /etc/profile.d/
```

**Setup environment variables for every user / everyone**

```bash
# Or use the above by creating a file /etc/profile.d
# Great info (ans by Eliah K): https://askubuntu.com/questions/866161/setting-path-variable-in-etc-environment-vs-profile
# For everything, note don't need EXPORT keyword here
sudo vim /etc/environment
# For Bourne-compatible shells
sudo vim /etc/profile  # Then export KEY=VALUE
# For this to affect systemd service, we need to add this to .service file
EnvironmentFile=/etc/environment
```

**Global .bashrc, .bashrc for all users**

<https://help.ubuntu.com/community/EnvironmentVariables>

```bash
# Better create a script in /etc/profile.d/ folder
vim /etc/profile.d/nodejs.sh
# https://askubuntu.com/questions/247738/why-is-etc-profile-not-invoked-for-non-login-shells
vim /etc/bash.bashrc
```

**.bashrc vs .bash_profile bs .profile**

<http://superuser.com/questions/409186/environment-variables-in-bash-profile-or-bashrc>

<http://stackoverflow.com/questions/415403/whats-the-difference-between-bashrc-bash-profile-and-environment>

**Parameter expansion, eg if we have ${ENV} in a file, and want to sub this with env variables**

<https://unix.stackexchange.com/questions/294378/replacing-only-specific-variables-with-envsubst>

```bash
# If not installed: apt-get -y install gettext
envsubst < file_with_env_param
```

**Replace only specific variables with envsubst**

<https://unix.stackexchange.com/a/294400>

```bash
# Will only replace VAR1 and VAR3
envsubst '${VAR1} ${VAR3}' < infile
```

**Display welcome message (message of the day)**

```bash
Change the content of /etc/motd
```

**How run GUI using cron or remote shell**

```bash
export DISPLAY=...  # Find out by typing env on the running Desktop session
```

### Prompt and history

**Terminal colors and prompts / Fedora / Dec 2024**

```bash
export LS_COLORS='di=01;94:'
export PS1='\[\e[38;5;183m\]\u@\h \[\e[38;5;252m\]\W\[\e[0m\]\$ '
```

**Customize bash prompt, terminal color**

<https://bash-prompt-generator.org/>

```bash
# -- Yellow user and hostname
export PS1="[\[$(tput sgr0)\]\[\033[38;5;11m\]\u@\h\[$(tput sgr0)\]\[\033[38;5;15m\] \W]\\$ \[$(tput sgr0)\]"
# -- Pinky
export PS1="[\[$(tput sgr0)\]\[\033[38;5;199m\]\u\[$(tput sgr0)\]\[\033[38;5;200m\]@\h\[$(tput sgr0)\]\[\033[38;5;15m\] \[$(tput sgr0)\]\[\033[38;5;213m\]\W\[$(tput sgr0)\]\[\033[38;5;15m\]]\\$ \[$(tput sgr0)\]"
# -- Purple
export PS1="\[\033[38;5;177m\][\u@\h\[$(tput sgr0)\]\[\033[38;5;15m\] \[$(tput sgr0)\]\[\033[38;5;171m\]\W\[$(tput sgr0)\]\[\033[38;5;177m\]]\\$\[$(tput sgr0)\]\[\033[38;5;15m\] \[$(tput sgr0)\]"
```

**Shorten bash prompt**

<http://askubuntu.com/questions/145618/how-can-i-shorten-my-command-line-bash-prompt>

```bash
export PS1='\u:\W\$ '
export PS1='[\u@\h \W]\$ '  # Default for Fedora
```

**Clear bash history**

<http://askubuntu.com/questions/191999/how-to-clear-bash-history-completely>

```bash
cat /dev/null > ~/.bash_history && history -c
```

**See bash history with timestamp**

<https://askubuntu.com/questions/391082/how-to-see-time-stamps-in-bash-history>

```bash
HISTTIMEFORMAT="%d/%m/%y %T " history
```

**Bash auto completion directory: /etc/bash_completion.d**

```bash
# E.g. for helm
sudo su - -c "helm completion bash > /etc/bash_completion.d/helm"
```

**Retrieve command line history**

```bash
history
```

**Bash git prompt**

<https://github.com/jimeh/git-aware-prompt>

```bash
mkdir ~/.bash
cd ~/.bash
git clone git://github.com/jimeh/git-aware-prompt.git
vim ~/.bashrc
# Check if shell is interactive first
if ! [ -z "$PS1" ]; then
  export GITAWAREPROMPT=~/.bash/git-aware-prompt
  source $GITAWAREPROMPT/main.sh
  export PS1="[\u@\h \W\[$txtcyn\]\$git_branch\[$txtred\]\$git_dirty\[$txtrst\]]\$ "
fi
```

**Change ls color (directory/folder color)**

<http://askubuntu.com/questions/466198/how-do-i-change-the-color-for-directories-with-ls-in-the-console>

```bash
vim ~/.bashrc
export LS_COLORS=$LS_COLORS:'di=0;36:'
```

### Dates and time zones

**Print date in rfc3339 format**

```bash
date --rfc-3339=seconds
```

**Print date in iso8601 format**

```bash
# -u option to print in utc (-u is optional)
date -I
date -Iseconds
date -u +"%Y%m%dT%H%M%S.%NZ"
date -d "2015-05-05 14:00:00" -u +"%Y%m%dT%H%M%S.%NZ"
```

**Print date in epoch seconds**

```bash
date +"%s"
```

**Print date in epoch milliseconds**

```bash
date +%s%3N
```

**Print date in epoch nanoseconds**

```bash
date +%s%N
```

**Print time with fractional seconds**

<https://stackoverflow.com/questions/16548528/linux-command-to-get-time-in-milliseconds>

```bash
date +"%T.%6N"  # Nanoseconds rounded to first 6 digits
date -u +"%Y%m%dT%H%M%S.%6NZ"
```

**Print date in RFC 3339**

```bash
date -u +"%Y-%m-%dT%H:%M:%S.%6NZ"
```

**Add date**

```bash
# -I[FMT]/--iso-8601[FMT]
# -u/--utc
date -d "2015-05-05T14:00:00Z+2days" -uIs
date -d "+2 days" -I
```

**Print date in epoch to ISO8601**

```bash
date -d@1523500386
```

**Print ISO week number (start from 1, Monday as first day of the week)**

<https://unix.stackexchange.com/a/537457>

```bash
date +%V
```

**Change timezone**

<http://unix.stackexchange.com/questions/110522/timezone-setting-in-linux/110529>

```bash
ln -sf /usr/share/zoneinfo/Asia/Singapore /etc/localtime  # Red Hat distros
sudo dpkg-reconfigure tzdata  # Ubuntu/Debian distros
# Verify
date
```

**Change timezone for current shell session**

```bash
export TZ=Asia/Singapore
export TZ=UTC
```

## Storage and filesystems

Device names below are examples. Formatting, partitioning, and disk-image commands overwrite data on the selected device.

[Disk usage and devices](#disk-usage-and-devices) · [Mounting filesystems](#mounting-filesystems) · [LVM and partition resizing](#lvm-and-partition-resizing) · [Partitioning and bootable media](#partitioning-and-bootable-media)

### Disk usage and devices

**Check storage devices and how they are partitioned into volumes:**

<https://serverfault.com/a/461390/530228>

```bash
sudo pvdisplay -m
```

**Check filesystem type**

```bash
df -T
```

**List disks attached to the machine**

```bash
lsblk
```

**Check if the disk is rotating i.e. SSD or HDD: ROTA 0 means SSD**

```bash
lsblk -d -o name,rota
```

**Summary of disk usage, check folder size with ls**

<http://superuser.com/questions/162749/how-to-get-the-summarized-sizes-of-folders-and-their-subfolders>

```bash
sudo du -sh /* | sort -h  # And human-numeric-sort
df -h  # Check free disk space
```

**Show size of directories up to 1 level: -d DEPTH**

```bash
# summary (-s) same as -d 0
sudo du -h -d 1 | sort -h
```

**Disk usage for hidden file**

<https://askubuntu.com/questions/356902/why-doesnt-this-show-the-hidden-files-folders>

```bash
# -a: all, -d: depth, -h: human readable
du -ahd1 | sort -h
```

### Mounting filesystems

**Mount a new partition**

<https://wiki.archlinux.org/index.php/add_new_partitions_to_an_existing_system>

```bash
Format the new partition using gparted
mount /dev/sda2 /mnt/mountfolder
# Add this entry to /etc/fstab
/dev/sda2 /newdir ext3 defaults 0 2
```

**If cannot format using gparted**

```bash
sudo fdisk -l  # Check drives
sudo mkfs -t ext3 /dev/sdf
sudo mount /dev/sdf /mnt/data-store
sudo vim /etc/fstab
/dev/sdf /mnt/data-store ext3 defaults,noatime 1 2
```

**Mount flash drive**

```bash
sudo fdisk -l  # Check which drive to mount e.g. /dev/sdb1
sudo mkdir /media/usb  # Mount folder
sudo mount /dev/sdb1 /media/usb
sudo umount /media/usb  # When done
# Alternative method to find which device (/dev/sdb2 or /dev/sdc1 ...) to mount
parted
print devices
print list
```

**Mount external hard drive**

<http://askubuntu.com/questions/177825/how-to-mount-an-external-hdd>

```bash
sudo fdisk -l  # Check if disk is available
sudo mount -t ntfs /dev/sdb1 /media
```

**Open bitlocker encrypted volumes**

```bash
# Find the volume
fdisk -l | grep "/dev/sd*"
# Install dislocker
sudo dnf -y install dislocker dislocker-fuse
# Mount to /mnt/bitlocker
mkdir /mnt/bitlocker
dislocker-fuse -V /dev/sdc2 -u -- /mnt/bitlocker  # It will prompt for password. Better approach!
dislocker-fuse -V /dev/sdc2 -u{ENCRYPTION_KEY} -- /mnt/bitlocker
# Mount to /mnt/usb
mkdir /mnt/usb
mount /mnt/bitlocker/dislocker-file /mnt/usb
```

### LVM and partition resizing

**Move /home to new partition**

<http://embraceubuntu.com/2006/01/29/move-home-to-its-own-partition/>

**Shrink logical and physical volume for lvm partition**

<http://askubuntu.com/questions/252204/how-to-shrink-ubuntu-lvm-logical-and-physical-volumes>

```bash
lvresize --verbose --resizefs -L -150G /dev/fedora/home
pvs -v --segments /dev/sda5
sudo pvmove --alloc anywhere /dev/sda5:<start>-<end>
# Use gparted to resize the physical volume
```

**Extend partition**

<http://www.rootusers.com/how-to-increase-the-size-of-a-linux-lvm-by-expanding-the-virtual-machine-disk/>

If file system is xfs

<http://stackoverflow.com/questions/13362910/trying-to-resize2fs-eb-volume-fails>

### Partitioning and bootable media

**Create bootable usb**

```bash
# First, check which sd* usb drive is
lsblk

ISO_FILE=/home/davidheryanto/Downloads/Fedora-Live-Desktop-x86_64-20-1.iso
OUT_FILE=/dev/sdX

sudo dd bs=8M status=progress \
if=$ISO_FILE \
of=$OUT_FILE \
&& sync
```

**Delete MBR (Master Boot Record) on bootable usb**

```bash
# sudo fdisk -l to check where the thumbdrive is sda/sdb?
sudo dd if=/dev/zero of=/dev/sdb bs=446 count=1
```

**Burn Windows ISO to USB device. Sync to ensure that data is written to drive (not in cache)**

<https://askubuntu.com/questions/59551/how-to-burn-a-windows-iso-to-a-usb-device>

```bash
sudo dd bs=4M if=[ur .iso] of=/dev/sd[that 1 letter] status=progress && sync
```

**Using pv (pipe viewer to view transfer progress)**

<https://askubuntu.com/questions/215505/how-do-you-monitor-the-progress-of-dd>

```bash
dd if=/dev/urandom | pv | dd of=/dev/null
```

**Install Fedora on USB Drive**

<https://fedoraproject.org/wiki/How_to_create_and_use_Live_USB>

**Convert partition table type from GPT to MBR**

```bash
gdisk
/dev/sdc
g (recovery and transformation)
Then, select option to convert GPT to MBR
```

**Delete and create partition**

```bash
fdisk /dev/sdc
p (print partition table)
d (delete partition)
n (new partition)
t (change partition type)
# For exfat use "GPT" and "7 HPFS/NTFS/exFAT"
```

**Format exfat partition**

```bash
mkfs.exfat /dev/sdc1
```

## Network administration and security

[NetworkManager and DNS configuration](#networkmanager-and-dns-configuration) · [firewalld](#firewalld) · [iptables and forwarding](#iptables-and-forwarding) · [SSH server configuration](#ssh-server-configuration) · [Certificates and encryption](#certificates-and-encryption) · [System limits and tuning](#system-limits-and-tuning)

### NetworkManager and DNS configuration

**Edit hostname mapping**

```bash
sudo vim /etc/hosts
```

**Change hostname in CentOS**

```bash
sudo hostnamectl set-hostname <new-hostname>  # modifies /etc/hostname
```

**Get hostnames detail (static, transient)**

```bash
hostnamectl status
```

**Modify transient (runtime) hostname**

```bash
hostnamectl set-hostname "localhost.localdomain" --transient
```

**Get and set MTU value for a network interface e.g. eth0**

```bash
ip link show eth0
sudo ip link set dev eth0 mtu 1500
```

**dnsmasq with NetworkManager**

<https://fedoramagazine.org/using-the-networkmanagers-dnsmasq-plugin/>

```bash
# /etc/NetworkManager/NetworkManager.conf
[main]
dns=dnsmasq
# /etc/dnsmasq.d/dnsmasq.conf
# In Fedora: /etc/NetworkManager/dnsmasq.d/00-dnsmasq.conf
server=1.1.1.1
server=1.0.0.1
no-resolv
server=/example.com/[DNS_SERVER_IP]
```

**Network manager CLI**

<https://developer.gnome.org/NetworkManager/stable/nmcli.html>

```bash
nmcli net[working] on/off
# Connection profiles
nmcli con show [--active]
# Connect to a saved profile
nmcli con up id [NAME]
# List wifi access points
nmcli dev wifi
```

**Show current network netmask, gateway**

```bash
# First, check the devices you have
nmcli dev show | grep -i device
# Then,
nmcli dev show DEVICE_ID
```

**Restart network with Network Manager**

```bash
sudo systemctl restart NetworkManager
```

**Change dns server**

```bash
sudo vim /etc/resolv.conf
  nameserver 4.2.1.1
  nameserver 4.5.1.1
```

**Local DNS server for small (home) networks**

```bash
dnsmasq
# With Docker: https://github.com/jpillora/docker-dnsmasq
```

**Start service for DNS for local application e.g. windscribe**

```bash
# Sample error: Unit dbus-org.freedesktop.resolve1.service not found
sudo systemctl start systemd-resolved
```

**Share internet connection**

<https://wiki.archlinux.org/index.php/Internet_sharing>

**Where to assign dns server**

```bash
/etc/resolv.conf
```

### firewalld

**firewalld gui**

```bash
sudo dnf -y install firewall-config
```

**firewalld - new software to manage firewall in newer distro**

<https://www.digitalocean.com/community/tutorials/how-to-set-up-a-firewall-using-firewalld-on-centos-7>

<http://blog.jyore.com/?p=113>

```bash
firewall-cmd --list-all  # Get firewall config
firewall-cmd --get-active-zones
sudo firewall-cmd --zone=public --add-port=2434/tcp
sudo firewall-cmd --zone=public --remove-port=2434/tcp
```

**Firewall configuration in Fedora, open port**

```bash
sudo dnf -y install firewall-config
sudo firewall-config  # Rember to change the Configuration to Permanent
# Alternatively
firewall-cmd --get-active-zones  # Then change the zone below accordingly
# List all rules
sudo firewall-cmd --list-all
sudo firewall-cmd --zone=FedoraWorkstation --add-port=8888/tcp --permanent
sudo firewall-cmd --reload
```

**Remove with --remove-port**

**Check firewall status**

<http://www.oracle-base.com/articles/linux/linux-firewall-firewalld.php>

**Open port on firewalld,**

<https://fedoraproject.org/wiki/FirewallD>

```bash
firewall-cmd --get-active-zones
firewall-cmd --zone=dmz --add-port=8080/tcp
```

**Disable firewall**

```bash
systemctl disable firewalld
systemctl stop firewalld
```

### iptables and forwarding

**Setup port forwarding via iptables**

<https://serverfault.com/questions/326493/basic-iptables-nat-port-forwarding>

```bash
# Enable IP forwarding: Note that the method below may not be permanent
sudo sysctl -w net.ipv4.ip_forward=1
```

**Check current state of IP forwarding: 1 means ON**

```bash
# It is actually read from this file: cat /proc/sys/net/ipv4/ip_forward
sudo /sbin/sysctl net.ipv4.ip_forward
```

**To make it permanent, add the following line to /etc/sysctl.conf**

```bash
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
/sbin/sysctl -p
```

**iptables options:**

--append, -A <chain>

--out-interface, -o <interface-name>

**Add PREROUTING and POSTROUTING rules; 10.0.0.0 is the internal ip that wants to forward the port**

```bash
# We can add -s SOURCE_SUBNET to restrict the rules
# We can add --dport PORT_NUMBER to restrict the rules
# We can ignore port "--to-destination 10.0.0.0" to use all ports in dest
#
# https://my.esecuredata.com/index.php?/knowledgebase/article/49/how-to-redirect-an-incoming-connection-to-a-different-ip-address-on-a-specific-port-using-iptables/
#
# Make sure ip forwarding has been enabled
# sudo sysctl -w net.ipv4.ip_forward=1
#
iptables -t nat -A PREROUTING -p tcp -i eth0 -j DNAT --to-destination 10.0.0.0:80
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

**Alternative with SNAT instead of MASQUERADE. Preferred when using static IP addr.**

<https://serverfault.com/a/586553>

```bash
#
# Assuming iptables running on server 192.168.12.87
# Objective: all packets coming to 192.168.12.87:80 forwarded to 192.168.12.77:80
#
iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 192.168.12.77:80
iptables -t nat -A POSTROUTING -p tcp -d 192.168.12.77 --dport 80 -j SNAT --to-source 192.168.12.87
```

**Block outgoing connection to certain IP with iptables**

```bash
iptables -A OUTPUT -j DROP -d 10.10.10.10
```

**Save iptables rules, make iptables rules permanent after change [fedora]**

```bash
iptables-save > /etc/sysconfig/iptables
```

**Save iptables rules, make iptables rules permanent after change [debian]**

<https://unix.stackexchange.com/a/52522>

```bash
sudo apt-get -y install iptables-persistent
/sbin/iptables-save > /etc/iptables/rules
```

**Save iptables rules [debian] without extra package**

<https://wiki.debian.org/iptables>

```bash
iptables-save > /etc/iptables.up.rules
cat <<EOF > /etc/network/if-pre-up.d/iptables
#!/bin/sh
/sbin/iptables-restore < /etc/iptables.up.rules
EOF
chmod +x /etc/network/if-pre-up.d/iptables
```

**Save iptables rules [debian] using "iptables-persistent" package**

<https://askubuntu.com/questions/119393/how-to-save-rules-of-the-iptables>

```bash
# The following echo commands are used if you need non-interactive installation of iptables-persistent
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | sudo debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | sudo debconf-set-selections
sudo apt-get -y install iptables-persistent
sudo netfilter-persistent save
```

**List iptables rules**

```bash
sudo iptables -v -L
sudo iptables -L --line-numbers
```

**Delete iptables rule by chain and number**

<https://www.digitalocean.com/community/tutorials/how-to-list-and-delete-iptables-firewall-rules>

```bash
sudo iptables -D INPUT 3
```

### SSH server configuration

**Restrict SSH to certain users/groups**

```bash
AllowUsers buddy john doe
AllowGroups sysadmin bkpadmin
# Opposite of AllowUsers and AllowGroups
DenyUsers rambo tina
DenyGroups hr payroll
```

**Install OpenSSH server**

```bash
apt-get -y install openssh-server
service ssh start
```

**ec2 enable password authentication**

<http://serverfault.com/questions/295809/how-can-i-login-to-amazon-ec2-without-using-pem-file>

**SSH Guard**

```bash
To whitelist: Edit this file /etc/sshguard/whitelist
Restart: /usr/sbin/invoke-rc.d sshguard restart
```

### Certificates and encryption

**Setup gpg**

<https://www.digitalocean.com/community/tutorials/how-to-use-gpg-to-encrypt-and-sign-messages-on-an-ubuntu-12-04-vps>

```bash
gpg --list-keys
gpg --gen-key
```

**Encrypt with gpg**

<http://www.cyberciti.biz/tips/linux-how-to-encrypt-and-decrypt-files-with-a-password.html>

```bash
gpg -c <myfile>  # Encrypt with passphrase
# Encrypt without compression
gpg -c --compress-algo none <myfile>
```

**Clear/remove gpg cached password**

<https://askubuntu.com/a/558158/1165335>

```bash
echo RELOADAGENT | gpg-connect-agent
```

**Create self-signed certificate**

<http://stackoverflow.com/questions/10175812/how-to-create-a-self-signed-certificate-with-openssl>

```bash
# CN is your domain name e.g. apple.com
openssl req -x509 -nodes -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365
```

**Save remote ssl certificate (private certificate?)**

<http://superuser.com/questions/97201/how-to-save-a-remote-server-ssl-certificate-locally-as-a-file>

```bash
openssl s_client -showcerts -connect server.edu:443 </dev/null 2>/dev/null|openssl x509 -outform PEM >mycertfile.pem
# Although normally for Ubuntu, we need to save this as .crt not .pem
# Then, to use this private certificate
# - copy to /usr/local/share/ca-certificates
# - sudo update-ca-certificates
```

**Display certificate information. e.g. for x509 self-signed cert**

<http://serverfault.com/questions/215606/how-do-i-view-the-details-of-a-digital-certificate-cer-file>

```bash
openssl x509 -inform pem -in cerfile.cer -noout -text
```

**Convert CER (DER encoded) to PEM**

<https://www.sslshopper.com/ssl-converter.html>

```bash
openssl x509 -inform der -in certificate.cer -out certificate.pem
```

**Add certificate: new root CA**

<https://www.happyassassin.net/2015/01/14/trusting-additional-cas-in-fedora-rhel-centos-dont-append-to-etcpkitlscertsca-bundle-crt-or-etcpkitlscert-pem/>

```bash
sudo cp <new-ca>.pem /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust
```

**Password generator: pwgen [ OPTION ] [ pw_length ] [ num_pw ]**

```bash
# -B (no ambiguous) -y (include one special symbols) -s (--secure)
pwgen
# pwgen reasonable options
pwgen --ambiguous --capitalize --numerals 12
```

**Alternative, create random secure password**

```bash
openssl rand -base64 32
```

**Convert Apple .mobileconfig to Certificate .pem .crt**

<https://apple.stackexchange.com/questions/105981/how-do-i-view-or-verify-signed-mobileconfig-files-using-terminal>

```bash
openssl pkcs7 -inform DER -print_certs -in myprofile.mobileconfig
```

### System limits and tuning

**Set no of open file descriptors**

<http://docs.hortonworks.com/HDPDocuments/Ambari-2.1.1.0/bk_Installing_HDP_AMB/content/_check_the_maximum_open_file_descriptors.html>

```bash
ulimit -Sn  # Check first
ulimit -Hn
ulimit -n 10000  # Set to 10000
```

**Set no of open file descriptors per-user; (*) means all users**

```bash
# May need to restart all user sessions e.g. logout then login again
# https://unix.stackexchange.com/a/8949
sudo bash -c "cat <<EOF >> /etc/security/limits.conf
*    soft    nofile   20480
*    hard    nofile   20480
EOF
"
```

**In Fedora, need to add this config to these files, then restart:**

<https://unix.stackexchange.com/a/581521>

```bash
#''
# /etc/systemd/user.conf
# /etc/systemd/system.conf
#
DefaultLimitNOFILE=12500
```

**Set no of open file descriptors permanently for the whole system**

```bash
echo "fs.file-max = 50000" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

**Alternatively,**

<https://confluence.jetbrains.com/display/IDEADEV/Inotify+Watches+Limit>

```bash
# Run this as root

echo 'fs.inotify.max_user_watches = 524288' > /etc/sysctl.d/idea.conf
sysctl -p --system
```

**Update no of inotify watchers, useful for dropbox daemon**

```bash
# Check current value: sysctl fs.inotify
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf; sudo sysctl -p --system
```

**Prevent processes from committing too much memory**

<https://serverfault.com/questions/485798/cent-os-how-do-i-turn-off-or-reduce-memory-overcommitment-and-is-it-safe-to-do>

```bash
echo 2 > /proc/sys/vm/overcommit_memory
echo 100 > /proc/sys/vm/overcommit_ratio
# Make it persistent
sudo vim /etc/sysctl.conf
  vm.overcommit_memory=2
  vm.overcommit_ratio=100
sysctl -p
```

**Check how much virtual memory can be used: vm.max_map_count**

```bash
cat /proc/sys/vm/max_map_count
sysctl vm.max_map_count  # Alternatively
# Update it with
sysctl -w vm.max_map_count=262144
# Permanently,
echo "vm.max_map_count=262144" >> /etc/sysctl.conf
```

## Desktop and hardware

[GNOME and application launchers](#gnome-and-application-launchers) · [Fonts](#fonts) · [Power and suspend](#power-and-suspend) · [USB wakeup policy](#usb-wakeup-policy) · [Audio and webcam](#audio-and-webcam) · [Clipboard and notifications](#clipboard-and-notifications) · [Printing and file conversion](#printing-and-file-conversion) · [Images and video](#images-and-video)

### GNOME and application launchers

**CentOS: Add app shortcut to desktop menu; alacarte is installed as name 'Main Menu'**

```bash
sudo dnf -y install alacarte
# https://developer.gnome.org/integration-guide/stable/desktop-files.html.en
# put *.desktop to $HOME/.local/share/applications OR /usr/share/applications/
[Desktop Entry]
Type=Application
Name=Sample Application Name
Exec=application
Icon=application.png
Terminal=false
StartupWMClass=[Get from below]
```

**alacarte missing icon: add proper WM_CLASS to .desktop shortcut**

```bash
# https://askubuntu.com/a/975230 (Step 4 onwards)
# After launching the app, run the command below, and click the app window
xprop WM_CLASS
```

**Find location of .desktop file made by alacarte. E.g. app name is Kiro**

```bash
grep -il "kiro" ~/.local/share/applications/alacarte-made*.desktop
```

**GNOME duplicate taskbar icon troubleshooting**

```bash
# A second icon usually means GNOME cannot match the running window to the
# pinned .desktop launcher. This can happen after an application update changes
# its executable name, WM_CLASS, or Wayland app ID.
echo "$XDG_SESSION_TYPE"
```

**Inspect the launcher identity and command**

```bash
grep -E "^(Name|Exec|StartupWMClass)=" ~/.local/share/applications/example.desktop
```

**On X11 or XWayland, get the window identity and click the application window**

```bash
xprop WM_CLASS
```

**xprop may not identify native Wayland windows. In that case, inspect the real**

```bash
# executable used by Exec, especially when Exec points to a wrapper script.
# Compare the exact, case-sensitive application ID with StartupWMClass.
#
# Example: Microsoft Azure Storage Explorer 1.44 changed its Wayland app ID:
# StartupWMClass=StorageExplorer      # old
# StartupWMClass=StorageExplorerExe   # current
#
# After editing the launcher, close and reopen the application manually. If the
# duplicate remains, do not pin the second icon immediately: first check whether
# it belongs to another installation or a differently named .desktop launcher.
```

**Logout**

```bash
gnome-session-quit
```

**Change default text editor from nano to vim**

<http://askubuntu.com/questions/396938/how-do-i-make-sublime-text-3-the-default-text-editor>

```bash
sudo update-alternatives --config editor
```

**Change default text editor in Desktop to sublime-text**

```bash
sudo [vim|sublime-text] /usr/share/applications/defaults.list
Then, Replace all gedit.desktop with sublime-text.desktop
```

**Change default torrent client**

<http://unix.stackexchange.com/questions/75614/set-transmission-as-default-program-when-opening-magnet-links>

```bash
sudo vim ~/.local/share/applications/mimeapps.list
x-scheme-handler/magnet=qBittorrent.desktop
```

**Add MTP support**

```bash
sudo dnf -y install gvfs-mtp.x86_64
```

**Check if using wayland or x11**

<https://unix.stackexchange.com/questions/202891/how-to-know-whether-wayland-or-x11-is-being-used>

```bash
loginctl show-session $(loginctl | grep $(whoami) | awk '{print $1}') -p Type
```

**Check app running on X11**

```bash
xlsclients
```

**Add a new custom resolution on X11 (does not work on Wayland)**

<https://askubuntu.com/questions/138408/how-to-add-display-resolution-for-an-lcd-in-ubuntu-12-04-xrandr-problem>

<https://askubuntu.com/questions/377937/how-to-set-a-custom-resolution>

```bash
sudo cvt 2560 1440 60  # This will return the argument value to --newmode below
sudo xrandr --newmode "2560x1440_60.00"  312.25  2560 2752 3024 3488  1440 1443 1448 1493 -hsync +vsync
# Find out the name of the video device, e.g. dev is DVI-I-1
sudo xrandr -q
sudo xrandr --addmode DVI-I-1 2560x1440_60.00
# Note: need to rerun "xrandr --newmode and --addmode" after every reboot
```

**Index new files/folders used by nautilus so the file can be starred**

```bash
tracker index --file /folder/to/index
```

**Set directories tracker will index**

<https://gnome.pages.gitlab.gnome.org/tracker/faq/#does-tracker-recursively-index-my-home-directory>

```bash
Use dconf-editor and edit this entry: org.freedesktop.Tracker.Miner.Files
```

### Fonts

**Install common fonts**

```bash
mkdir -p ~/.local/share/fonts && wget -qO- https://www.dropbox.com/s/bvt7k3s4olxlw9p/common-fonts.tar.gz?dl=0 | tar xzf  - -C ~/.local/share/fonts/ && sudo fc-cache -f ~/.local/share/fonts
```

**Remove Liberation Mono**

```bash
sudo rpm -e --nodeps liberation-mono-fonts.noarch
```

**Font: FF Kievit Pro [Medium Font] -- css: font-family: 'FF Kievit Pro';**

Font: San Fransisco -- css: font-family: 'SF UI Text';

Font: SF Mono

Font: Inter: <https://github.com/rsms/inter>

Font: Public Sans: <https://github.com/uswds/public-sans>

Font: Ubuntu

<http://font.ubuntu.com/download/ubuntu-font-family-0.83.zip>

Font: Consolas

<https://www.dropbox.com/s/y7jonocw202oxgq/Consolas.ttf?dl=0>

Font: San Fransisco

<https://www.dropbox.com/sh/gw5pd27uh4qmhjn/AAD8RMEaCAfkYNjkPLNPuPiJa?dl=0>

Font: Helvetica Neue

<https://github.com/ifvictr/helvetica-neue>

Font: Monaco

<https://www.dropbox.com/s/vk8uffkot4oilzf/Monaco.zip?dl=0>

Font: Bookerly

<https://www.dropbox.com/s/wcrjj8m086agp3f/Bookerly.zip?dl=0>

Font: Selane Web ST One from Straits Times

Font: Inter UI, good for user interfaces

<https://github.com/rsms/inter/releases/download/v2.4/Inter-UI-2.4.zip>

Font: Circular, good for html headings, title - used by Airbnb

<https://www.dropbox.com/s/2argsavvqjcfvj5/circular-std-master.zip?dl=0>

**Install fonts to local user folder**

```bash
Copy .ttf or .otf files to ~/.local/share/fonts/
```

**Install font, assume we have Helvetica folder in current dir**

```bash
sudo cp -R ./Helvetica /usr/share/fonts/
sudo fc-cache -f /usr/share/fonts/
```

**Direct font download**

<http://www.getthefont.com>

**Font substitution for Arial (default is Liberation Sans in Fedora)**

```bash
vim /etc/fonts/conf.d/59-liberation-sans.conf
vim /etc/fonts/conf.d/59-liberation-mono.conf
vim /etc/fonts/conf.d/57-dejavu-sans-mono.conf
```

**Change default font for serif, sans-serif etc**

<http://seasonofcode.com/posts/how-to-set-default-fonts-and-font-aliases-on-linux.html>

### Power and suspend

**Restart and shutdown / power-off from command line**

```bash
sudo shutdown -r now
sudo shutdown -P now
```

**Restart**

```bash
sudo reboot
```

**Sleep**

<https://askubuntu.com/questions/1792/how-can-i-suspend-hibernate-from-command-line>

```bash
sudo systemctl suspend
# Alternatively,
sudo dnf -y install pm-utils
sudo pm-suspend
sudo pm-hibernate
echo mem | sudo tee /sys/power/state
echo disk | sudo tee /sys/power/state
```

**Sleep at a certain time**

```bash
echo "sudo pm-suspend" | at hh:mm
```

**Run command eg suspend at specific time**

<http://askubuntu.com/questions/78907/how-can-i-hibernate-suspend-from-the-command-line-and-do-so-at-a-specific-time>

```bash
echo pm-hibernate | sudo at now + 30 min
echo pm-suspend | sudo at 11pm (or 15:30)
```

**Check battery: sudo dnf -y install acpi**

```bash
acpi
```

**Turn monitor off with DPMS (Display Power Management Signaling)**

<https://superuser.com/questions/374637/how-to-turn-off-screen-with-shortcut-in-linux>

```bash
sleep 1 && xset dpms force off
```

### USB wakeup policy

**Wake up by USB mouse/keyboard**

<https://askubuntu.com/a/848699>

```bash
# Check which USB devices allowed to trigger wake up
# NOTE: Also make sure in BIOS, allow wake up from USB devices
grep . /sys/bus/usb/devices/*/power/wakeup

# To find out which device is which e.g. device_id: 1-3.2.3
DEVICE=1-1.1
cat /sys/bus/usb/devices/$DEVICE/manufacturer

# Combine the 2 commands above
# Display USB devices with wake status
printf "\033[1m%-8s %-8s %-15s %s\033[0m\n" "WAKE" "ID" "MANUFACTURER" "PRODUCT"
for d in /sys/bus/usb/devices/*/power/wakeup; do
  b=${d%/power/wakeup}; i=${b##*/}
  m=$(cat $b/manufacturer 2>/dev/null || echo "N/A")
  p=$(cat $b/product 2>/dev/null || echo "")
  s=$(cat $d)
  c="\033[31m"; [ "$s" = "enabled" ] && c="\033[32m"
  printf "${c}%-8s\033[0m %-8s %-15s %s\n" "$s" "$i" "$m" "$p"
done

# To prevent device 1-3.2.2 from waking up computer
DEVICE='1-3.2.2'
echo disabled | sudo tee /sys/bus/usb/devices/$DEVICE/power/wakeup

# To allow device usb1 to wakeup computer
DEVICE=usb1
echo enabled | sudo tee /sys/bus/usb/devices/$DEVICE/power/wakeup

# Note, the echo commands above don't persist. They are lost on reboot, and also whenever
# a device re-connects (replug, KVM switch, dock hub re-enumerating after resume):
# drivers re-enable wakeup when they bind (usbhid for mice/receivers with a keyboard
# interface, r8152 for Wake-on-LAN). A boot-time script can't catch that; a udev rule can.
# Match by idVendor:idProduct (lsusb), not device_id, which changes between boots.
```

**Persistent USB wakeup rules**

The following is a machine-specific example for a Keychron keyboard, root hubs, and a dock/KVM arrangement. Identify your own devices and choose which should wake the machine before adapting the IDs and policy; do not copy the allowlist unchanged.

`/etc/udev/rules.d/90-usb-wakeup.rules`:

```udev

# USB wake-from-suspend policy: only the Keychron keyboard may wake the system,
# plus USB 2.0 root hubs: any connect/disconnect on a motherboard USB port wakes,
# so a KVM switching back (keyboard reconnect) also wakes.
# Every other USB device is disabled. Non-USB wake sources (power button,
# RTC alarm) are not affected by this file.
#
# Drivers re-enable wakeup when they bind (usbhid for boot-keyboard interfaces,
# e.g. the Logitech receiver; r8152 for Wake-on-LAN), so the policy is applied
# on every interface bind as well as on device add.

SUBSYSTEM!="usb", GOTO="usb_wakeup_end"
ACTION!="add|bind", GOTO="usb_wakeup_end"

# Allowed
ATTRS{idVendor}=="3434", ATTRS{idProduct}=="0830", GOTO="usb_wakeup_keyboard"
ENV{DEVTYPE}=="usb_device", ATTR{idVendor}=="1d6b", ATTR{idProduct}=="0002", ATTR{power/wakeup}="enabled", GOTO="usb_wakeup_end"
ENV{DEVTYPE}=="usb_interface", DRIVER=="hub", GOTO="usb_wakeup_end"

# Everything else
ENV{DEVTYPE}=="usb_device", ATTR{power/wakeup}=="enabled", ATTR{power/wakeup}="disabled"
ENV{DEVTYPE}=="usb_interface", DRIVER=="?*", ATTR{../power/wakeup}=="enabled", ATTR{../power/wakeup}="disabled"
GOTO="usb_wakeup_end"

LABEL="usb_wakeup_keyboard"
ENV{DEVTYPE}=="usb_device", ATTR{power/wakeup}="enabled"
ENV{DEVTYPE}=="usb_interface", DRIVER=="?*", ATTR{../power/wakeup}="enabled"

LABEL="usb_wakeup_end"

# Keep the keyboard in a motherboard port: behind an external hub/dock it can't wake,
# since those hubs are wake-disabled and don't pass the signal up. Any motherboard
# port works (USB-A blue ports too: the keyboard is USB 2.0, so it lands on usb1).

# Check syntax, then apply now
# udevadm verify /etc/udev/rules.d/90-usb-wakeup.rules
# sudo udevadm control --reload
# sudo udevadm trigger --subsystem-match=usb --action=add && sudo udevadm settle
# grep -l enabled /sys/bus/usb/devices/*/power/wakeup   # expect only keyboard + usb1
```

**USB Ethernet Wake-on-LAN settings**

`/etc/systemd/network/70-usb-lan-no-wol.link`:

```ini

# USB Ethernet (r8152) must not wake the system: turn off Wake-on-LAN at the NIC,
# so the driver has nothing to re-enable USB wakeup for.
# A matching .link file replaces 99-default.link, so its naming/MAC policy is repeated here.
[Match]
Driver=r8152

[Link]
NamePolicy=keep kernel database onboard slot path
AlternativeNamesPolicy=database onboard slot path mac
MACAddressPolicy=persistent
WakeOnLan=off

# Apply now (the name must stay the same, e.g. eth0), then expect "Wake-on: d"
# sudo udevadm control --reload && sudo udevadm trigger --action=add /sys/class/net/eth0
# udevadm info /sys/class/net/eth0 | grep -E "ID_NET_LINK_FILE=|ID_NET_NAME="
# sudo ethtool eth0 | grep Wake-on:
```

### Audio and webcam

**Fix dummy output sound issue**

<https://askubuntu.com/a/948383>

```bash
pulseaudio -k
```

**Disable sound (especially for centos minimal)**

<http://unix.stackexchange.com/questions/152691/how-to-disable-beep-sound-in-linux-centos-7-command-line>

```bash
echo "blacklist pcspkr" | sudo tee /etc/modules-load.d/bell.conf
sudo rmmod pcspkr
```

**Disable sound only on terminal**

```bash
echo 'set bell-style none' >> ~/.inputrc
```

**Set and increase volume from command line, audio mixer simple set**

<https://unix.stackexchange.com/questions/32206/set-volume-from-terminal>

```bash
amixer -q sset Master 50%
amixer -q sset Master 10%+
```

**Restart bluetooth service, turn off and turn on bluetooth device**

```bash
sudo systemctl restart bluetooth
```

**Noise cancellation with PulseAudio**

```bash
# Add this line to /etc/pulse/default.pa
#
# Also disable volume auto adjust: https://askubuntu.com/a/1069998/1165335
load-module module-echo-cancel aec_method=webrtc aec_args="analog_gain_control=0 digital_gain_control=1"

# Better noice cancellation. Better than the one above. Using PulseAudio.
# https://github.com/werman/noise-suppression-for-voice
# First list the input names. Note the frequency. In this e.g I use 32000.
pactl list sources short

# Add these lines to the end of /etc/pulse/default.pa

load-module module-null-sink sink_name=mic_denoised_out rate=32000

load-module module-ladspa-sink sink_name=mic_raw_in sink_master=mic_denoised_out label=noise_suppressor_stereo plugin=</path/to/librnnoise_ladspa.so> control=50

# Example:
# load-module module-ladspa-sink sink_name=mic_raw_in sink_master=mic_denoised_out label=noise_suppressor_stereo plugin=/home/dheryanto/github.com/werman/noise-suppression-for-voice/build-x64/bin/ladspa/librnnoise_ladspa.so control=50

load-module module-loopback source=<mic_name> sink=mic_raw_in channels=2 source_dont_move=true sink_dont_move=true

# Example:
# load-module module-loopback source=alsa_input.usb-046d_Logitech_Webcam_C925e_4BD9AECF-02.analog-stereo sink=mic_raw_in channels=2 source_dont_move=true sink_dont_move=true

# Add input device via remapping of the output. For better usability.
load-module module-remap-source source_name=denoised master=mic_denoised_out.monitor channels=2

# Set the default input.
set-default-source denoised

# Unload module in PulseAudio
pactl unload-module <module_name>
pactl unload-module module-null-sink
```

**Webcam camera settings**

```bash
# First intall UI and CLI to find desired settings (may need to install rpmfusion repo)
sudo dnf install v4l-utils v4l2ucp mplayer

# Open Video4Linux app. Preview > Start Preview
# Find desired settings. Find way to reproduce with v4l2-ctl
# E.g. v4l2-ctl -c zoom_absolute=150
#
# Run v4l2-ctl on reboot since the setting updates are not persistent.
# Example:

cat <<EOF > $HOME/.config/systemd/user/webcam-settings.service
[Unit]
Description=Webcam settings

[Service]
ExecStartPre=/bin/sleep 5
ExecStart=v4l2-ctl -c zoom_absolute=150

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user start webcam-settings
systemctl --user status webcam-settings
systemctl --user enable webcam-settings
```

### Clipboard and notifications

**Add xclip, command to copy to clipboard**

```bash
# Add alias so xclip default to selection (can use Ctrl+Shift+V etc)
# Usage: cat notes.txt | xclip
sudo dnf -y install xclip
echo -e "\nalias xclip='xclip -selection c'\n" >> ~/.bashrc
```

**Get last entry in ls into clipboard**

```bash
ls -tr | tail -n1 | tr -d '\n' | xclip
```

**Send notifications**

```bash
notify-send "This is a notification"
# Clear all notifications
sudo killall notify-osd
```

### Printing and file conversion

**Convert office files (wordx, pptx) to other format**

```bash
unoconv -f pdf input.pptx
```

**Printing in SOC**

```bash
sudo dnf install system-config-printer
samba windows: smb://nusstu/nts27.comp.nus.edu.sg/psts-dx
```

**Add a printer via Common Unix Printing Systems (CUPS)**

<http://localhost:631/admin>

**Convert docx to pdf**

```bash
libreoffice --headless --convert-to pdf yourfile.docx
```

**Convert pdf to epub**

```bash
sudo dnf -y install calibre
pip install cssutils cssselect
ebook-convert file.pdf file.epub [--enable-heuristics]
```

**Convert pdf to text**

```bash
sudo dnf -y install poppler-utils
pdftotext input.pdf output.txt
for file in *.pdf; do pdftotext "$file" "$file.txt"; done  # Batch
```

**Remove pdf password**

```bash
sudo dnf -y install qpdf
qpdf --decrypt input.pdf output.pdf
```

**Install printer config tool**

```bash
sudo dnf -y install system-config-printer
```

### Images and video

**mpv: nice video player, alternative to vlc**

```bash
sudo dnf -y install mpv
```

**Compress image with ImageMagick**

```bash
# Convert image: max 256x256px, strip metadata, compress
convert input.png -resize 256x256\> -strip -quality 85 -define png:compression-level=9 output.png
```

<https://stackoverflow.com/questions/7261855/recommendation-for-compressing-jpg-files-with-imagemagick>

```bash
convert -strip -interlace Plane -gaussian-blur 0.05 -quality 85% source.jpg result.jpg
# Alternatively
sudo dnf -y install GraphicsMagick
```

**Resize image, -strip to remove EXIF data**

```bash
convert dragon.gif -resize 50%  half_dragon.gif
convert original.jpg -resize 25% -strip converted.jpg
convert original.jpg -resize 25% -strip -quality 75% converted.jpg
```

**Record screen / Screen capture - SimpleScreenRecorder**

```bash
sudo dnf install dnf-plugins-core
sudo dnf copr enable nickth/ssr
sudo dnf install ssr
```

**View video information**

```bash
sudo dnf -y install mediainfo
```

**Interesting and fun packages**

```bash
cowsay
lolcat
asciinema  # Record terminal session: pip3 install asciinema
```

**mpv sleeping when watching**

```bash
# block screen sleep: https://www.reddit.com/r/linuxquestions/comments/6889l2/how_do_i_make_mpv_inhibit_the_screensaverprevent/
gnome-session-inhibit mpv [VIDEO_FILE]
```

**Add subtitle to mkv file**

<https://superuser.com/questions/609113/how-to-add-and-remove-subtitles-in-an-mkv-file>

```bash
mkvmerge -o output.mkv input.mkv --language 0:eng --track-name 0:English sub.srt
```

## Advanced diagnostics

[Performance benchmarks](#performance-benchmarks) · [CPU and GPU tuning](#cpu-and-gpu-tuning)

### Performance benchmarks

**Test/benchmark network performance, e.g. LAN/wifi connection bandwidth**

```bash
# sudo dnf -y install iperf
# Machine A, as server
iperf -s
# Machine B, as client
iperf -c IP_MACHINE_A [-p PORT]
```

**Test internet speed from speedtest.net from command line**

<https://askubuntu.com/questions/104755/how-to-check-internet-speed-via-terminal>

```bash
curl -s  https://raw.githubusercontent.com/sivel/speedtest-cli/master/speedtest.py | python - --bytes
```

**Generate system resource statistics**

```bash
sudo dnf -y install dstat
dstat -tcmd > dstat.out

# Combine with gnuplot to output graph
# http://www.linuxuser.co.uk/tutorials/create-a-graph-of-your-systems-performance/4

# Remove line with words time/date/system
grep -Ev 'time|date|system' dstat.out > dstat-2.out

#!/usr/bin/gnuplot
set terminal png
set output "cpu.png"
set title "CPU usage"
set xlabel "time"
set ylabel "percent"
set xdata time
set timefmt "%d-%m %H:%M:%S"
set format x "%H:%M"
plot "dstat-2.out" using 1:3 title "system" with lines, \
"dstat-2.out" using 1:2 title "user" with lines, \
"dstat-2.out" using 1:4 title "idle" with lines
```

**Stress test, generate load, test memory load**

```bash
sudo dnf -y install stress
stress --cpu 2 --vm 2 --vm-bytes 256M --io 2 --dry-run
# vm-keep option let memory usage stay there (vs freeing and reallocating)
stress --cpu 2 --vm 1 --vm-bytes 8G --vm-keep --io 2 --dry-run
```

**Benchmark hard drive, ssd with fio: sudo dnf -y install fio**

```bash
# NOTE: block size --bs is usually 4K instead of 4M (Need to modify eg below)
# https://arstech.net/how-to-measure-disk-performance-iops-with-fio-in-linux/

  Random WRITE test for throughput
sync; fio --randrepeat=1 --ioengine=libaio --direct=1 --gtod_reduce=1 --name=test --filename=test --bs=4M --iodepth=256 --size=10G --readwrite=randwrite --ramp_time=4

  Random READ test for throughput
sync; fio --randrepeat=1 --ioengine=libaio --direct=1 --gtod_reduce=1 --name=test --filename=test --bs=4M --iodepth=256 --size=10G --readwrite=randread --ramp_time=4

  Sequential WRITE test for throughput
sync; fio --randrepeat=1 --ioengine=libaio --direct=1 --gtod_reduce=1 --name=test --filename=test --bs=4M --iodepth=256 --size=10G --readwrite=write --ramp_time=4

  Sequential READ test for throughput
sync; fio --randrepeat=1 --ioengine=libaio --direct=1 --gtod_reduce=1 --name=test --filename=test --bs=4M --iodepth=256 --size=10G --readwrite=read --ramp_time=4

  Realistic READ/WRITE test with block size 4KB
sync; fio --randrepeat=1 --ioengine=libaio --direct=1 --gtod_reduce=1 --name=test --filename=test --bs=4k --iodepth=64 --size=10G --readwrite=randrw --rwmixread=75
```

**Simple loadtest**

<https://github.com/alexfernandez/loadtest#regular-usage>

```bash
# npm install -g loadtest
# [-t timelimit_seconds] [--rps 200]
loadtest [-n requests] [-c concurrency] [-k] URL
```

### CPU and GPU tuning

**Disable CPU cores**

<http://www.absolutelytech.com/2011/08/01/how-to-disable-cpu-cores-in-linux/>

<http://pundiramit.blogspot.sg/2010/07/how-to-disable-cpu-cores-in-multicore.html>

```bash
sudo sh -c "echo 0 > /sys/devices/system/cpu/cpu7/online"
```

**Top for Nvidia GPU**

<http://stackoverflow.com/questions/8223811/top-command-for-gpus-using-cuda>

```bash
nvidia-smi -q -g 0 -d UTILIZATION -l
nvidia-smi -l <refresh_in_seconds>
```

**Disable turbo boost**

<http://luisjdominguezp.tumblr.com/post/19610447111/disabling-turbo-boost-in-linux>

```bash
# Replace i in -pi with processor no
sudo dnf install msr
sudo rdmsr -pi 0x1a0 -f 38:38  # Check turbo boost status (0 is on)
sudo wrmsr -pi 0x1a0 0x4000850089
```

**Enable turbo boost**

```bash
sudo wrmsr -pi 0x1a0 0x850089
```

**Check and limit CPU frequency info**

```bash
cpupower frequency-info
# Set the max frequency (put a script to /etc/profile.d for auto-startup)
sudo systemctl start cpupower
sudo cpupower frequency-set -u 2.6GHz
# cpupower may conflict with tuned
# https://www.centos.org/forums/viewtopic.php?f=47&t=47982
```

**Limit process by % cpu**

```bash
cpulimit -p <pid> -l <percent-cpu>
```

## Historical notes

Recipes retained from older distributions, application versions, and services. Package URLs, paths, and configuration formats reflect the original setup; these examples have not been refreshed for current releases.

[GRUB and boot recovery](#grub-and-boot-recovery) · [SysVinit and legacy networking](#sysvinit-and-legacy-networking) · [Old repositories and installers](#old-repositories-and-installers) · [Older desktop and driver setup](#older-desktop-and-driver-setup) · [Older security configuration](#older-security-configuration) · [Version-specific tools and services](#version-specific-tools-and-services)

### GRUB and boot recovery

**Set default menuentry in grub2**

<https://unix.stackexchange.com/questions/62733/how-to-correctly-set-up-the-right-grub-2-default-menu-entry>

```bash
# 1. Find the menuentry name desired
cat /boot/efi/EFI/fedora/grub.cfg | grep menuentry
# 2. Set it via grub2-set-default, e.g.
grub2-set-default 'Fedora (4.17.3-200.fc28.x86_64) 28 (Workstation Edition)'
```

**Fix Windows entry in grub2**

<https://www.centos.org/forums/viewtopic.php?f=47&t=47476>

```bash
# Add to /etc/grub2.cfg:
menuentry 'Windows 8 (loader)' {
        insmod part_msdos
        insmod ntfs
        set root='hd0,msrdos1'
        ntldr /bootmgr
}
```

**Install grub2 after Windows Bootloader replaces it**

<https://fedoraproject.org/wiki/GRUB_2#Encountering_the_dreaded_GRUB_2_boot_prompt>

```bash
Examples:
> set root=(lvm,fedora-root)
> linux (hd0,msdos3)/vmlinuz-<version> root=/dev/mapper/fedora-root rhgb quiet selinux=0
> initrd (hd0,msdos3)/initramfs-<version>
> boot
```

**Fix grub2 after installing Windows**

<https://www.reddit.com/r/linuxquestions/comments/3b8tlp/how_do_i_fix_grub2_so_that_fedora_22_will_show_up/>

```bash
# Check with fdisk -l
mkdir /mnt/root
mount /dev/mapper/fedora-root /mnt/root
mount /dev/sda1 /mnt/root/boot
mount -o bind /dev /mnt/root/dev
mount -o bind /proc /mnt/root/proc
mount -o bind /sys /mnt/root/sys
mount -o bind /run /mnt/root/run
chroot /mnt/root
grub2-install --no-floppy --recheck /dev/sda
grub2-mkconfig -o /boot/grub2/grub.cfg
exit
/sbin/shutdown -r now
```

### SysVinit and legacy networking

**Start openssh-daemon (for ssh service)**

```bash
sudo /etc/init.d/sshd start
```

**SysVinit: start, stop, enable/disable services**

<https://unix.stackexchange.com/questions/106656/how-do-services-in-debian-work-and-how-can-i-manage-them>

```bash
ls /etc/init.d/
/etc/init.d/$SERVICE_NAME start
/etc/init.d/$SERVICE_NAME stop
update-rc.d $SERVICE_NAME defaults  # Enable
update-rc.d -f $SERVICE_NAME remove # Disable
```

**Debian or SysVinit: check which services will start at boot**

```bash
ls /etc/rc*.d
```

**Autostart sshd**

```bash
chkconfig sshd on
```

**Firewall**

```bash
sudo /etc/init.d/iptables save
sudo /etc/init.d/iptables stop
```

**Restart network w/o Network Manager**

```bash
/etc/init.d/network restart
```

**Setup static ip. May need to disable NetworkManager.service**

```bash
sudo vim /etc/sysconfig/network-scripts/ifcfg-<interface-name>
# Modify/Add these lines
DEVICE=<interface-name>
BOOTPROTO=static
IPADDR=192.168.8.248
NETMASK=255.255.255.0
BROADCAST=192.168.8.255
```

### Old repositories and installers

**Add EPEL repo, contains a lot extra softwares**

<http://www.tecmint.com/how-to-enable-epel-repository-for-rhel-centos-6-5/>

```bash
sudo yum install epel-release
sudo dnf -y install http://dl.fedoraproject.org/pub/epel/7/x86_64/e/epel-release-7-5.noarch.rpm
```

**Install VLC**

```bash
sudo dnf -y install http://download1.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-23.noarch.rpm http://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-23.noarch.rpm
sudo dnf -y install vlc
```

**Install nux-desktop repo**

<http://wiki.centos.org/TipsAndTricks/MultimediaOnCentOS7>

```bash
sudo dnf -y install http://li.nux.ro/download/nux/dextop/el7/x86_64/nux-dextop-release-0-5.el7.nux.noarch.rpm
```

**Add rpmforge repo**

<http://www.tecmint.com/enable-rpmforge-repository/>

```bash
wget http://pkgs.repoforge.org/rpmforge-release/rpmforge-release-0.5.3-1.el7.rf.x86_64.rpm
rpm -Uvh rpmforge-release-0.5.3-1.el7.rf.x86_64.rpm
```

**Convert RedHat to CentOS**

<http://jensd.be/?p=32>

<http://lintut.com/convert-rhel-6-x-to-centos-6-x/>

**Clean up existing cache of metadata and packages. Also, erase RedHat subscription manager.**

```bash
dnf clean all
rpm -e subscription-manager
# Create a directory to keep CentOS packages
mkdir /root/centos
cd /root/centos
# Download the packages
wget http://mirror.centos.org/centos/6.3/os/x86_64/RPM-GPG-KEY-CentOS-6
wget http://mirror.centos.org/centos/6.3/os/x86_64/Packages/centos-release-6-3.el6.centos.9.x86_64.rpm
wget http://mirror.centos.org/centos/6.3/os/x86_64/Packages/dnf-3.2.29-30.el6.centos.noarch.rpm
wget http://mirror.centos.org/centos/6.3/os/x86_64/Packages/dnf-utils-1.1.30-14.el6.noarch.rpm
wget http://mirror.centos.org/centos/6.3/os/x86_64/Packages/dnf-plugin-fastestmirror-1.1.30-14.el6.noarch.rpm
# Next enter the commands below to first import CentOS GPG key, to install the packages and then to upgrade to CentOS 6
rpm –import RPM-GPG-KEY-CentOS-6
rpm -e –nodeps redhat-release-server
rpm -e dnf-rhn-plugin rhn-setup rhn-check rhn-setup-gnome rhnsd
rpm -Uhv –force *.rpm
dnf upgrade
# Reboot the server in order to complete the installation.
```

**Install exfat library**

```bash
sudo dnf -y install https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-25.noarch.rpm
sudo dnf -y install fuse-exfat.x86_64
```

### Older desktop and driver setup

**Open file with default application**

```bash
gnome-open <file>
```

**Open file browser**

```bash
nautilus --browser ~/some/directory
```

**Nautilus to always show path: Open dconf-editor**

```bash
Find org.gnome.nautilus.preferences
check "always_use_location_entry"
```

**Open file eg pdf**

```bash
gvfs-open doc.pdf
```

**Lock screen**

```bash
gnome-screensaver-command -l
```

**Disable gnome 3 animation**

```bash
gsettings set org.gnome.desktop.interface enable-animations false  # non-permanent
sudo dnf -y install dconf-editor
-> browse to org.gnome.desktop.interface and set enable-animations=false.
```

**Restart gnome-shell**

```bash
Alt+F2 -> r
```

**Fedora to install VMware Tools need to install kernel headers**

```bash
sudo dnf install kernel-devel-`uname -r` kernel-headers-`uname -r`
sudo dnf -y install kernel-headers-$(uname -r)
```

**VMware patches**

<https://github.com/rasa/vmware-tools-patches>

**When VMWare cause Ctrl key to not working**

```bash
setxkbmap
```

**VMware cannot copy paste**

```bash
1. Go into VM / Settings / Options / Guest Isolation
2. UNCHECK both checkboxes (Enable drag and drop, Enable copy and paste) and click OK.
3. Shut down the guest, and shut down VMware Workstation
4. Reboot the host computer
5. Run VMware Workstation but do not launch the guest yet.
6. Go into VM / Settings / Options / Guest Isolation for the guest, and CHECK both    checkboxes
7. Power On the guest.
```

**Install latest firefox**

<http://tecadmin.net/install-firefox-on-linux/>

**Disable Fedora Gnome auto update**

```bash
/usr/bin/gsettings set org.gnome.software download-updates false
# Alternatively,
dconf write /org/gnome/software/download-updates false
```

**Disable PackageKit from update**

```bash
sudo /usr/bin/gpk-prefs
Select 'Never'
```

**Choppy mouse**

<http://superuser.com/questions/528727/how-do-i-solve-periodic-mouse-lag-on-linux-mint-mate>

```bash
sudo -i
echo N> /sys/module/drm_kms_helper/parameters/poll
echo "options drm_kms_helper poll=N">/etc/modprobe.d/local.conf
```

**Gnome extensions**

```bash
# Disable touchpad on mouse plugged in
git clone https://github.com/orangeshirt/gnome-shell-extension-touchpad-indicator
mv gnome-shell-extension-touchpad-indicator ~/.local/share/gnome-shell/extensions/touchpad-indicator@orangeshirt
Alt+F2, r
```

**Sleep button**

<https://github.com/laserb/gnome-shell-extension-suspend-button>

Windows 10 window snap auto resizing

<https://github.com/emasab/shelltile>

**Improve font rendering on CentOS**

<https://www.dropbox.com/s/73plzdw2d1h3md6/Infinality.tar.gz?dl=0>

```bash
sudo dnf -y install http://www.infinality.net/fedora/linux/20/noarch/fontconfig-infinality-1-20130104_1.noarch.rpm http://www.infinality.net/fedora/linux/20/x86_64/freetype-infinality-2.4.12-1.20130514_01.fc18.x86_64.rpm
OR
sudo dnf -y install freetype-infinality
# Set style then log out and log in
sudo /etc/fonts/infinality/infctl.sh setstyle

sudo dnf -y install gnome-tweak-tool
```

**Remote desktop server (RDP) for linux: x2goserver**

```bash
# ------------------------------------------------------------
# https://wiki.x2go.org/doku.php/doc:installation:x2goserver
sudo apt-key adv --recv-keys --keyserver keys.gnupg.net E1F958385BFE2B6E

sudo cat <<EOF >> /etc/apt/sources.list.d/x2go.list
# X2Go Repository (release builds)
deb http://packages.x2go.org/debian stretch main
# X2Go Repository (sources of release builds)
deb-src http://packages.x2go.org/debian stretch main

# X2Go Repository (nightly builds)
#deb http://packages.x2go.org/debian stretch heuler
# X2Go Repository (sources of nightly builds)
#deb-src http://packages.x2go.org/debian stretch heuler
EOF

sudo apt-get update
sudo apt-get install x2go-keyring
sudo apt-get install x2goserver x2goserver-xsession

# x2go client
sudo dnf -y install x2goclient

# ------------------------------------------------------------
```

**Fix driver for Realtek 8192. Used in Edimax EW-7811Un**

<https://github.com/pvaret/rtl8192cu-fixes>

**Install USB wireless adapter**

```bash
# ============================
# Prolink WN2001 (Need to install kernel-devel first)
lsusb  # To check the device id, in this case 07b8:8179 AboCom Systems Inc
git clone https://github.com/lwfinger/rtl8188eu  # Repository for the driver
# After finish installing
sudo modprobe 8188eu
# Edimax EW-7811Un: Realtek 8192CU
# https://github.com/pvaret/rtl8192cu-fixes
```

**Activate Office 2010 with KMS**

<http://askubuntu.com/questions/277709/activate-office-2010-running-in-playonlinux-with-a-kms-server>

```bash
wine regedit
HKEY_LOCAL_MACHINE\Software\Microsoft\OfficeSoftwareProtectionPlatform
Add String Value: KeyManagementServiceName - Server Addr
Add String Value: KeyManagementServicePort - Port (1688)
Check
HKEY_USERS\S-1-5-20\Software\Microsoft\OfficeSoftwareProtectionPlatform
```

**Install Acrobat Reader DC (Fedora 30)**

```bash
sudo dnf config-manager --add-repo https://dl.winehq.org/wine-builds/fedora/30/winehq.repo
sudo dnf -y install wine winetricks
WINEARCH=win32 winetricks mspatcha
# Download Acrobat Reader .exe installer from
# http://get.adobe.com/uk/reader/otherversions/
wine AcroRdrDC***_en_US.exe
# You may need to install Segoe UI Fonts if some texts in settings are missing
```

**Ensure Wine uses 32 bit arch for next launch**

```bash
cat <<EOF >> ~/.bashrc
export WINEARCH=win32
EOF
```

### Older security configuration

**Restrict ssh to certain ip addresses, e.g. allow 192.168.0.x**

```bash
sudo vim /etc/hosts.allow
	sshd: 192.168.0.0/255.255.255.0
sudo vim /etc/hosts.deny
	sshd: ALL
```

**Disable SELinux to allow php executed remotely to create file, etc**

<http://docs.fedoraproject.org/en-US/Fedora/13/html/Security-Enhanced_Linux/sect-Security-Enhanced_Linux-Enabling_and_Disabling_SELinux-Disabling_SELinux.html>

```bash
sudo vim /etc/selinux/config
SELINUX=disabled
$ getenforce  # should return disabled
```

**To disable SELinux temporarily**

```bash
setenforce 0
```

**Disable keyring**

<https://wiki.archlinux.org/index.php/GNOME/Keyring#Disable_keyring_daemon_components>

```bash
cp /etc/xdg/autostart/gnome-keyring-ssh.desktop ~/.config/autostart/
echo 'Hidden=true' >> ~/.config/autostart/gnome-keyring-ssh.desktop
```

**Reset keyring**

<http://askubuntu.com/questions/65281/how-to-recover-reset-forgotten-gnome-keyring-password>

```bash
rm ~/.local/share/keyrings/login.keyring
```

### Version-specific tools and services

**Install system monitoring tools: Netdata. It will run on port 19999**

<https://github.com/firehol/netdata/wiki/Installation>

```bash
bash <(curl -Ss https://my-netdata.io/kickstart.sh)
```

**Download manager: Axel, usage: axel -avn 50 address (a:alt prog bar)**

```bash
sudo dnf -y install http://pkgs.repoforge.org/axel/axel-2.4-1.el6.rf.x86_64.rpm
```

**Install JDK from Oracle with direct link**

```bash
# https://gist.github.com/P7h/9741922, https://lv.binarybabel.org/catalog/java/jdk8
# More silent & auto extract:
wget -qO- --no-check-certificate --no-cookies --header "Cookie: oraclelicense=accept-securebackup-cookie" "http://download.oracle.com/otn-pub/java/jdk/8u172-b11/a58eab1ec242421181065cdc37240b08/jdk-8u172-linux-x64.tar.gz" | tar xzf -
# Less silent:
wget -c -O "jdk.tar.gz" --no-check-certificate --no-cookies --header "Cookie: oraclelicense=accept-securebackup-cookie" "http://download.oracle.com/otn-pub/java/jdk/8u131-b11/d54c1d3a095b4ff2b6607d096fa80163/jdk-8u131-linux-x64.tar.gz"
```

**Install database GUI: dbeaver**

<http://dbeaver.jkiss.org/download/>

**Share files from command line with Firefox send**

<https://github.com/timvisee/ffsend>

```bash
sudo wget -qO /usr/local/bin/ffsend https://github.com/timvisee/ffsend/releases/download/v0.2.46/ffsend-v0.2.46-linux-x64-static && \
sudo chmod +x /usr/local/bin/ffsend
```

**Upload file with file.io**

```bash
curl -F "file=@test.txt" https://file.io
```

**ffsend usage: --copy to copy the shareable link to clipboard**

```bash
ffsend upload [--password --copy] myfile.txt
ffsend download https://send.firefox.com/....
```

**Share files from command line, easy way**

<https://transfer.sh>

```bash
curl --upload-file ./hello.txt https://transfer.sh/hello.txt
curl -H "Max-Downloads: 1" -H "Max-Days: 5" --upload-file ./hello.txt https://transfer.sh/hello.txt
```

**VPN NUS**

<http://blog.yjwong.name/using-the-new-soc-vpn-on-linux/>

<http://www.abdelmartinez.com/2013/06/forticlient-ssl-vpn-routing-problem.html>  # Fix routing

**Install youtube-dl**

<https://github.com/rg3/youtube-dl>

```bash
sudo wget -q https://yt-dl.org/downloads/latest/youtube-dl -O /usr/local/bin/youtube-dl
sudo chmod a+rx /usr/local/bin/youtube-dl
```

**Reddit showerthoughts, can put in /etc/profile.d/shower_thoughts.sh**

<https://www.reddit.com/r/linux/comments/4jx4oh/get_a_random_rshowerthoughts_post_as_your_shell/?st=j1wbgkx1&sh=6f2bc0a2>

```bash
curl -s --connect-timeout 5 -A '/u/your_user_name' \
'https://www.reddit.com/r/showerthoughts/top.json?sort=top&t=week&limit=100' | \
python2.7 -c 'import sys, random, json; randnum = random.randint(0,99); response = json.load(sys.stdin)["data"]["children"][randnum]["data"]; print "\n\"" + response["title"] + "\""; print "    -" + response["author"] + "\n";'
```

**Install OpenVPN server easily**

<https://github.com/Nyr/openvpn-install>

```bash
wget https://git.io/vpn -O openvpn-install.sh && bash openvpn-install.sh
```

**Increase OpenVPN throughput (not tested yet)**

<https://winaero.com/blog/speed-up-openvpn-and-get-faster-speed-over-its-channel/>

```bash
# vim server.conf
sndbuf 0
rcvbuf 0
push "sndbuf 393216"
push "rcvbuf 393216"
```

**Yaml processor (read and write yaml in terminal)**

<http://mikefarah.github.io/yq/read/>

```bash
# go get github.com/mikefarah/yq
yq r sample.yaml b.c
cat sample.yaml | yq r - b.c
# Write
yq w sample.yaml b.c cat
```

**Tool that limits bandwidth of devices on the same network without access**

<https://github.com/bitbrute/evillimiter>

**ngrok**

<https://dashboard.ngrok.com/>

```bash
docker run --rm -it --net host --name ngrok python:3 bash
wget -O ngrok.zip https://bin.equinox.io/c/4VmDzA7iaHb/ngrok-stable-linux-amd64.zip
unzip ngrok.zip
./ngrok http 8080
```

## References

[Filesystem conventions and further reading](#filesystem-conventions-and-further-reading)

### Filesystem conventions and further reading

**Common directory specification e.g. common purpose of $HOME/.local/bin dir**

<https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html>

**Useful info**

<https://www.server-world.info>

**Red Hat documentation**

<https://access.redhat.com/documentation/en-US/Red_Hat_Enterprise_Linux/7>

**Purpose of various default folders in Linux filesystem e.g. /opt, /usr/share**

<https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch03s13.html>
