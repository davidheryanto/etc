# Claude Code driving an Android phone (adb + scrcpy)

> Tested Oct 2026: Fedora 42, scrcpy 5.0.1 (bundled adb 37.0.1), Pixel 6a on Android 17,
> USB cable. Same idea as [Claude in Chrome](browser.md), but for the phone: Claude acts
> through `adb` from its Bash tool, you watch through `scrcpy`.

## How it works

- **Claude needs only `adb`.** No extra app on the phone, no MCP server. It screenshots,
  reads the screenshot as an image, decides, then taps/swipes/types with `adb shell input`.
- **`scrcpy` is for you**, a live window of the phone on the monitor. You see every action
  as it happens and can grab the mouse to take over. Claude does not need it running.
- Both share the one adb server, so they run side by side without conflict.

## Install scrcpy (Fedora)

The `zeno/scrcpy` COPR stopped building for Fedora 42 (it has 43+ only), so `dnf` stays on
3.3.x. Use the official static release instead. It bundles its own `adb`:

```bash
v=5.0.1   # latest: https://github.com/Genymobile/scrcpy/releases
cd /tmp && curl -LO https://github.com/Genymobile/scrcpy/releases/download/v$v/scrcpy-linux-x86_64-v$v.tar.gz
tar xf scrcpy-linux-x86_64-v$v.tar.gz
rm -rf ~/.local/share/scrcpy && mv scrcpy-linux-x86_64-v$v ~/.local/share/scrcpy
ln -sf ~/.local/share/scrcpy/scrcpy ~/.local/bin/scrcpy
ln -sf ~/.local/share/scrcpy/adb    ~/.local/bin/adb
scrcpy --version
```

- **Keep the folder whole.** `scrcpy` looks for `scrcpy-server` (and its `adb`) next to
  itself. Moving only the binary into `~/.local/bin` breaks it. Symlink instead.
- **One adb only.** Two different adb versions on `PATH` keep killing each other's server
  ("adb server version doesn't match"). I removed the `android-tools` RPM and use the
  bundled adb for everything.
- scrcpy 5 decodes video in hardware (`--hwdec=auto`: VA-API on Linux, VideoToolbox on
  macOS, D3D11VA on Windows; about 10× less CPU). Without a working driver it silently falls
  back to software.
- **Fedora + Intel GPU:** Fedora's `libva-intel-media-driver` has the patented codecs removed,
  so the log shows `No support for codec h264 profile 100` then `switching to software interop`.
  Fix: `sudo dnf install intel-media-driver` (RPM Fusion nonfree; installs beside it in
  `dri-nonfree/`, which libva tries first). Working log ends with `Texture (VA-API)`.

Other OS (untested, from the scrcpy README): macOS `brew install scrcpy` plus
`brew install --cask android-platform-tools` for adb; Windows `winget install --exact Genymobile.scrcpy`
or the `scrcpy-win64` zip (bundles adb).

## Phone setup (once)

1. Settings → About phone → tap **Build number** 7× → Developer options → **USB debugging**.
2. Plug in, unlock, accept **Allow USB debugging?**, tick **Always allow**.
3. `adb devices` must say `device`. `unauthorized` means the prompt wasn't accepted:
   unlock the phone, replug.

## Watching: `phone` command

Run `phone` to open the window. It is a script holding the defaults, so you and Claude can
both start it (Claude's Bash tool doesn't load `~/.bashrc` aliases reliably). Extra flags are
added on top: `phone --always-on-top`, `phone -s <serial>`. For other defaults, run `scrcpy`.

`~/.local/bin/phone` (Linux, macOS):

```bash
#!/usr/bin/env bash
# Mirror the Android phone; see etc/claude-code/android.md.
exec scrcpy --stay-awake --show-touches --no-audio --window-title Phone --window-height=1000 "$@"
```

`chmod +x ~/.local/bin/phone`. On macOS, put `~/.local/bin` on PATH first
(`export PATH="$HOME/.local/bin:$PATH"` in `~/.zshrc`).

Windows (untested): Claude Code runs Git Bash, so save the same script as `~/bin/phone`
(Git Bash puts `~/bin` on PATH). For PowerShell, add to `$PROFILE`:

