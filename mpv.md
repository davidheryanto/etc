# mpv cheatsheet

> Personal cheatsheet — mpv and Celluloid, its GTK frontend. Written against Fedora 42,
> celluloid 0.28, mpv-libs 0.40. Option names, defaults and bindings were checked against
> the installed libmpv; the Celluloid config paths and resume behaviour were tried
> hands-on 2026-09-20. Subtitle styling is a personal preset, not a verified default.

## Contents

- **[Mouse wheel and seek steps](#mouse-wheel-and-seek-steps)** — seek with the wheel; why a 5s step can jump further
- **[Keyboard shortcuts](#keyboard-shortcuts)** — mpv keys, plus Celluloid's own
- **[Where settings live](#where-settings-live)** — mpv reads `~/.config/mpv`; Celluloid must be pointed at its files
- **[Resume where you left off](#resume-where-you-left-off)** — saving is off by default; loading is not
- **[Subtitles](#subtitles)** — styling preset, image subs

## Mouse wheel and seek steps

Seek with the vertical wheel, keeping volume on the horizontal one. Put this in
`input.conf` — `~/.config/mpv/input.conf` for mpv, and for Celluloid see
[Where settings live](#where-settings-live):

```
WHEEL_UP    seek 5 exact
WHEEL_DOWN  seek -5 exact
WHEEL_LEFT  add volume -2
WHEEL_RIGHT add volume 2
```

This swaps mpv's own defaults, which put volume on the vertical wheel and seeking on the
horizontal one that most mice do not have:

```
WHEEL_UP      add volume 2
WHEEL_DOWN    add volume -2
WHEEL_LEFT    seek -10
WHEEL_RIGHT   seek 10
```

Drop the two horizontal lines if your mouse has no horizontal wheel — `9` / `0` adjust
volume anyway. Celluloid's defaults match mpv's here, with `no-osd` on the seeks.

**`exact` is what keeps a 5s step at 5s.** A plain `seek 5` is keyframe-limited: mpv lands
on a keyframe near the target, so the real jump follows the file's keyframe spacing — a 3s
interval on one encode, far coarser on an encode that only puts keyframes at scene cuts.
`exact` decodes from the preceding keyframe to the target frame instead: precise, at the
cost of real decoding work on long-GOP 4K/HEVC, where spinning fast then feels sticky.
`hr-seek=yes` in `mpv.conf` makes every relative seek precise, including the arrow keys.

A wheel *gesture* can still produce several steps — one notch is not guaranteed to be one
5s jump, so test over the video area.

Step sizes worth copying: **5s** for a nudge (mpv's arrow keys, YouTube ← / →), **10s** for
a coarse skip (YouTube `j` / `l`).

Inspect a file's keyframe timestamps — the gaps between them are the seek granularity:

```bash
ffprobe -v error -select_streams v:0 -skip_frame nokey \
  -show_entries frame=pts_time -of csv=p=0 -read_intervals '%+120' video.mp4
```

## Keyboard shortcuts

<https://mpv.io/manual/stable/#keyboard-control>

| Key | Action |
|---|---|
| `SPACE` | Toggle pause |
| `LEFT` / `RIGHT` | Seek 5 seconds back / forward |
| `DOWN` / `UP` | Seek 1 minute back / forward |
| `Shift` + `LEFT` / `RIGHT` | Seek exactly 1 second back / forward |
| `Shift` + `DOWN` / `UP` | Seek exactly 5 seconds back / forward |
| `9` / `0` | Volume down / up |
| `v` | Show or hide subtitles |
| `j` / `J` | Next / previous subtitle track |
| `z` / `Z` | Subtitle delay 100 ms earlier / later |
| `Ctrl` + `LEFT` / `RIGHT` | Seek to previous / next subtitle (not available for every subtitle format) |
| `f` | Fullscreen |
| `q` | Quit |
| `Shift` + `q` | Quit and remember the playback position |

Celluloid keeps mpv's playback keys and adds its own application bindings on top:

| Key | Action |
|---|---|
| `Ctrl` + `o` | Open file |
| `Ctrl` + `l` | Open location (URL) |
| `Ctrl` + `n` | New window |
| `F9` | Toggle playlist |
| `F10` | Main menu |
| `F11` | Fullscreen |
| `Ctrl` + `,` | Preferences |
| `Ctrl` + `?` | Shortcuts window |
| `Ctrl` + `q` | Quit |

## Where settings live

Two optional files you create yourself:

| File | Holds |
|---|---|
| `~/.config/mpv/mpv.conf` | Options, one per line, without the `--` prefix |
| `~/.config/mpv/input.conf` | Key and mouse bindings, `KEY command` per line |

**Celluloid does not load these automatically.** It embeds libmpv and must be pointed at
each file — Preferences → Config Files → *mpv configuration file* / *mpv input
configuration file*, or gsettings:

```bash
gsettings set io.github.celluloid-player.Celluloid mpv-config-file "file://$HOME/.config/celluloid/mpv.conf"
gsettings set io.github.celluloid-player.Celluloid mpv-config-enable true
gsettings set io.github.celluloid-player.Celluloid mpv-input-config-file "file://$HOME/.config/celluloid/input.conf"
gsettings set io.github.celluloid-player.Celluloid mpv-input-config-enable true
```

Three things to know:

- Each file needs **both** keys — the path and its enable toggle. A path alone does nothing,
  and neither command creates the file.
- The paths are free: point Celluloid at `~/.config/mpv/*` to share one set of files with mpv.
- **Your bindings win because they come last.** At startup Celluloid concatenates its own
  defaults and your `input.conf` into one temp file and hands that to mpv, which keeps the
  last binding for a duplicated key.

Edits to the files are picked up on the next start; changing Preferences reloads mpv in
place. When an override seems ignored, read the merged file Celluloid actually handed to
mpv — stale ones from earlier runs linger in `/tmp`, so check the newest:

```bash
ls -t /tmp/.celluloid-* | head -1 | xargs grep -n WHEEL
```

If a setting still looks stale after closing the window, Celluloid may still be running as
a background service — `pgrep -a celluloid`, then `pkill -x celluloid`.

## Resume where you left off

mpv *loads* a saved position by default (`resume-playback=yes`) but only *saves* one on
`Shift` + `q`. To save on every ordinary quit, in `mpv.conf`:

```ini
save-position-on-quit=yes
```

- One small file per video under `watch_later/` — `~/.config/celluloid/watch_later/` for
  Celluloid, `~/.local/state/mpv/watch_later/` for mpv.
- The name is a hash of the file's **path**, so moving or renaming the video loses its
  position. `ignore-path-in-watch-later-config=yes` hashes the *filename* instead — a moved
  file then resumes, a renamed one still does not, and same-named files share an entry.
- mpv deletes an entry as soon as it resumes from it and writes a fresh one on quit, so a
  video watched to the end normally leaves nothing behind.
- Saved on a clean quit — window close, `q`, `Ctrl` + `q`, all of which Celluloid shuts
  down properly. A crash or `kill -9` cannot save, but leaves any earlier entry intact.
- `watch-later-options=` narrows what gets stored; the default list is long and already
  covers position and track selection.

## Subtitles

<https://mpv.io/manual/stable/#subtitles>

A styling preset for plain-text subtitles, in `mpv.conf`. It does not override ASS
subtitles that carry their own styling, and cannot restyle bitmap subtitles. Install the
font first — mpv silently falls back otherwise (`fc-match 'Netflix Sans Medium'` shows what
you would actually get):

```ini
sub-font='Netflix Sans Medium'
sub-color='#e8e8e8'
sub-bold=no
sub-font-size=42
sub-blur=0.6
sub-border-size=1
sub-border-color='#212121'
sub-shadow-color='#000000'
sub-shadow-offset=1
sub-spacing=1
```

For bitmap (image) subtitles whose position or size is wrong, override their canvas
resolution with the video's:

```ini
image-subs-video-resolution=yes
```

To push text subtitles down into the black bars, use `sub-use-margins=yes` (and
`sub-ass-force-margins=yes` to apply it to ASS subtitles too).

Add a subtitle track to an `.mkv` without re-encoding → [linux.md](linux.md#images-and-video).
