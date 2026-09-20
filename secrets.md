# Secrets cheatsheet

> Personal cheatsheet — where API tokens and passwords live on a dev machine. `secret-tool`
> commands and the direnv guard hands-on verified 2026-09-20 (Fedora 42, GNOME 48,
> libsecret 0.21). Everything else — the libsecret Git helper, SSH behaviour, macOS,
> Windows — is doc-sourced, not hands-on-tested.

## Contents

- **Keep the secret in the OS keyring; files hold only the lookup**
- **Where each kind of secret belongs** — tokens, SSH keys, logins, what to back up
- **Linux — `secret-tool` reads and writes the GNOME keyring**
    - Store, read, list, delete
    - Load a token into one project with direnv
    - Use libsecret for Git HTTPS passwords
    - Over SSH, do not assume the keyring is available
- **macOS — `security` reads and writes the Keychain**
- **Windows — Credential Manager stores, but `cmdkey` alone cannot read back**
- **Habits that keep a secret out of history, `ps`, and git**

## Keep the secret in the OS keyring; files hold only the lookup

Log in to a tool with its own login command when it has one (`gh auth login`, `aws sso
login`) — it manages storage and expiry for you. For everything else, put the value in the
OS's encrypted store once: GNOME Keyring on this Fedora desktop, Keychain on macOS,
Credential Manager on Windows. Dotfiles, `.envrc` and scripts then contain the *command that
fetches it*, never the value.

```bash
secret-tool lookup service openai account personal    # this line goes in files; the token does not
```

The keyring protects the secret **at rest** — stolen disk, leaked dotfiles, backups — and
full-disk encryption is the baseline underneath it. It is not a defence against malicious
code already running as you. Scope each token to one machine and one purpose, with an
expiry, for that reason.

GNOME Keyring unlocks because your login password is passed to it. With automatic or
passwordless login it stays locked until you type the password at a prompt.

## Where each kind of secret belongs

| Secret | Home | Why |
|---|---|---|
| API tokens used by CLIs and scripts | OS keyring, loaded per project by direnv | Encrypted at rest, loaded only where you work on that project |
| SSH private keys | `~/.ssh` with a passphrase, unlocked by ssh-agent → [linux.md](linux.md#keys-and-ssh-agent) | The agent hands out signatures, never the key |
| `gh` tokens | `gh auth login` prefers the keyring → [git.md](git.md#multiple-github-accounts-personal--work) | Nothing to manage by hand. It falls back to a plaintext file if the keyring fails — `gh auth status` shows which |
| Website logins, recovery codes, card numbers | KeePassXC database | Portable across machines, works with no desktop session |
| Secrets for a systemd service | `systemd-creds` + `LoadCredentialEncrypted=` | Encrypted to this machine (host key, TPM2, or both), never in the unit file |

**Back up the KeePassXC database and what unlocks it; nothing else needs a backup.** Keep
recovery codes somewhere other than the device they recover. Tokens in the keyring are
machine-local — after losing a machine, revoke and reissue them rather than restoring.

Leave KeePassXC's *Secret Service integration* off on GNOME: it competes with GNOME Keyring
for the same D-Bus name, and only one can own it.

For a repo that must carry encrypted config for a team: `sops` + `age`.

## Linux — `secret-tool` reads and writes the GNOME keyring

`secret-tool` ships with `libsecret` and is already on Fedora Workstation. It talks to
whatever provides the Secret Service — GNOME Keyring here, KWallet on KDE.

### Store, read, list, delete

An entry is a label plus attribute pairs you choose; the same pairs find it again. Pick one
convention and keep it — `service <name> account <which>`. Attributes are stored as
searchable plain metadata: **never put the token itself in one.**

```bash
secret-tool store --label='OpenAI API key' service openai account personal   # prompts for the value
secret-tool lookup service openai account personal    # prints the value; exit 1 if missing
secret-tool search --all service openai               # lists matches — prints the values too
secret-tool clear service openai account personal     # delete
```

`store` prompts, so the value never reaches shell history. For a GUI over the same data:
`sudo dnf install seahorse` ("Passwords and Keys").

### Load a token into one project with direnv

direnv needs its shell hook first → [bash.md](bash.md#tool-hooks-direnv-starship-).

Assign, check, then export. Writing `export VAR="$(…)"` on one line hides a failed lookup
and exports an empty variable that breaks tools later in confusing ways:

```bash
# .envrc
OPENAI_API_KEY="$(secret-tool lookup service openai account personal)" || {
  echo "direnv: openai key unavailable — keyring locked, or run: secret-tool store --label='OpenAI API key' service openai account personal" >&2
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
OPENAI_API_KEY="$(secret-tool lookup service openai account personal)" some-command
```

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
headless box it is never unlocked, and `secret-tool` hangs or fails. There, use the tool's
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

**A token a script needs to read:** keep it in the KeePassXC database and read it with
`keepassxc-cli` — the same database as on Linux and macOS.

```powershell
keepassxc-cli show -s -a Password C:\path\to\Passwords.kdbx "OpenAI API key"
```

Microsoft's `SecretManagement` + `SecretStore` PowerShell modules still work, but are
feature-complete and archived — security fixes only. Keep using them if you already do.

## Habits that keep a secret out of history, `ps`, and git

- **Never type the value as a command argument.** Arguments land in shell history and can
  show up in `ps` for other users. Use the prompting forms shown here.
- **Never `export TOKEN=…` in `.bashrc` / `.zshrc` on a desktop.** That hands the token to
  every program you launch, in every directory. Load it per project with direnv. The one
  exception is a headless machine with no reachable keyring, where a `chmod 600` file is the
  accepted fallback → [tailscale.md](tailscale.md).
- **`.envrc` holds the lookup, `.env` holds values.** Commit an `.envrc` only after checking
  it contains no values. Ignore `.env` in the repo's own `.gitignore` so the rule travels
  with the repo, and in the [global gitignore](git.md#global-gitignore) as a backstop.
- **A secret that touched git history is burned.** Rotate it first, clean history second —
  rewriting does not un-leak it.
- **Prefer short-lived and narrow.** Fine-grained tokens with an expiry, one per machine and
  purpose, so revoking one disrupts little.
