# Tailscale cheatsheet

*Hands-on verified 2026-05-05 against Tailscale 1.96.x — Linux and macOS 26 (Standalone `.pkg`). App Store and Homebrew `tailscaled` sections are doc-sourced, not yet hands-on-tested.*

## Contents

**Quickstart**
- **Mac mini home server (end-to-end)** — linear, ~9 steps

**Reference**
- **Lock down to outgoing-only (personal device)** — `--shields-up`
- **Accept incoming (home server)**
    - macOS server checklist
- **Verify (cross-platform CLI)**
    - Saved preferences (incl. `ShieldsUp`)
    - Verify outgoing-only setup
- **Service starts on boot**
    - Linux (systemd)
    - macOS (GUI build vs. `tailscaled` daemon)
- **Adjusting settings later: `set`, not `up`**
- **macOS Standalone `.pkg`: first-time install**

## Quickstart: Mac mini home server (end-to-end)

Linear walkthrough: fresh Mac → reachable over the tailnet for SSH from your other devices, set up the recommended secure way. Follow top-to-bottom; each step has a "→" pointer to the reference section if you want the *why*.

> **Prerequisites:** A Tailscale account and at least one *other* device already on your tailnet (laptop, phone, another desktop) — you'll SSH *from* it to verify the Mac mini in steps 7–9. If the Mac mini is your very first Tailscale device, install Tailscale on another machine first and sign in to the same account; see [Tailscale's install page](https://tailscale.com/download).

1. **Install Tailscale Standalone `.pkg`.** Clear three approval gates *in order*: System Extension → *Allow VPN Configuration* → menu-bar toggle (browser auth on first run). → [details](#macos-standalone-pkg-first-time-install)
2. **Add the `tailscale` CLI to `$PATH`.** Menu bar icon → *Settings…* → *Settings* tab → *Command Line Integration* → **Add Now**. Without this, `tailscale` returns "command not found". → [details](#verify-cross-platform-cli)
3. **Disable key expiry** for the device in `login.tailscale.com/admin/machines` (⋯ menu → *Disable key expiry*). Otherwise the server silently drops off the tailnet every ~180 days. → [why](#accept-incoming-home-server)
4. **Enable Remote Login.** *System Settings → General → Sharing → Remote Login*: **on**, *Allow access for: Only these users* (your account or Administrators), **Allow full disk access for remote users → off**. → [details](#macos-server-checklist)
5. **FileVault: leave it on (recommended).** Run `fdesetup status` to confirm. Accept that any reboot = walk over and physically log in (the Standalone `.pkg` Tailscale doesn't run pre-login regardless of FileVault state); for planned reboots, use `sudo fdesetup authrestart`. → [tradeoff + pre-login gotcha](#macos-server-checklist)
6. **Set power so the Mac stays reachable while running:**
   ```bash
   sudo pmset -a sleep 0 womp 1 tcpkeepalive 1
   pmset -g                              # verify
   # autorestart deliberately omitted — see pre-login gotcha in reference.
   ```
   → [details](#macos-server-checklist)
7. **Install your client's pubkey.** From the client (e.g. another laptop already on the tailnet):
   ```bash
   # Generate an SSH key first if you don't have one:
   [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519

   # Install it on the server:
   ssh-copy-id user@<server-hostname>    # MagicDNS hostname or 100.x.y.z tailnet IP
   # Fallback if ssh-copy-id is missing on your client:
   #   cat ~/.ssh/id_ed25519.pub | ssh user@<server-hostname> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

   ssh user@<server-hostname>            # should drop to a shell with no password prompt
   ```
8. **Disable SSH password auth on the Mac mini** (only after step 7 confirmed keyed login works):
   ```bash
   # Run from the Mac mini console, OR keep a working SSH session open as a safety net —
   # the kickstart reload preserves in-flight sessions, so the existing one stays alive
   # if the reload misbehaves.
   sudo mkdir -p /etc/ssh/sshd_config.d                            # default-present on modern macOS; idempotent
   grep -q '^Include /etc/ssh/sshd_config.d' /etc/ssh/sshd_config \
     || echo "WARN: main sshd_config doesn't Include sshd_config.d — drop-in won't be read"
   sudo tee /etc/ssh/sshd_config.d/99-no-passwords.conf <<'EOF'
   PasswordAuthentication no
   KbdInteractiveAuthentication no
   EOF
   sudo launchctl kickstart -k system/com.openssh.sshd
   sudo sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication)'  # both → no
   ```
   → [details](#macos-server-checklist)
9. **Verify hardening from the client** — both tests should hold:
   ```bash
   ssh user@<server-hostname>                                           # positive: keyed login still works
   ssh -o PubkeyAuthentication=no \
       -o PreferredAuthentications=password,keyboard-interactive \
       user@<server-hostname>                                           # negative: must fail with "Permission denied (publickey)"
   ```
   → [details](#macos-server-checklist)

Adding more clients later? Skip `ssh-copy-id` (no auth method available once password is disabled) — append the new pubkey from an existing authorized session: `echo 'ssh-ed25519 AAAA... user@newclient' >> ~/.ssh/authorized_keys`. → [details](#macos-server-checklist)

## Lock down to outgoing-only (personal device)

For a node that should reach other tailnet devices but never accept incoming connections from them — i.e. a laptop/desktop/phone that talks out to a homelab but shouldn't expose anything itself. Enabled with the `--shields-up` flag:

```bash
sudo tailscale up --shields-up
```

This persists across reboots — preferences are stored locally and the daemon re-applies them when it starts. No need to re-run on every boot.

Where state lives depends on the platform — and on macOS, the variant. Tailscale ships three macOS flavours; see Tailscale's [macOS variants](https://tailscale.com/kb/1065/macos-variants) doc.

- **Linux**: state file at `/var/lib/tailscale/tailscaled.state`
- **macOS App Store** (sandboxed Network Extension, GUI variant): state in the **user Keychain**, not on disk. Bound to a logged-in user session.
- **macOS Standalone `.pkg`** (System Extension, GUI variant — recommended for desktop/personal use): state in **files on disk**. Also bound to a logged-in user session — see [pre-login gotcha](#macos-server-checklist) before using as a headless server.
- **macOS open-source `tailscaled`** (`brew install tailscale`, kernel `utun`, daemon variant): state in **files on disk**, typically under `/opt/homebrew/var/lib/tailscale/` (Apple Silicon) or `/usr/local/var/lib/tailscale/` (Intel). **The variant Tailscale recommends for headless macOS servers** — runs under launchd, no user session required.

In all cases, regardless of where state lives, `tailscale debug prefs` reads the active prefs from the daemon — so use that to inspect, not the file. Don't install both App Store and Standalone variants on the same Mac (the docs warn this can prevent the network extension from launching).

The Mac GUI builds also expose shields-up as **Allow Incoming Connections** in the menu bar — unchecked = shields up. Same effect as the CLI flag.

To confirm it's actually blocking, see [Verify outgoing-only setup](#verify-outgoing-only-setup).

## Accept incoming (home server)

A node that should accept SSH or other incoming connections from the tailnet — i.e. the opposite of shields-up. Three things to set up:

**1. Don't run `--shields-up`.** It blocks incoming. If previously enabled on this machine, turn it off:

```bash
sudo tailscale set --shields-up=false
```

**2. Disable key expiry** in the admin console (`login.tailscale.com/admin/machines` → ⋯ on the device → **Disable key expiry**). Default is ~180-day re-auth, which would silently knock the server offline until someone signs in again. Set once per server. Confirm in the admin console — the device row no longer shows an expiry date.

**3. Enable an SSH path.** Pick one. (On macOS GUI builds, the `tailscale` CLI isn't on `$PATH` until you set it up — see [the callout under Verify](#verify-cross-platform-cli) if `tailscale` returns "command not found".)

- **Tailscale SSH** — auth via tailnet identity, ACL-controlled, no key management:
  ```bash
  sudo tailscale set --ssh
  ```
  Reflected as `RunSSH: true` in `tailscale debug prefs`.
  > ⚠️ **macOS GUI builds (App Store and Standalone `.pkg`) cannot run Tailscale SSH.** The command fails with `The Tailscale SSH server does not run in sandboxed Tailscale GUI builds.` — the embedded SSH server can't bind inside the system extension. On macOS, Tailscale SSH is only available via the Homebrew `tailscaled` variant (kernel `utun`). Verified empirically 2026-05-05 on Standalone 1.96.5.
- **OS-native SSH** — Linux: enable `sshd`. macOS: *System Settings → General → Sharing* → enable **Remote Login**. Then `ssh-copy-id user@hostname` from the client to install your pubkey. This is the only working SSH path on macOS GUI Tailscale builds, and it works fine alongside them. For macOS, see the [macOS server checklist](#macos-server-checklist) below for the full setup (Remote Login scoping, sleep/power, FileVault, disabling password auth, onboarding new clients).

Verify from another tailnet peer:

```bash
tailscale status                  # hostname listed with green dot
ssh user@hostname                 # via MagicDNS (admin → DNS to confirm enabled)
ssh user@100.x.y.z                # via raw tailnet IP — always works
```

> **For shared / multi-user tailnets:** the default tailnet ACL is "anyone in the tailnet can reach anything." That's fine for a personal tailnet (one human, all devices owned by them), but if your tailnet has coworkers / family / multiple users, restrict who can reach the server. Admin → *Access controls* → grant TCP/22 only to specific users, devices, or [tags](https://tailscale.com/kb/1068/acl-tags). For provisioning fleets of servers, Tailscale's recommended pattern is auth keys + tags (e.g. `tag:server`) so device lifecycle isn't tied to a personal user identity.

### macOS server checklist

Linux servers usually have all of this dialed in already. macOS needs a handful of OS-level steps on top of "enable Remote Login":

**Lock down Remote Login.** *System Settings → General → Sharing → Remote Login*:
- Toggle **Allow full disk access for remote users** *off* unless you specifically need it. Default-on as of macOS 26.x; grants SSH sessions a TCC bypass for protected user data (Mail, Messages, Calendar, browser history). Principle of least privilege says off — re-enable temporarily if a specific task needs it.
- Set *Allow access for: Only these users* and add your account explicitly (or the Administrators group if your account is the only admin).

**Power/sleep — keep it reachable.** GUI in *System Settings → Energy*; or via CLI:

```bash
sudo pmset -a sleep 0          # never sleep — without this, SSH dies when the Mac sleeps
sudo pmset -a womp 1           # wake-on-LAN (reliable on Ethernet, flaky on Wi-Fi)
sudo pmset -a tcpkeepalive 1   # keeps tailnet tunnels alive across short network blips (often default-on)
pmset -g                       # verify
```

`autorestart` is a separate decision tied to FileVault — set it after you've decided that question (see next section).

The annotation `sleep 0 (sleep prevented by bluetoothd, sharingd, powerd)` from `pmset -g` is normal — it lists which services hold sleep-assertion locks; the `0` policy is what matters.

**FileVault tradeoff.** Check with `fdesetup status`. If on, after *any* reboot the disk stays locked at the FileVault prompt and SSH never starts until someone physically unlocks it. Three options:

- **Disable FileVault** to bypass the FileVault prompt. On Apple Silicon the disk is still hardware-encrypted by the Secure Enclave; you only lose the password-binding of the encryption key. Smaller security regression than on Intel. (Read the next note before assuming this gets you unattended reachability — it doesn't, on the Standalone `.pkg`.)
- **Keep FileVault on, use `sudo fdesetup authrestart` for *planned* reboots** — one-shot, reboots immediately and skips the FileVault prompt on the *next* boot only. Works for OS updates, not for kernel panics or power outages.
- **Keep FileVault on and accept** that rare unplanned reboots = drive over to physically unlock. Reasonable for non-critical home use.

**Pre-login gotcha (Standalone `.pkg` and App Store).** The macOS GUI Tailscale variants are menu-bar apps started via Login Items — they do **not** run before a user logs in. So even with FileVault off and `autorestart 1`, after any reboot the Mac reaches the login screen but **doesn't rejoin the tailnet** until someone physically logs in. For true unattended reachability across reboots, pick one:

- **Enable macOS auto-login** — *System Settings → Users & Groups → Automatically log in as*. Security tradeoff: anyone with physical access boots straight into your account.
- **Switch to the Homebrew `tailscaled` variant** — `brew install tailscale && sudo brew services start tailscale`. Runs as a launchd daemon, no user session required. This is Tailscale's actual recommended variant for headless macOS servers. Cost: lose the menu-bar GUI; manage via CLI only. Don't run both this and a GUI variant on the same Mac.
- **Accept manual recovery** for any reboot. The simplest choice; what this guide implicitly assumes unless you say otherwise.

Set `sudo pmset -a autorestart 1` only if you've solved the pre-login problem (auto-login or Homebrew variant). Otherwise it just powers the Mac back on into a state where Tailscale isn't running.

**Disable SSH password auth (after key auth works).** Drop-in config + reload without dropping existing sessions:

```bash
sudo mkdir -p /etc/ssh/sshd_config.d                              # idempotent; default-present on modern macOS
grep -q '^Include /etc/ssh/sshd_config.d' /etc/ssh/sshd_config \
  || echo "WARN: main sshd_config doesn't Include sshd_config.d — drop-in won't be read"
sudo tee /etc/ssh/sshd_config.d/99-no-passwords.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sudo launchctl kickstart -k system/com.openssh.sshd     # reloads sshd; in-flight SSH sessions survive
sudo sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication)'   # both → no
```

Use the `sshd_config.d/` drop-in pattern instead of editing `/etc/ssh/sshd_config` — survives macOS upgrades that may overwrite the main file. The `Include` line that wires drop-ins into the main config has been default in macOS for years; the `grep` check guards against environments where someone removed it.

**Verify the hardening took effect.** From a tailnet peer:

```bash
ssh user@server                                                          # positive: keyed login still works
ssh -o PubkeyAuthentication=no \
    -o PreferredAuthentications=password,keyboard-interactive \
    user@server                                                          # negative: must fail with "Permission denied (publickey)"
```

If the negative test succeeds or even prompts for a password, the drop-in didn't take effect — re-check `sshd -T` output. The negative test is what proves the server is actually rejecting password auth, not just relying on the client to prefer keys.

**Bootstrapping a new client without re-enabling password auth.** Once password SSH is disabled, `ssh-copy-id` from a brand-new client has no auth method to use. Two clean workarounds:

```bash
# Generate a key on the new client first if needed:
[ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519

# Option 1 — append from an already-authorized session.
# On the new client, print and copy its pubkey:
cat ~/.ssh/id_ed25519.pub
# In an existing SSH session to the server:
echo 'ssh-ed25519 AAAA... user@newclient' >> ~/.ssh/authorized_keys

# Option 2 — ProxyJump through an already-authorized host:
ssh-copy-id -o ProxyJump=user@bootstrap.host user@server
# If ssh-copy-id is missing on the new client, the manual equivalent:
#   cat ~/.ssh/id_ed25519.pub | ssh -J user@bootstrap.host user@server \
#     "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Don't temporarily re-enable password auth just to onboard a new client — it's the wrong instinct. The bootstrap-from-existing-session path is faster and doesn't open a window where the server is weakly configured.

**Keychain gotcha for CLI tools in SSH sessions.** macOS keeps user secrets in the *login Keychain*, which is unlocked automatically when you log in graphically but **stays locked from SSH sessions** (a different macOS security context). CLI tools that stash auth in Keychain — Claude Code, `gh`, `aws`, `op`, etc. — work fine when run from the console but prompt for re-login from SSH. Symptom: "I authenticated this tool yesterday on the console, why is it asking me to log in again from SSH?"

**Preferred path: tool-specific file/env auth.** Most Keychain-using CLIs have a way to bypass the Keychain. The auth then lives in a file or env var readable by your UID — works identically in console, SSH, `.envrc`, scripts, and cron.

- **Claude Code**: run `claude setup-token` once on the console (opens a browser to confirm) to generate a long-lived (~1 year) OAuth token. Export it in `~/.zshrc`:
  ```bash
  export CLAUDE_CODE_OAUTH_TOKEN="<token>"
  ```
  Then `chmod 600 ~/.zshrc` — the default 644 is world-readable, which defeats the point of moving the token off Keychain. (Alternative: keep `~/.zshrc` shareable and put just the secret line in a sourced `~/.zshenv.local` you `chmod 600`.)
  **Keeps your Pro/Max subscription billing**, works over SSH, no Keychain needed — Anthropic's [documented pattern](https://code.claude.com/docs/en/authentication) for remote-only hosts. The alternative `ANTHROPIC_API_KEY` is also accepted but switches billing from subscription to API pay-as-you-go; usually not what you want if you have a plan.
- **`gh`**: re-login with `env -u GH_TOKEN gh auth login -h github.com --insecure-storage` (the `env -u` is needed if `GH_TOKEN` is already exported — `gh auth login` refuses to run otherwise). Token moves from Keychain to `~/.config/gh/hosts.yml`, mode 600. Re-run once per account if you have multiple. Verify with `gh auth status` — no entry should show source `keyring`.
- **`aws`**: file-based by default (`~/.aws/credentials`); Keychain only enters the picture via opt-in `credential_process` flows.
- **`op` (1Password CLI)**: no flat-file fallback. For headless use, switch to a [service-account token](https://developer.1password.com/docs/service-accounts/): `export OP_SERVICE_ACCOUNT_TOKEN=...`.

Tradeoff: a file/env-stored token is readable by any process with access to the file (= shell as you, or root). Keychain requires unlocking first, which is meaningfully better in multi-user contexts. On a single-user home Mac the gap is mostly theoretical — anyone with shell as you can also run `security unlock-keychain` (still needs the login password, but trivially phishable).

**Fallback: generic Keychain workarounds** for tools without a file/env escape:

1. **`security unlock-keychain` — canonical SSH workaround.** Unlock the user Keychain in the SSH session itself; the `security` CLI talks to `securityd`, which honors the file-backed unlock state regardless of audit session. Wrap in a per-tool function in `~/.zshrc` to auto-unlock on first call:
   ```bash
   <tool>() {
     if [ -n "$SSH_CONNECTION" ] && [ -z "$KEYCHAIN_UNLOCKED" ]; then
       security unlock-keychain ~/Library/Keychains/login.keychain-db
       export KEYCHAIN_UNLOCKED=true
     fi
     command <tool> "$@"
   }
   ```
   One macOS login password prompt per SSH session.
2. **Long-lived `tmux` in the GUI session, attach via SSH.** `tmux new -s main` on the Mac console (GUI) once per boot; SSH in and `tmux attach -t main`. The attached shell inherits the GUI session's bootstrap namespace and Keychain unlock. Brittle across reboots — the tmux server has to be re-started inside a fresh GUI session every time.
3. **`sudo launchctl asuser` — last resort.** `sudo launchctl asuser $(id -u) <cmd>` runs the command in the GUI user's launchd domain. **Needs `sudo` from SSH** because crossing audit sessions is a privileged operation (per Apple, `asuser` is a "legacy" command, not recommended for new use). NOPASSWD sudoers eliminates the password prompt but lets any process running as you escalate to root via `sudo launchctl asuser 0 /bin/sh` — avoid on personal machines.

## Verify (cross-platform CLI)

The CLI ships on Linux and macOS and the commands below behave the same on both.

> **macOS GUI builds (App Store *and* Standalone `.pkg`):** the CLI is bundled inside `/Applications/Tailscale.app` but not on `$PATH` after install — `tailscale` returns "command not found" until you set it up. Two ways:
>
> 1. **Via the GUI** — menu bar icon → *Settings…* → *Settings* tab → *Command Line Integration* → **Add Now**. (Older builds exposed this as a top-level *Install CLI…* item; current Standalone hides it under Settings.) The dialog also shows the current state, e.g. `/usr/local/bin/tailscale not available`.
> 2. **Symlink manually:**
>    ```bash
>    sudo ln -sf "/Applications/Tailscale.app/Contents/MacOS/Tailscale" /usr/local/bin/tailscale
>    ```
>
> The Homebrew `tailscaled` install puts `tailscale` on `$PATH` automatically — this caveat only applies to the GUI variants.

### Saved preferences (incl. `ShieldsUp`)

```bash
sudo tailscale debug prefs
```

Useful fields in the JSON output:

- `ShieldsUp: true` — incoming connections from the tailnet are blocked
- `WantRunning: true` — daemon brings the link up automatically on start
- `RouteAll: false` — not using any peer as an exit node
- `AdvertiseRoutes: null` — not acting as a subnet router
- `RunSSH: false` — Tailscale SSH not enabled

### Verify outgoing-only setup

Two quick checks: one on the device itself, one from another tailnet peer.

**On the device — check prefs and what's actually listening:**

```bash
sudo tailscale debug prefs | grep -iE '"Shields|"RunSSH'   # want: ShieldsUp: true, RunSSH: false
sudo ss -tlnp                                               # Linux: what's bound to a port
sudo systemctl is-active sshd                               # Linux: is sshd even running?
```

If something is listening on a port (e.g. `sshd` on `:22`), shields-up is doing real work blocking it. If nothing's listening anyway, you've got a second layer of "no incoming" for free.

**From another tailnet peer — prove the block works end-to-end:**

```bash
tailscale status                  # confirm the target is online (otherwise tests below prove nothing)
nc -zv <hostname> 22              # should TIME OUT — proves shields-up is blocking incoming
```

Try the port for any service you'd normally expect to expose (22 for SSH, 80/443 for web, etc.). If `nc` times out against an online peer, shields-up is working.

> ⚠️ **Don't use `tailscale ping` to verify shields-up.** Tailscale's own diagnostic traffic is allowed through shields-up by design — the mesh needs control messages to keep working. So `tailscale ping` can succeed even when shields are correctly blocking application traffic. `nc -zv <host> <port>` (or just trying to `ssh` / `curl`) is the real test.

## Service starts on boot

### Linux (systemd)

The Tailscale package enables `tailscaled.service` automatically. Verify:

```bash
systemctl is-enabled tailscaled    # → enabled
systemctl is-active  tailscaled    # → active
```

### macOS

**GUI builds (App Store and Standalone `.pkg`)** — run as a menu bar app, started via Login Items. Verify in *System Settings → General → Login Items & Extensions* that **Tailscale** is enabled. The app launches its bundled network extension automatically — note the App Store and Standalone variants register **different** extension identifiers (`IPNExtension` vs. `io.tailscale.ipn.macsys.network-extension`), which matters when grepping logs or `ps`.

**Homebrew `tailscaled`** — managed by launchd. Start and enable on boot with:

```bash
sudo brew services start tailscale
brew services list | grep tailscale       # → started
```

Inspect the launchd job directly:

```bash
sudo launchctl list | grep tailscale
```

## Adjusting settings later: `set`, not `up`

`tailscale up` flags are **not cumulative** — each invocation replaces the full set of flags, so re-running `tailscale up` without `--shields-up` will turn shields off. Since v1.8 the CLI catches this and warns you, printing a copyable command that includes all your existing flags — but it's still easy to paste through. Use `tailscale set` for incremental tweaks; it only changes the flags you pass:

```bash
sudo tailscale set --shields-up=false   # turn shields off
sudo tailscale set --shields-up         # turn shields back on
```

## macOS Standalone `.pkg`: first-time install

This variant is a **menu-bar GUI app** + System Extension. Best for desktop/personal use, or for a Mac mini you also use as a desktop. For pure headless servers (no logged-in user across reboots) Tailscale recommends the Homebrew `tailscaled` variant instead — see the [pre-login gotcha](#macos-server-checklist).

Three approval gates have to be cleared **in order** before the tailnet link comes up. The extension can be loaded but no traffic flows until the VPN profile is approved — easy to miss because the system extension toggle alone looks like the install is done.

1. **System Extension** — *System Settings → General → Login Items & Extensions → Network Extensions* → enable **Tailscale**.
2. **VPN configuration** — the app surfaces a separate *Allow VPN Configuration* prompt. This is what tells macOS to route traffic through the extension; without it the extension is loaded but inert.
3. **Bring it up** — flip the toggle in the Tailscale menu bar app (or click *Reconnect* if shown). On first run this opens a browser to authenticate the device to your tailnet.

When connected, the menu bar app shows a filled toggle, your tailnet name, and *Connected*; the device's tailnet IP appears under *Devices* and on `login.tailscale.com/admin/machines` with a green dot.

References:
- `tailscale up`: https://tailscale.com/kb/1241/tailscale-up
- macOS variants: https://tailscale.com/kb/1065/macos-variants
