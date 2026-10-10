# Voice dictation on Linux (Wispr Flow substitute)

Goal: Wispr Flow's feel on Linux — hold one key, speak, release, and clean text (fillers
and self-corrections removed, proper punctuation) is typed into whatever app has focus.

Setup tested on Fedora 42, GNOME 48 on **Wayland**, Keychron Q3 Max Knob, Razer Seiren
Mini (Oct 2026).

## Options compared

- **Wispr Flow** — no Linux build (Mac, Windows, iOS, Android only).
- **Claude Code `/voice`** — hold Space inside Claude Code only, not system-wide. Raw
  transcript: keeps "um, you know" and repeated words. Fine for prompts, nothing else.
- **Vibe Typer** — what we use. Paid cloud app ($8–10/mo, free plan 2,000 words/month),
  AppImage, supports Wayland, built-in AI cleanup ("Magic Formatter"). Closed source;
  audio goes to their servers.
- **OpenWhispr** — open source, local Whisper/Parakeet or cloud models, bring-your-own-key
  LLM cleanup. More setup, but you choose the cleanup model and prompt. Untried; the next
  thing to try if Vibe Typer's punctuation isn't good enough.
- **Handy** — open source, well liked, raw transcript only (no AI cleanup).
- **Whistle** (Cactus, 16.9 MB on-device model) — model, not an app; accuracy around
  Whisper base. Not worth it on a desktop with a GPU.

Speech-to-text models (Open ASR Leaderboard, Sep 2026): IBM Granite Speech 4.1 2B (~5.3%
WER), Cohere Transcribe, Canary-Qwen 2.5B, Qwen3-ASR 1.7B lead. Parakeet is the speed
pick (~7.1%), Whisper large-v3 is now behind (~7.4%).

## Vibe Typer: fresh setup

1. Download `VibeTyper.AppImage` from vibetyper.com, then:

   ```bash
   mkdir -p ~/Applications && mv ~/Downloads/VibeTyper.AppImage ~/Applications/
   chmod +x ~/Applications/VibeTyper.AppImage
   ~/Applications/VibeTyper.AppImage
   ```

   Needs `fuse-libs` (installed on Fedora by default).

2. **Decline its "Wayland setup required → Configure now" prompt.** It runs pkexec and
   writes a rule making every input device and `/dev/uinput` mode `0666` (any account can
   keylog and inject keys). Do the permissions yourself instead:

   ```bash
   sudo usermod -aG input $USER
   printf '%s\n' \
     'KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"' \
     'KERNEL=="event*", SUBSYSTEM=="input", GROUP="input", MODE="0640"' \
     | sudo tee /etc/udev/rules.d/99-vibetyper-uinput.rules
   sudo udevadm control --reload-rules && sudo udevadm trigger
   ```

   - The app reads `/dev/input/event*` (hold-to-talk hotkey) and writes `/dev/uinput`
     (types the text). Its code opens event devices `O_RDONLY`, so `0640` is enough.
   - Being in `input` lets **any program running as you** read every keystroke. Accepted
     trade-off on a single-user desktop.
   - **Reboot**, don't just log out. On GNOME the systemd user manager can survive a logout
     (another session keeps it alive), and apps started from it keep the old groups.
     Check with `grep Groups /proc/$(pgrep -x vibe-typer.bin)/status` — must include the
     `input` gid (`getent group input`).

   Until the group is active you get **"Text insertion failed"**
   (`Failed to open /dev/uinput. Access denied` in the log) while hotkey and transcription
   still work.

3. **Hotkey** — see the next section. End state: Right Ctrl on the keyboard sends F18, and
   `~/.config/vibe-typer/config.json` has:

   ```json
   "hotkey": "F18",
   "toggleRecordingHotkey": false
   ```

   (`false` = hold to talk.) Quit the app before editing the config:
   `pkill -x vibe-typer.bin` — **not** `pkill -f vibe-typer.bin`, which matches the shell
   running the command and kills it.

