# Bash cheatsheet

## Contents

- **Setup**
    - Shebang
    - Aliases and functions (`fresh` example)
    - Shell options (strict mode, pipefail, allexport)

- **Variables**
    - Expansion and command substitution
    - Default values (`${VAR:-default}`)
    - Check if set or unset

- **Conditionals**
    - String comparison (`-z` / `-n` / `==`)
    - Numeric comparison (`-eq` / `-ne`)
    - File tests (`-x` / `-f` / `-d`)
    - Exit codes (`$?`)

- **Loops**
    - Numeric ranges and lists
    - Read lines from a file or heredoc
    - Iterate over files by extension

- **Functions and arguments**
    - Define a function
    - Pass all arguments (`"$@"`)
    - Argument count (`$#`)
    - Parse named and positional arguments

- **Strings and math**
    - Brace expansion
    - Heredoc / multi-line output
    - Pad with zeros
    - Tab character (`$'\t'`)
    - Arithmetic (`$((...))` and `bc`)

- **Terminal output and colors**
    - Bold with `tput`
    - ANSI escape codes

- **Files and paths**
    - `basename` and `cd -`
    - Script's own directory
    - Skip header lines (`tail`)

- **Keyboard shortcuts**
    - Cursor movement and editing
    - Reset terminal

## Setup

### Shebang

Why `/usr/bin/env bash` is preferred over `/bin/bash`:
https://stackoverflow.com/questions/21612980/why-is-usr-bin-env-bash-superior-to-bin-bash

```bash
#!/usr/bin/env bash
```

### Aliases and functions

Add to `~/.bashrc` or `~/.zshrc` (alias/function syntax is identical in both shells). Use these for commands you run often. After an MR is merged, for example, you typically need to reset your working branch to the latest main — a one-liner alias replaces `checkout main → pull → create branch`.

```bash
# Simple alias — shortcut for a fixed command
alias fresh='git fetch origin main && git checkout -B david origin/main'

# Function — accept arguments
# ${1:-david} means: use first argument, or "david" if none given
fresh() { git fetch origin main && git checkout -B "${1:-david}" origin/main; }
# fresh        → resets "david" branch to latest main
# fresh feat-x → resets "feat-x" branch to latest main

# Chain commands — e.g. reset branch and launch Claude Code
alias fresh='git fetch origin main && git checkout -B david origin/main && claude'
```

The `fresh` alias and the `review` helper are documented in detail in `git.md` ("Reset a working branch to latest main" and "Review a PR").

### Shell options (strict mode, pipefail, allexport)

Reference: https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html
Why strict mode matters: https://vaneyckt.io/posts/safer_bash_scripts_with_set_euxo_pipefail/

```bash
# Strict mode — fail fast on errors and unset variables
set -euo pipefail
# -e: exit immediately if any command fails
# -u: treat unset variables as errors
# -o pipefail: a pipeline fails if any stage fails (not just the last)

# Add -x for tracing (prints each command before running it)
set -euxo pipefail

# Just -x for debugging
set -x

# pipefail demo: without it, the exit code of `false | tee` is 0 (tee succeeded)
false | tee /dev/null ; echo $?      # → 0
set -o pipefail
false | tee /dev/null ; echo $?      # → 1

# Auto-export every variable assigned by a sourced file
# (useful for KEY=VALUE env files)
set -o allexport      # or: set -a
source envfile
```

## Variables

### Expansion and command substitution

```bash
${HOME}              # variable expansion
$(echo foo)          # command substitution — captures stdout
"$@"                 # all positional arguments, properly quoted
                     # https://unix.stackexchange.com/questions/78470/pass-arguments-to-function-exactly-as-is
                     # e.g. in a Dockerfile: exec "$@"
```

### Default values

https://unix.stackexchange.com/questions/122845/using-a-b-for-variable-assignment-in-scripts

```bash
VAR1="${VAR1:-default value}"   # use VAR1 if set, else "default value"
VAR1="${VAR1:-$VAR2}"           # use VAR1 if set, else VAR2
```

### Check if set or unset

https://stackoverflow.com/questions/3601515/how-to-check-if-a-variable-is-set-in-bash
https://stackoverflow.com/questions/11362250/in-bash-how-do-i-test-if-a-variable-is-defined-in-u-mode

