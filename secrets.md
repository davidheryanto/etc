# Secrets cheatsheet

> Personal cheatsheet — where API tokens and passwords live on a dev machine. `secret-tool`
> commands and the direnv guard hands-on verified 2026-09-20 (Fedora 42, GNOME 48,
> libsecret 0.21). Python `keyring` hands-on verified 2026-10-16 (macOS, keyring 25) and
> 2026-10-17 (Fedora 42, keyring 25.7, libsecret 0.21.7: a script's real API call, and reads
> and rewrites across `secret-tool` and `keyring`), run through `uv`, including from a Claude
> Code session. Everything else — the libsecret Git helper, SSH behaviour, the `security`
> commands, Windows — is doc-sourced, not hands-on-tested.

## Contents

- **Keep the secret in the OS credential store; files hold only the lookup**
- **Where each kind of secret belongs** — tokens, SSH keys, logins, what to back up
- **Python scripts and agents — `keyring` is one API on every OS**
- **Linux — `secret-tool` reads and writes the GNOME keyring**
    - Store, read, list, delete
    - Load a token into one project with direnv
    - Use libsecret for Git HTTPS passwords
    - Over SSH, do not assume the keyring is available
- **macOS — `security` reads and writes the Keychain**
- **Windows — Credential Manager stores, but `cmdkey` alone cannot read back**
- **Habits that keep a secret out of history, `ps`, and git**

## Keep the secret in the OS credential store; files hold only the lookup

Log in to a tool with its own login command when it has one (`gh auth login`, `aws sso
login`) — it manages storage and expiry for you. For everything else, put the value in the
**OS credential store** once. It keeps passwords and tokens encrypted for your user account:
GNOME Keyring on Fedora, Keychain on macOS, Credential Manager on Windows. Dotfiles,
`.envrc` and scripts then contain the *command that fetches it*, never the value.

```bash
secret-tool lookup service openai username personal    # this line goes in files; the token does not
```

The credential store protects the secret **at rest** — stolen disk, leaked dotfiles,
backups — and full-disk encryption is the baseline underneath it. It is not a defence
against malicious code already running as you. Scope each token to one machine and one
purpose, with an expiry, for that reason.

GNOME Keyring unlocks because your login password is passed to it. With automatic or
passwordless login it stays locked until you type the password at a prompt.

## Where each kind of secret belongs

**A program reads it → OS credential store. A person reads it → KeePassXC.** The credential
store unlocks once with your login and answers silently, which is what `.envrc`, scripts and
Git helpers need; it is machine-local and never syncs. KeePassXC is one portable file you
can back up, with its own master password — `keepassxc-cli` asks for it on every call, so it
suits a lookup you type by hand, not automation.