4. **Taskbar icon.** The AppImage doesn't register itself, so GNOME shows a generic icon.
   Install the bundled icons and a launcher that matches the window class:

   ```bash
   ~/Applications/VibeTyper.AppImage --appimage-extract 'usr/share/icons/*'   # into ./squashfs-root
   cp -r squashfs-root/usr/share/icons/hicolor ~/.local/share/icons/ && rm -rf squashfs-root
   # Unquoted EOF so $HOME expands now: .desktop files don't expand ~ or $HOME themselves
   cat > ~/.local/share/applications/vibe-typer.desktop <<EOF
   [Desktop Entry]
   Name=Vibe Typer
   Comment=AI voice typing
   Exec="$HOME/Applications/VibeTyper.AppImage" %U
   Terminal=false
   Type=Application
   Icon=vibe-typer
   StartupWMClass=Vibe Typer
   Categories=AudioVideo;Utility;
   EOF
   ```

5. **Settings** (in the app):
   - **Silent mode** on ("While recording" section) — hides the Magic Formatter diff popup
     after every take. Config: `realtimeTranscription.magicFormatterSilent: true`.
   - **Tone preset: formal.** Casual drops the final period on one-sentence takes and adds
     contractions; very casual also removes commas and lowercases. Formal leaves the text
     alone (it does *not* make wording stiff).
   - **Magic Formatter custom instructions** (`magicFormatterCustomInstructions`): currently
     "Use British spelling. Never use em dashes." This is the knob for more aggressive
     filler removal or punctuation rules.
   - **Pause sensitivity** is background-noise handling ("Silence only" … "Noisy room"),
     not punctuation. Leave at 3 ("Normal room").
   - Launch at startup writes `~/.config/autostart/vibe-typer.desktop`.

## Hotkey: why F18 on the Right Ctrl key

- Wispr's "hold Fn" can't be copied: on PC keyboards Fn is handled inside the keyboard and
  Linux never sees it.
- Default is Ctrl+Space **toggle** — clashes with VS Code/JetBrains autocomplete, and the
  app reads raw evdev so it doesn't swallow the key.
- **Side-specific modifiers don't work on Wayland.** The app's Wayland handler treats Ctrl
  as `KEY_LEFTCTRL || KEY_RIGHTCTRL` (same for Alt/Shift/Super). Setting `"RightControl"`
  in the config still fires on Left Ctrl. The settings UI also records just "Ctrl".
- Fix: remap the physical Right Ctrl to an unused F-key in the keyboard firmware, and use
  that F-key as the hotkey. Right Ctrl is lost as a Ctrl key; Left Ctrl covers shortcuts.

Which F-key — what xkb (`/usr/share/X11/xkb/symbols/inet`) and GNOME do with them:

| Key | Keysym | GNOME default |
|---|---|---|
| F13 | XF86Tools | **Opens Settings** (`control-center-static`), on whatever panel was last open |
| **F14–F18** | XF86Launch5–9 | unbound ✓ |
| F19, F24 | — | unbound ✓ |
| F20 | XF86AudioMicMute | **mutes the mic** — worst choice for dictation |
| F21–F23 | Touchpad toggle/on/off | bound |

F13 was tried first; unbinding `control-center-static` works but `gsd-media-keys` only
rereads it on restart, and the unit refuses `systemctl --user restart`. F18 needs no GNOME
changes.

### Keychron remap (Q3 Max Knob)

Chrome's WebHID needs the hidraw nodes, which are root-only by default:

