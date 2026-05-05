# Tailscale cheatsheet

*Linux side verified 2026-05-05 against Tailscale 1.96.4 on Fedora 42. macOS sections sourced from Tailscale docs, not yet hands-on-tested.*

## Contents

- **Lock down to outgoing-only (`--shields-up`)**
- **Verify (cross-platform CLI)**
    - Saved preferences (incl. `ShieldsUp`)
    - Confirm shields are blocking
- **Service starts on boot**
    - Linux (systemd)
    - macOS (GUI build vs. `tailscaled` daemon)
- **Adjusting settings later: `set`, not `up`**

## Lock down to outgoing-only (`--shields-up`)

For a node that should reach other tailnet devices but never accept incoming connections from them (e.g. a workstation that talks out to a homelab but shouldn't expose anything itself):

```bash
sudo tailscale up --shields-up
```

This persists across reboots — preferences are stored locally and the daemon re-applies them when it starts. No need to re-run on every boot.

Where state lives depends on the platform — and on macOS, the variant. Tailscale ships three macOS flavours; see Tailscale's [macOS variants](https://tailscale.com/kb/1065/macos-variants) doc.

- **Linux**: state file at `/var/lib/tailscale/tailscaled.state`
- **macOS App Store** (sandboxed Network Extension): state in the **user Keychain**, not on disk
- **macOS Standalone `.pkg`** (System Extension, recommended): state in **files on disk**
- **macOS open-source `tailscaled`** (`brew install tailscale`, kernel `utun`): state in **files on disk**, typically under `/opt/homebrew/var/lib/tailscale/` (Apple Silicon) or `/usr/local/var/lib/tailscale/` (Intel)

In all cases, regardless of where state lives, `tailscale debug prefs` reads the active prefs from the daemon — so use that to inspect, not the file. Don't install both App Store and Standalone variants on the same Mac (the docs warn this can prevent the network extension from launching).

The Mac GUI builds also expose shields-up as **Allow Incoming Connections** in the menu bar — unchecked = shields up. Same effect as the CLI flag.

## Verify (cross-platform CLI)

The CLI ships on Linux and macOS and the commands below behave the same on both.

> **macOS App Store build:** the CLI is bundled but not on `$PATH`. Click the Tailscale menu bar icon → *Install CLI…*, or symlink manually:
> ```bash
> sudo ln -sf "/Applications/Tailscale.app/Contents/MacOS/Tailscale" /usr/local/bin/tailscale
> ```

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

### Confirm shields are blocking

From another tailnet device, first check the target shows up as online (otherwise a ping timeout proves nothing — it might just be offline, blocked by an ACL, or unreachable for some other reason):

```bash
tailscale status                   # confirm <hostname> is listed and online
tailscale ping <hostname>          # then this should time out when shields are up
```

`tailscale ping` runs over the tailnet (defaults to DISCO). With shields-up, a timeout against an otherwise-online peer is consistent with the peer refusing incoming connections; it's not by itself proof — pair it with `tailscale debug prefs` showing `ShieldsUp: true` for confidence.

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

References:
- `tailscale up`: https://tailscale.com/kb/1241/tailscale-up
- macOS variants: https://tailscale.com/kb/1065/macos-variants