| Secret | Home | Why |
|---|---|---|
| API tokens used by CLIs and scripts | OS credential store, loaded per project by direnv | Encrypted at rest, loaded only where you work on that project |
| SSH private keys | `~/.ssh` with a passphrase, unlocked by ssh-agent → [linux.md](linux.md#keys-and-ssh-agent) | The agent hands out signatures, never the key |
| `gh` tokens | `gh auth login` prefers the credential store → [git.md](git.md#multiple-github-accounts-personal--work) | Nothing to manage by hand. It falls back to a plaintext file if the store fails — `gh auth status` shows which |
| Website logins, recovery codes, card numbers | KeePassXC database | Portable across machines, works with no desktop session |
| Secrets for a systemd service | `systemd-creds` + `LoadCredentialEncrypted=` | Encrypted to this machine (host key, TPM2, or both), never in the unit file |

**Back up the KeePassXC database and what unlocks it; nothing else needs a backup.** Keep
recovery codes somewhere other than the device they recover. Tokens in the credential store
are machine-local — after losing a machine, revoke and reissue them rather than restoring.

Leave KeePassXC's *Secret Service integration* off on GNOME: it competes with GNOME Keyring
for the same D-Bus name, and only one can own it.

For a repo that must carry encrypted config for a team: `sops` + `age`.

## Python scripts and agents — `keyring` is one API on every OS

The Python `keyring` package reads and writes the native store: Keychain on macOS, Secret
Service (GNOME Keyring, KWallet) on Linux, Credential Manager on Windows. A script that
needs a token reads it itself, in-process, so the value never sits in a file or in the
environment of everything else you launch.

An entry is found by two plain-text keys, **service** and **account** (keyring calls it
`username`, and on Linux stores it as the attribute `username` → *Linux*); only the value is
encrypted. Use the account either for a fixed label (`ciamailer` / `restKey`) or for an
identifier the secret belongs to, such as an OAuth client ID, so two credentials for the same
service can sit side by side.

```bash
uv run --with keyring keyring set adobe-analytics <client id>    # prompts for the value
uv run --with keyring keyring get adobe-analytics <client id>    # prints it
uv run --with keyring keyring del adobe-analytics <client id>
```

In the script, declare `keyring` in the `# /// script` dependencies and let a variable from
the shell win, so CI and one-off runs can inject the value without touching the store:

```python
def _secret(client_id: str) -> str:
    if v := os.environ.get("ADOBE_CLIENT_SECRET"):
        return v
    import keyring
    from keyring.errors import KeyringError
    try:
        v = keyring.get_password("adobe-analytics", client_id)
    except KeyringError as e:
        sys.exit(f"credential store unavailable or locked ({type(e).__name__})")
    if not v:
        sys.exit(f"no secret: uv run --with keyring keyring set adobe-analytics {client_id}")
    return v
```

- **Report a locked store separately from a missing entry.** Otherwise "unlock the
  keyring" reads as "store the secret again".
- **If the script also loads a `.env`, refuse a secret found there.** `load_dotenv()` puts
  it in the environment, where it silently wins over the keyring.
- **macOS trusts the Python program, not your script.** "Always Allow" for one Python
  binary lets every script run with it read the entry without asking.
- **A coding agent running as you can read the entry too**, the same way your script does.
  The store protects the secret at rest, not from code you let run. Keep the read inside
  the one tool that needs it, never print or `export` it, and scope the token narrowly.
- **Each machine is provisioned separately.** The API is cross-platform; the stores do not
  sync.

## Linux — `secret-tool` reads and writes the GNOME keyring

`secret-tool` ships with `libsecret` and is already on Fedora Workstation. It talks to
whatever provides the Secret Service — GNOME Keyring here, KWallet on KDE.

### Store, read, list, delete

An entry is a label plus attribute pairs you choose; the same pairs find it again. Use
`service <name> username <which>` — the names Python `keyring` stores and searches, so one
entry serves `secret-tool`, `.envrc` and scripts alike. With `account` instead, neither tool
finds the other's entries. Attributes are stored as searchable plain metadata: **never put
the token itself in one.**

```bash
secret-tool store --label='OpenAI API key' service openai username personal   # prompts for the value
secret-tool lookup service openai username personal   # prints the value; exit 1 if missing
secret-tool lookup service openai username personal >/dev/null && echo stored   # check, value not shown
secret-tool search --all service openai               # lists matches — prints the values too
secret-tool clear service openai username personal    # delete
```

`store` prompts, so the value never reaches shell history. For a GUI over the same data:
`sudo dnf install seahorse` ("Passwords and Keys").

- **Give both attributes.** `lookup service openai` alone works while one entry has that
  service; once two do, it returns whichever comes first.
- **Store and change an entry with one tool.** `secret-tool store` replaces an entry made by
  `keyring`, but `keyring set` over an entry made by `secret-tool` adds a second one, and both
  tools keep reading the old value. To switch tools, `secret-tool clear` first.
- **`search` is no test for an entry:** it sends the `attribute.*` lines to stderr and exits 0
  when nothing matches. Use the `lookup … >/dev/null` check above.

### Load a token into one project with direnv

direnv needs its shell hook first → [bash.md](bash.md#tool-hooks-direnv-starship-).

Assign, check, then export. Writing `export VAR="$(…)"` on one line hides a failed lookup
and exports an empty variable that breaks tools later in confusing ways:

```bash
# .envrc
OPENAI_API_KEY="$(secret-tool lookup service openai username personal)" || {
  echo "direnv: openai key unavailable — keyring locked, or run: secret-tool store --label='OpenAI API key' service openai username personal" >&2
  return 1
}
export OPENAI_API_KEY
```

```bash
direnv allow        # .envrc is shell code — read it before allowing one you did not write
```

**direnv is convenience, not isolation.** Everything launched from that directory — build
scripts, dependencies, coding agents — inherits the token, and a process already running
keeps it after you `cd` away. For a production or unusually powerful credential, skip direnv
and pass it to the one command that needs it:

```bash
(token="$(secret-tool lookup service openai username personal)" && OPENAI_API_KEY="$token" some-command)
```

Not `OPENAI_API_KEY="$(…)" some-command`: when the lookup fails, that form still runs the
command, with an empty key. The subshell keeps `token` out of your shell.

After rotating a secret in the keyring, run `direnv reload` — direnv does not notice keyring
changes.

### Use libsecret for Git HTTPS passwords

Only needed for HTTPS remotes; SSH remotes never ask. Replaces `credential.helper cache` and
the plaintext `store` helper.

```bash
sudo dnf install git-credential-libsecret
git config --global --get-all credential.helper      # expect nothing; unset old helpers first
git config --global credential.helper libsecret
```

If you ever used the `store` helper, delete its leftover `~/.git-credentials`.

### Over SSH, do not assume the keyring is available

The keyring unlocks with your graphical login, and nothing can show an unlock prompt over
SSH. An SSH session reaches it only while you are also logged in at the desktop; on a
headless box it is not unlocked by default, and `secret-tool` hangs or fails. Starting a
D-Bus session and unlocking the daemon by hand works ([keyring's headless
instructions](https://keyring.readthedocs.io/en/latest/#using-keyring-on-headless-linux-systems)),
but rarely beats the simpler fallback: use the tool's
own credentials file, created private from the start (`umask 077`) — the same trade-off as
the macOS case in [tailscale.md](tailscale.md) → *Keychain gotcha for CLI tools in SSH
sessions*.

## macOS — `security` reads and writes the Keychain

These act on the default keychain, which is the login Keychain unless you changed it.

```bash
security add-generic-password -a "$USER" -s openai-api-key -w       # -w last = prompt for the value
security add-generic-password -a "$USER" -s openai-api-key -U -w    # -U updates an existing entry
security find-generic-password -a "$USER" -s openai-api-key -w      # prints only the value
security delete-generic-password -a "$USER" -s openai-api-key
```

The direnv pattern is identical — swap the lookup:

```bash
OPENAI_API_KEY="$(security find-generic-password -a "$USER" -s openai-api-key -w)" || return 1
export OPENAI_API_KEY
```

SSH key passphrases go in the Keychain through `UseKeychain yes` →
[git.md](git.md#multiple-github-accounts-personal--work). From an SSH session the login
Keychain is normally locked; `security unlock-keychain` and the file-based fallbacks are in
[tailscale.md](tailscale.md).

## Windows — Credential Manager stores, but `cmdkey` alone cannot read back

Credential Manager is the per-user encrypted store (Control Panel → *Credential Manager* →
*Windows Credentials*). `cmdkey` adds, lists and deletes but never prints a stored password,
so use it for credentials Windows itself consumes — file shares, RDP:

```bat
cmdkey /add:fileserver01 /user:me
cmdkey /list
cmdkey /delete:fileserver01
```

Leave out `/pass` and `cmdkey` prompts for it.

**Git:** nothing to set up with a standard Git for Windows install — it bundles Git
Credential Manager, which stores HTTPS credentials in Credential Manager. It cannot save
them from an SSH session into the Windows machine; Remote Desktop works. Git inside WSL can
share the same helper.

**A token a Python script reads:** `keyring` reads Credential Manager directly → *Python
scripts and agents*. The DPAPI file below is for PowerShell-only scripts.

**A token a PowerShell script reads unattended:** Credential Manager has no built-in command that
reads a value back, so save the token as a file encrypted with DPAPI instead — Windows'
per-user encryption, built into PowerShell. Only your user account on this computer can
decrypt it, so the file is useless if copied elsewhere.

```powershell
Read-Host -AsSecureString | Export-Clixml $HOME\openai-token.xml                  # prompts for the value
$env:OPENAI_API_KEY = Import-Clixml $HOME\openai-token.xml | ConvertFrom-SecureString -AsPlainText   # PowerShell 7+
```

**This encrypts on Windows only.** Under PowerShell on Linux or macOS the same commands write
the value merely encoded, readable by anyone with the file — use the OS credential store there.

**A token you look up by hand:** `keepassxc-cli`, the same database as on Linux and macOS.

```powershell
keepassxc-cli show -s -a Password C:\path\to\Passwords.kdbx "OpenAI API key"
```

Microsoft's `SecretManagement` + `SecretStore` PowerShell modules still work, but are
feature-complete and archived — security fixes only. Keep using them if you already do.

## Habits that keep a secret out of history, `ps`, and git

- **Never type the value as a command argument.** Arguments land in shell history and can
  show up in `ps` for other users. Use the prompting forms shown here.
- **Never `export TOKEN=…` in `.bashrc` / `.zshrc` on a desktop.** That hands the token to
  every program you launch, in every directory, coding agents included. Load it per project
  with direnv, or better, read it inside the script that needs it. The one
  exception is a headless machine with no reachable credential store, where a `chmod 600` file is the
  accepted fallback → [tailscale.md](tailscale.md).
- **`.envrc` holds the lookup, `.env` holds values.** Commit an `.envrc` only after checking
  it contains no values. Ignore `.env` in the repo's own `.gitignore` so the rule travels
  with the repo, and in the [global gitignore](git.md#global-gitignore) as a backstop.
- **A secret that touched git history is burned.** Rotate it first, clean history second —
  rewriting does not un-leak it.
- **Prefer short-lived and narrow.** Fine-grained tokens with an expiry, one per machine and
  purpose, so revoking one disrupts little.