```powershell
function phone { scrcpy --stay-awake --show-touches --no-audio --window-title Phone --window-height=1000 @args }
```

| Flag | Why |
|---|---|
| `--stay-awake` | Phone won't sleep and lock mid-task (USB only). |
| `--show-touches` | Draws a dot on physical touches. scrcpy's help says not on its own clicks; untested for Claude's adb taps. Reset on exit. |
| `--no-audio` | Keep sound on the phone. Default forwards it to the PC. |
| `--window-height=1000` | Default window is too tall for a monitor. Only scales the window, not stream quality. |

Optional: `--always-on-top`; `-S`/`--turn-screen-off` (untested whether adb screenshots
still work with it). Shortcuts in the window: right-click = Back, F11 fullscreen,
Ctrl+Q quit, Alt+F resize to fit (pixel-perfect).

Claude starts it as a background command (`run_in_background`), so the window stays open
while it keeps running adb.

## Claude's toolkit

```bash
adb exec-out screencap -p > shot.png            # screenshot, then Read the PNG
adb shell uiautomator dump /sdcard/ui.xml && adb exec-out cat /sdcard/ui.xml   # UI tree: text + bounds
adb shell input tap X Y
adb shell input swipe X1 Y1 X2 Y2 250           # last arg = ms; next short/page = swipe up
adb shell input text 'hello%sworld'             # %s = space
adb shell input keyevent BACK|HOME|ENTER
adb shell pm list packages | grep -i <hint>     # find an app's package
adb shell monkey -p <package> -c android.intent.category.LAUNCHER 1   # launch it
adb shell wm size                               # physical resolution
```

## Best practices (learned the hard way)

1. **Fresh screenshot before every tap.** Layouts move between screens. In a short-video
   feed the buttons sit at a different height on each video. A tap computed from the
   previous screenshot hit "My List" instead of "Audio" and opened a sign-in dialog.
2. **Map coordinates.** Claude Code shows screenshots downscaled (1080×2400 shown as
   900×2000, ×1.2). The scale note comes with each image. Multiply before tapping.
   For exact targets, take the centre of the element's `bounds="[x1,y1][x2,y2]"` from
   `uiautomator dump`. Those are already in device pixels.
3. **Verify by text, not by eye.** After a toggle, grep the dump for the expected label
   (e.g. `text="Muted"`). This is cheaper and more reliable than another screenshot.
4. **Package names aren't app names.** `pm list packages | grep mewatch` finds nothing;
   the app is `sg.mediacorp.android`. Grep for the company, or list the launcher's
   labels via `uiautomator dump` on the home screen.
5. **Wait after actions.** About 1 s after a tap, 3–5 s after launching an app or swiping
   in a video feed, before screenshotting.
6. **Leave the phone as found.** Undo test toggles, dismiss dialogs, press Home.
7. **Ask before anything irreversible**: sending messages, payments, deleting, changing
   settings, signing in. Navigating and reading are fine without asking.
8. **Secure screens show black.** Banking, DRM video and password fields set
   `FLAG_SECURE`, so screenshots of them are blank. Claude can't see those; you drive them.

Rule for `~/.claude/CLAUDE.md` (or memory) so future sessions follow it:

```markdown
## android-phone

- Drive the phone with adb from Bash; the user watches via scrcpy.
- Screenshot (or uiautomator dump) before every tap; never reuse coordinates from an older screen.
- Confirm before sending, paying, deleting, signing in or changing settings.
```

## Alternatives (not tried)

- **mobile-mcp** (`mobile-next/mobile-mcp`): an MCP server wrapping the same adb actions
  as named tools, the claude-in-chrome equivalent. Worth it if raw adb feels clunky.
- **Browser view** instead of a scrcpy window:
  - **Tango / ya-webadb** (`app.tangoapp.dev`): runs scrcpy over WebUSB in Chrome.
    Run `adb kill-server` first, since only one program can hold the USB device.
  - **ws-scrcpy** (`NetrisTV/ws-scrcpy`): a self-hosted Node server that serves a page
    other machines on the LAN can open.