```bash
echo 'KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3434", MODE="0660", TAG+="uaccess"' \
  | sudo tee /etc/udev/rules.d/60-keychron-hidraw.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

`uaccess` gives the logged-in seat user access, Keychron (vendor `3434`) only; the file
must sort before `73-seat-late.rules`.

Then in Chrome, launcher.keychron.com → Connect → Q3 Max → Keymap → **Layer 2** (base
layer with the switch on Win/Linux; Layer 0 is Mac mode) → click Right Ctrl → search
`F18` → click it. Written to the keyboard immediately; undo the same way.

## What the app does without asking

- Installs and enables a GNOME Shell extension
  `~/.local/share/gnome-shell/extensions/vibe-typer-focus@vibetyper.com`. It exports the
  focused window's app id, title and pid on the session bus (any session client can query
  it) so the app can pick per-app paste behaviour. Harmless, works after re-login.
- The pkexec `0666` rule (step 2) — declined.
- Mutes system audio while recording (`muteSystemAudioDuringRecording`, via `pactl`).

## Quality: Vibe Typer vs Wispr Flow

Same realistic message dictated into both (one take, with fillers and a self-correction):

| | Vibe Typer | Wispr Flow (Mac) |
|---|---|---|
| bugs | "bucks" (2 of 2 tries) | ✓ |
| accept / except in one sentence | ✓ | ✓ |
| "Tuesday, no wait, Thursday" | ✓ | ✓ |
| Fillers ("um", "so") | "um" removed, "so" kept | both removed |
| Question mark | placed at a pause ("3 pm? To go through it") | ✓ |
| Sentence breaks / commas | run-ons | ✓ |
| Email layout (greeting, paragraphs, sign-off) | one block | ✓ |
| Faithfulness | kept "can't" | changed to "cannot" |

Takeaways:

- Vibe Typer gets **words** mostly right; **punctuation** is the gap — it breaks sentences
  where you pause, not by grammar. Wispr's output is send-ready, Vibe Typer's needs edits.
- The gap is in the **AI cleanup**, not the mic. A setup where you pick the cleanup model
  and prompt (OpenWhispr + Claude) is the way to close it.
- **Context helps.** Short unrelated test sentences are a harsh test: "accept/except" failed
  alone but passed inside a real message. Test with real messages in real apps.
- **Mic placement matters.** With the mic closer (10–20 cm, aimed at the mouth),
  "team's"→"theme's" and "over budget"→"of our budget" went away. Aim the part of the mic
  you're meant to speak into: an *end-address* mic (most small USB mics) picks up from its
  top end, a *side-address* mic (e.g. Blue Yeti) from its side. The Seiren Mini looks
  end-address (speak into the top), not checked against Razer's docs. Keep input volume ~70–85%, not 100%. If the mic can't be in front of the
  keyboard: arm from the side/above, or a clip-on USB-C lavalier. Don't use Bluetooth
  headphone mics (XM6): HFP call mode drops LDAC and records at phone quality.
- Names (Verstappen → "FirstEppen") need the **Dictionary** tab. Consistent mishears
  like "bugs" → "bucks" are also dictionary candidates.

### Test script

Dictate in one take, ideally into a real app:

> Hey Sam, um, quick update on the release. So we fixed fifteen of the bugs this week, not
> fifty, the rest are minor. The budget is about fifteen percent over, mainly because of
> the extra contractor. I'd like to accept their proposal, except for the weekend support
> part, we can't cover that. Can we meet on Tuesday, no wait, Thursday at 3pm to go through
> it? Let me know if that works. Thanks!

Check: bugs (not bucks), accept/except, their, 15/50, "15% over", only Thursday left,
fillers gone, "?" at the end of the question, sentence breaks.

## Troubleshooting

```bash
tail -f ~/.config/vibe-typer/diagnostics.log                      # everything below shows here
grep -E "Registered press-hold|Global hotkey registered" ~/.config/vibe-typer/diagnostics.log | tail -2
# good: "Registered press-hold: F18 (keys: [188])" — a modifier shows "keys: [], modifiers: [ctrl]"
grep -E "Required setup missing|UInput" ~/.config/vibe-typer/diagnostics.log | tail -3
ls -l /dev/uinput /dev/input/event*                               # root:input 0660 / 0640
journalctl --user --since "-10 min" | grep "launched by gsd-media-keys"   # a key opening apps
```

## Uninstall

```bash
pkill -x vibe-typer.bin
rm ~/Applications/VibeTyper.AppImage ~/.local/share/applications/vibe-typer.desktop \
   ~/.config/autostart/vibe-typer.desktop
rm -r ~/.config/vibe-typer ~/.local/share/gnome-shell/extensions/vibe-typer-focus@vibetyper.com
find ~/.local/share/icons/hicolor -name vibe-typer.png -delete
sudo rm /etc/udev/rules.d/99-vibetyper-uinput.rules        # keep if another tool needs uinput
sudo gpasswd -d $USER input                                # same
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Keyboard: set Right Ctrl back to Right Ctrl on Layer 2 in Keychron Launcher. The
`60-keychron-hidraw.rules` rule can stay (needed for any future remap).
