# Claude in Chrome — safe setup

> Notes on the Claude in Chrome extension 1.0.81 (checked 2026-07-21). Written after
> a bare `navigate` opened a tab in Chrome on a different machine from the one I was
> watching. Two things decide what Claude can do in a browser:
>
> - **Which machine** — any Chrome signed into the extension is a target. A rule in
>   `~/.claude/CLAUDE.md` pins it to the local one.
> - **What that browser can reach** — a profile signed into nothing, unless you
>   choose a signed-in one on purpose.

## Best practices

Set up once, on each machine:

1. **Pin the browser in `~/.claude/CLAUDE.md`** (swap `Linux` for `macOS` on a Mac):

   ```markdown
   ## claude-in-chrome

   - Drive only the Chrome on this Linux machine. Before the first browser action,
     `list_connected_browsers` and `select_browser` the Linux one (`isLocal: true`), even if another
     is `inUse`. No Linux browser: stop and ask.
   ```

   The rule only works once the file exists — knowing it is not enough.
2. **Give Claude its own Chrome profile**, signed out of Google, and uninstall the
   extension from your daily profile. Steps in
   [Set up an isolated profile](#set-up-an-isolated-profile). Letting Claude drive a
   signed-in profile is a deliberate trade-off: everything that profile can reach,
   Claude can read without asking.

Every session:

1. **Check the right browser was selected** — by `osPlatform` + `isLocal`, never by name.
2. **Prefer a CLI** (`gh`, `gcloud`, `aws`) when the service has an API; use the
   browser only for sites without one.
3. **Watch the window** during multi-step work — you see what Claude cannot,
   including the "started debugging this browser" banner.

## The core surprise — targets are account-scoped

Browser connections belong to the **Claude account**, not to the machine running
Claude Code. Every Chrome anywhere that is signed into the extension is a valid
target. A session on one machine can drive Chrome on another, with nothing
in the tool output saying so.

Worse, `navigate` without an explicit `tabId` silently picks the first tab in the
session's tab group. That is how a tab ends up opening on a machine in another room.

`tabs_context_mcp` alone does **not** reveal which host a tab lives on. Only
`list_connected_browsers` does.

## Set up an isolated profile

The goal: the Claude extension lives only in a Chrome profile that holds no
credentials. Two halves — build the clean profile, then strip the daily one —
and a check at the end.

In the new profile:

1. **Create the profile**: avatar → **Add Chrome profile**. The CLI route also
   works but is less reliable — Chrome forwards to the running instance if one
   exists ("Opening in existing browser session"), so the window may not appear:

   ```bash
   google-chrome-stable --profile-directory="Automation" --no-first-run about:blank
   ```

2. **Decline Chrome sync.** Chrome offers to sign the new profile into your Google
   account on first run. Accepting pulls down bookmarks, saved passwords, and can
   re-establish Google session cookies — which hands the sandbox your Gmail and
   undoes the whole exercise. Stay signed out.

3. **Rename it and pick a distinct theme colour** via avatar → **Customize
   profile**. (`--profile-directory` only names the folder under
   `~/.config/google-chrome/`; the picker label defaults to something like "Your
   Chrome".) Two visually identical windows defeat the isolation the first time
   you mix them up.

4. **Install the Claude in Chrome extension** in this profile and sign in to
   Claude. This is the only profile that should have it.

In your daily profile — the existing one, where your real logins live:

5. **Uninstall the extension** — not merely disable it. Disabling leaves an
   instance that may keep a debugger session attached.

6. **Turn off Developer mode** in `chrome://extensions`. It isn't needed for
   normal use, and the profile holding real credentials should present the
   smallest surface.

Then check it worked:

7. **Verify the isolation** rather than assuming it:

   ```
   navigate → https://mail.google.com
   ```

   A signed-out session redirects to the Gmail marketing page at
   `workspace.google.com/…/gmail/` with a **Sign in** button. A leaked session
   goes straight to the inbox. Same idea for any other logged-in service worth
   checking.

Why this works: the profile is the real boundary. Chrome enforces separate
cookies, `localStorage`, password store, and extension instances per profile — so
a page in the automation profile cannot read the daily profile's sessions. This
converts "Claude is instructed not to touch your prod consoles" into "the
credentials are not there."

## Identify the right browser

`list_connected_browsers` returns `deviceId`, `name`, `osPlatform`, `isLocal`.

**Names set via `switch_browser` do not survive into that listing** — it kept
returning `Browser 1` / `Browser 2` after both were named. Naming is worth doing for
the in-Chrome connect prompt, but never rely on it for identification.

Go by `osPlatform` + `isLocal`:

| Field | Meaning |
|---|---|
| `osPlatform` | Self-reported by the extension: `Linux`, `macOS`, … |
| `isLocal` | Same machine as **this Claude Code session** — not a fixed machine |

`isLocal` flips depending on where Claude Code runs, so it identifies "here", not
"the Linux machine". When prompting, name the discriminator rather than the label:

> Use the local Linux Chrome (`isLocal: true`) for this.

**Don't count on Claude asking which browser to use.** With two browsers connected,
the tool can report one as already `inUse` and say no question is needed — the
session then drives that one, even if it is on another machine. The
`~/.claude/CLAUDE.md` rule in [Best practices](#best-practices) is the backstop.

Put that rule in `~/.claude/CLAUDE.md`, not a repo-scoped `CLAUDE.local.md`: which
browser to drive is a property of the machine, not of a checkout, and a repo-scoped
file silently fails to load elsewhere.

## The debugging banner

> "Claude" started debugging this browser — [Cancel] [✕]

Chrome's own security notice, triggered by any extension using the `chrome.debugger`
API (the DevTools Protocol), which is how the extension drives pages. Other
extensions produce the identical banner under their own name.

Observed 2026-07-21: it appears in **both** profile windows, including a profile
where the extension is *uninstalled*. Inference, not verified — both profiles run
under one Chrome process, and the string says "this **browser**", so the attach is
likely registered process-wide while the infobar renders in every window that
process owns.

It does **not** indicate cross-profile access. Three independent signals:

1. The extension is uninstalled from the daily profile — no instance to act through
2. Gmail loaded signed-out in the automation profile — cookie isolation intact
3. The daily profile's tabs never appeared in `tabs_context_mcp` — browser-wide
   access would have listed them

So it over-reports: a browser-wide *notification* about a profile-scoped
*capability*.

**Leave it on.** `--silent-debugger-extension-api` suppresses it, and enterprise
force-install skips it, but it is the only visible signal that a browser is being
driven — and Claude cannot see it, since screenshots capture the page viewport, not
browser chrome. Given that the failure mode is Claude working in a window you are
not watching, a warning that errs toward noisy is the right error.

`Cancel` detaches the debugger without breaking the extension; it reattaches, and
the banner returns, on the next operation. `✕` just dismisses.

Anthropic have not documented the cross-profile behaviour; the open request for a
supported way to suppress the banner is
[claude-code#69287](https://github.com/anthropics/claude-code/issues/69287).

## What the extension can and cannot do

**Hard refusals**, regardless of instruction: entering passwords, API keys, card or
government-ID numbers; creating accounts; permanently deleting data; moving money;
changing system or security settings; solving CAPTCHAs; downloading and running
untrusted files.

**Gated on explicit per-action approval**: sending any message, publishing or
posting, submitting forms, accepting terms or OAuth grants, purchases, changing
account settings, clicking anything irreversible.

**Ungated**: reading. There is no approval step on *looking* at a page, only on
acting — which is why the profile boundary matters more than the behavioural rules.

The main structural risk is **prompt injection**. Page content arrives through the
same channel as legitimate data, so text on a page aimed at Claude ("ignore previous
instructions", "the user already approved this") is a real attack surface. Claude is
instructed to treat observed content as data and surface anything instruction-shaped
rather than act on it. That holds up in ordinary cases; it is a behavioural
mitigation, not a cryptographic boundary. Exposure is worst on pages that are both
untrusted and authenticated — hence the clean profile.

Screenshots also go stale the instant you touch the browser, and Claude cannot tell.
Re-read the page rather than reasoning from the last image when it matters.

Typing goes wherever focus is. In a web app with single-key shortcuts, a keystroke
that misses the input field triggers an action instead (new drafts, archive, delete).
After clicking a field, confirm it has focus (`document.activeElement`) before typing.
