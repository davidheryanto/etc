# IPv6 troubleshooting cheatsheet

When CLI tools (`az login`, Python apps) hang but browsers work, suspect broken IPv6: the ISP advertises IPv6 to your machine but black-holes the traffic upstream.

## Contents

- **Symptoms**
    - Which apps hang and which don't

- **Diagnose**
    - Compare IPv4 vs IPv6
    - Check your own machine
    - Walk the path outward
    - Confirm it is not destination-specific

- **Why apps behave differently**
    - Happy eyeballs vs sequential connect
    - macOS quirks

- **Workaround: disable IPv6**
    - NetworkManager (Linux)
    - Re-enable later

## Symptoms

Broken IPv6 with working IPv4 produces a confusing split:

- `ping google.com` on Linux shows 100% packet loss (Linux `ping` prefers the AAAA record when the machine has a global IPv6 address)
- Browsers and `curl` work fine — they race IPv4/IPv6 in parallel
- Python-based CLIs (`az`, `gcloud`, `pip` sometimes) hang for minutes — Python tries each resolved address sequentially, and a hostname can resolve to many dead IPv6 addresses before the first IPv4 one

## Diagnose

Work outward from your machine: IPv4 vs IPv6 → own config → gateway → ISP → internet.

### Compare IPv4 vs IPv6

```bash
ping -4 -c 3 google.com   # works → IPv4 fine
ping -6 -c 3 google.com   # 100% loss → IPv6 broken somewhere
```

Time a real connection both ways. `time_connect: 0` with a long total means TCP never completed:

```bash
curl -4 -so /dev/null -w 'connect: %{time_connect}s total: %{time_total}s\n' --max-time 15 https://example.com/
curl -6 -so /dev/null -w 'connect: %{time_connect}s total: %{time_total}s\n' --max-time 15 https://example.com/
```

### Check your own machine

```bash
ip -6 addr show scope global   # do you have a global (2xxx:...) address?
ip -6 route show default       # is there a default route?
```

If both look right, your basic config is present — but that alone doesn't clear the machine (firewall rules, MTU, or source-address issues can still break it locally). Keep walking outward; where the path dies tells you whose problem it is.

### Walk the path outward

Ping the gateway from the `via ... dev ...` fields of `ip -6 route show default` (often `fe80::1`, but not always):

```bash
ping -6 -c 3 fe80::1%enp5s0                # <via>%<dev> from the default route
tracepath -6 -m 8 2001:4860:4860::8888     # where do replies stop?
```

If the trace enters the ISP's network and then goes silent, the break is upstream — nothing local will fix it; report it to the ISP. Identify whose network the last responding hop belongs to:

```bash
whois <last-responding-hop-ip> | grep -iE '^(netname|descr|org-name|country):'
```

### Confirm it is not destination-specific

```bash
ping -6 -c 3 2606:4700:4700::1111   # Cloudflare DNS
ping -6 -c 3 2001:4860:4860::8888   # Google DNS
```

ICMP can be filtered even on healthy networks, so back failed pings with forced-IPv6 TCP to unrelated sites:

```bash
curl -6 -sI --max-time 10 https://one.one.one.one/ -o /dev/null -w '%{http_code}\n'
curl -6 -sI --max-time 10 https://www.google.com/ -o /dev/null -w '%{http_code}\n'
```

All dead → general IPv6 outage, not a routing issue to one site.

## Why apps behave differently

### Happy eyeballs vs sequential connect

Browsers and `curl` implement "happy eyeballs" (RFC 8305): they attempt IPv6 and IPv4 in parallel and use whichever connects first, so broken IPv6 costs ~200ms, not minutes. Python's `socket.create_connection` walks the resolved addresses one by one — with IPv6 sorted first and each dead address waiting out a full TCP timeout. This is why `az login` hangs while the same login URL opens instantly in a browser.

### macOS quirks

- Plain `ping` on macOS is IPv4-only; use `ping6` to actually test IPv6. A Mac on the same broken network can look "fine" simply because you never tested IPv6.
- macOS keeps per-destination reachability statistics and quietly demotes IPv6 addresses that fail to connect, so even Python apps fall back to IPv4 quickly. Linux has no equivalent — hence the same tool hangs on Linux but works on a Mac.

## Workaround: disable IPv6

While the ISP outage lasts, disable IPv6 on the affected connection so nothing waits on the dead path. For a typical home/office setup this is harmless — no mainstream public service is IPv6-only. It does break anything that genuinely needs IPv6: internal IPv6-only services, IPv6-only container networks, or tunnels that ride the IPv6 underlay.

### NetworkManager (Linux)

Record the current settings first — the disable step wipes manual IPv6 DNS, and you'll want the original values when re-enabling:

```bash
nmcli connection show                    # find the connection name
nmcli -f ipv6.method,ipv6.dns connection show "Wired connection 1"   # note these down
nmcli connection modify "Wired connection 1" ipv6.dns "" ipv6.method disabled
nmcli connection up "Wired connection 1"
```

Clearing `ipv6.dns` is required first if manual IPv6 DNS servers were set — `method=disabled` rejects them. GNOME Settings equivalent: Network → connection ⚙ → IPv6 → Method: Disable → Apply, then reconnect.

Verify:

```bash
ip -6 addr show dev enp5s0   # empty → nothing left to hang on
```

### Re-enable later

Nothing will remind you the ISP fixed their side — re-enable occasionally and test. Restore the method and DNS values you noted down (method is usually `auto`):

```bash
nmcli connection modify "Wired connection 1" ipv6.method auto ipv6.dns "<original-dns-if-any>"
nmcli connection up "Wired connection 1"
ping -6 -c 3 google.com      # still broken → disable again
```