```bash
# Modern, recommended
if [[ $var ]]; then echo "var is set"; fi
if [[ ! $var ]]; then echo "var is not set"; fi

# Equivalent with single brackets and -z/-n
if [ -z "$var" ]; then echo "var is empty/unset"; fi
if [ -n "$var" ]; then echo "var is set"; fi
```

## Conditionals

### String comparison (`-z` / `-n` / `==`)

Reference: http://tldp.org/LDP/abs/html/comparison-ops.html

- `-n`: string is not null
- `-z`: string has zero length

```bash
foo="bar"
[ -n "$foo" ] && echo "foo is not null"    # → foo is not null
[ -z "$foo" ] && echo "foo is null"        # (no output)

foo=""
[ -z "$foo" ] && echo "foo is null"        # → foo is null

# Equality
if [ "$1" == "something" ]; then ...; fi

# Boolean check (https://stackoverflow.com/a/2953673)
if [ "$myvar" = true ]; then echo "myvar is true"; fi
```

### Numeric comparison (`-eq` / `-ne`)

```bash
# String "==" vs numeric "-eq"/"-ne"
if [[ $? -ne 0 ]]; then echo "exit code not 0"; fi
```

### File tests (`-x` / `-f` / `-d`)

https://askubuntu.com/questions/445469/what-does-x-mean-in-if-conditional-statement

```bash
if [ -x /etc/rc.local ]; then ...; fi    # -x: file is executable
# -f: regular file exists
# -d: directory exists
```

### Exit codes (`$?`)

```bash
some_command
echo $?                                  # exit code of last command

if [[ $? -ne 0 ]]; then echo "failed"; fi
```

## Loops

### Numeric ranges and lists

```bash
# Range with step
for i in {0..10..2}; do
  echo $i
done

# Iterate over a list of items
for file in file1 file2 file3; do
  echo $file
done
```

### Read lines from a file or heredoc

http://stackoverflow.com/questions/1521462/looping-through-the-content-of-a-file-in-bash

```bash
# From a heredoc
while read line; do
  echo $line
done <<EOF
line1
line2
EOF

# From a file
while read p; do
  echo $p
done < FILEPATH.txt

# Single-line equivalent
while read p; do echo $p; done < users.txt
```

### Iterate over files by extension

https://stackoverflow.com/questions/14505047/loop-through-all-the-files-with-a-specific-extension

```bash
for f in *.rar; do unar "$f"; done
```

## Functions and arguments

### Define a function

```bash
print_something() {
  echo "Hello I am a function"
}
```

### Pass all arguments (`"$@"`)

```bash
"$@"           # all positional arguments, each quoted separately
# Common in Dockerfiles: exec "$@"
```

### Argument count (`$#`)

https://stackoverflow.com/questions/18568706/check-number-of-arguments-passed-to-a-bash-script

```bash
if [[ $# -ne 1 ]]; then
  echo "Illegal number of parameters"
fi
```

### Parse named and positional arguments

References:
- https://github.com/mattbryson/bash-arg-parse/blob/master/arg_parse_example
- https://github.com/kubeflow/pipelines/blob/8e53eb43adec9dd7593f99baae24813cc40bb302/test/postsubmit-tests-with-pipeline-deployment.sh

Named args, mixed with positional args:

```bash
# Positional args bucket
args=()

# Walk all args
while [ "$1" != "" ]; do
  case "$1" in
    -a | --an_arg )           an_arg="$2";          shift;;
    -s | --some_more_args )   some_more_args="$2";  shift;;
    -y | --yet_more_args )    yet_more_args="$2";   shift;;
    -h | --help )             usage;                exit;;
    * )                       args+=("$1")          # not matched → positional
  esac
  shift
done

# Restore positional args
set -- "${args[@]}"

# Map to named vars
positional_1="${args[0]}"
positional_2="${args[1]}"
```

Named args only (reject unknown flags):

```bash
usage() {
  echo "usage: run.sh
    [-a | --an_arg          some arguments ]
    [-s | --some_more_args  some other arguments ]
    [-h help]"
}

while [ "$1" != "" ]; do
  case "$1" in
    -a | --an_arg )           an_arg="$2";          shift;;
    -s | --some_more_args )   some_more_args="$2";  shift;;
    -y | --yet_more_args )    yet_more_args="$2";   shift;;
    -h | --help )             usage; exit;;
    * )                       usage; exit 1
  esac
  shift
done
```

## Strings and math

### Brace expansion

http://unix.stackexchange.com/questions/315963/bash-command-to-copy-before-cursor-and-paste-after

```bash
echo a{b,c,d{e,f,g}}
# → ab ac ade adf adg

# Useful for creating related files (Addy Osmani):
touch image-{header,footer}.txt
touch product.{js,css}
```

### Heredoc / multi-line output

https://stackoverflow.com/questions/10969953/how-to-output-a-multiline-string-in-bash

```bash
cat << EOF
usage: up [--level <n> | -n <levels>] [--help] [--version]

Report bugs to:
up home page:
EOF
```

### Pad with zeros

```bash
n=1
printf '%03d\n' $n             # → 001

# Inline in a URL
wget "http://example.com/SN-$(printf %03d $n).mp3"
```

### Tab character (`$'\t'`)

Pass a literal tab as an argument:

```bash
sort -t $'\t'
```

### Arithmetic (`$((...))` and `bc`)

https://unix.stackexchange.com/questions/40786/how-to-do-integer-float-calculations-in-bash-or-other-languages-frameworks

```bash
# Integer math — wrap in $(( ))
echo "$((20+5))"               # → 25

# Float math — pipe through bc
echo "20+5/2" | bc             # → 22 (integer)
echo "scale=2; 20+5/2" | bc    # → 22.50
```

## Terminal output and colors

### Bold with `tput`

https://stackoverflow.com/questions/2924697/how-does-one-output-bold-text-in-bash

```bash
bold=$(tput bold)
normal=$(tput sgr0)
echo "${bold}important${normal} normal text"
```

### ANSI escape codes

https://stackoverflow.com/a/58149187

| Color        | Code  | Light variant   | Code  |
| ------------ | ----- | --------------- | ----- |
| Red          | 0;31  | Light Red       | 1;31  |
| Green        | 0;32  | Light Green     | 1;32  |
| Brown/Orange | 0;33  | Yellow          | 1;33  |
| Blue         | 0;34  | Light Blue      | 1;34  |
| Purple       | 0;35  | Light Purple    | 1;35  |

Prefix `1;` for bold, `0;` for normal.

```bash
CYAN='\e[36m'
DEFAULT='\e[39m'
GREEN='\e[1;32m'        # bold green

printf "I ${GREEN}love${DEFAULT} Stack Overflow\n"

# echo needs -e to interpret backslash escapes
echo -e "I ${CYAN}love${DEFAULT} Stack Overflow"

# Wrap colors around a block
echo -en "\e[1;32m"
echo "I am green text"
echo -en "\e[39m"
```

In Java/Go source, use `\033` instead of `\e`:

```java
System.out.println("I have \033[1;35m color \033[0;39m and then no color");
```

```bash
# May also need TERM=xterm-color in non-interactive terminals
COLOR="\033[1;32m"
NO_COLOR="\033[0m"
echo -e "${COLOR}I'm colourful and bold${NO_COLOR}I'm normal"

# Common pair
COLOR_OK="\033[1;32m"
COLOR_ERR="\033[1;31m"
COLOR_RESET="\033[0m"
```

## Files and paths

### `basename` and `cd -`

```bash
basename "$PWD"        # current folder name without full path

cd -                   # jump back to previous directory ($OLDPWD)
                       # https://superuser.com/a/113220
```

### Script's own directory

https://stackoverflow.com/questions/59895/get-the-source-directory-of-a-bash-script-from-within-the-script-itself

```bash
# Robust (resolves symlinks correctly in most cases)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Shorter alternative
dirname "$BASH_SOURCE"
```

### Skip header lines (`tail`)

https://stackoverflow.com/a/604871

```bash
tail -n +3 <filename>     # skip first 2 lines, print from line 3 onward
```

## Keyboard shortcuts

### Cursor movement and editing

https://gist.github.com/tuxfight3r/60051ac67c5f0445efee

| Shortcut     | Action                                  |
| ------------ | --------------------------------------- |
| `Ctrl+A`     | Go to beginning of command line         |
| `Ctrl+E`     | Go to end of command line               |
| `Alt+F`      | Move cursor forward one word            |
| `Alt+B`      | Move cursor back one word               |
| `Ctrl+W`     | Delete the word before the cursor       |
| `Ctrl+U`     | Clear all before cursor                 |
| `Ctrl+K`     | Clear all after cursor                  |
| `!!`         | Run previous command (e.g. `sudo !!`)   |
| `Alt+.`      | Print the last argument of last command |

### Reset terminal

If your terminal gets into a garbled state (e.g. after `cat`-ing a binary):

```bash
reset
```
