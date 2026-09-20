# Video encoding cheatsheet

Shrinking recordings without wrecking them: NVENC settings worth trying, how to prove a setting
helped, and the gotchas that waste an afternoon. For general ffmpeg filter/audio snippets see
`ffmpeg.txt`; for driver and power settings see `nvidia.md`.

Everything below is one worked experiment, not received wisdom — see **Measured on** for exactly
what was tested. Re-measure before trusting any of it on different content or hardware.

## Contents

- **Measured on**

- **Downloading**
    - yt-dlp on pages with no dedicated extractor

- **Compressing a talk / webinar / screen recording**
    - The recipe
    - GOP and B-frames: the biggest win here
    - Audio is the cheapest win
    - Container flags worth keeping

- **Choosing an encoder**
    - NVENC vs x265
    - What did not pay off

- **Proving a setting helped**
    - Benchmark on clips, not the whole file
    - Compare at matched quality, never matched CQ
    - VMAF and what it does not measure

- **Gotchas**
    - `GPU-Util` does not show NVENC
    - Encoder help shows option defaults, not effective settings
    - CQ is not CRF

## Measured on

One recording, one machine. Every number in this file comes from here.

- **Source**: a 48-minute recorded webinar — mostly static presentation slides beside a small
  camera feed of two speakers. H.264 High, 1920x1080, 24 fps, video 1.42 Mbps, AAC-LC 48 kHz
  stereo 317 kbps, duration 2893.72 s, 631,355,650 bytes (602 MiB). Already lossy, so VMAF below
  measures *additional* damage on top of whatever the source lost.
- **Machine**: RTX 5090 (Blackwell, 9th-gen NVENC), driver 570.172.08, CUDA 12.8, 20 logical CPU
  cores, ffmpeg/ffprobe 7.1.1, Fedora, Linux 6.15.4.
- **Clips**: two 60-second windows cut from the source — offset 900 s ("slide clip", low motion)
  and offset 2400 s ("motion clip"). Clip sizes are quoted in bytes and are video-only unless the
  text says otherwise. VMAF is `libvmaf` defaults (default model, no options).

Sizes: MiB means 1024-based, MB means 1000-based. `ls -lh` prints MiB with an `M` suffix, which
is an easy way to end up comparing the two by accident.

## Downloading

### yt-dlp on pages with no dedicated extractor

Try the plain page URL first even when the site has no yt-dlp extractor. The generic extractor
reads the page's JSON-LD block and pulls `contentUrl` out of it, which on some webinar and event
platforms is the real file:

```bash
yt-dlp --get-url "<the page URL you would open in a browser>"   # what would it download?
yt-dlp -o "%(title)s.%(ext)s" "<same URL>"
```

`--get-url` prints the resolved URL; `-v` shows the extractor's reasoning if it picks something
unexpected. If it resolves to a direct `.mp4` on a CDN, there may be no HLS to reassemble — but
check, because a `.mp4` URL can still need signed query parameters, cookies or a `Referer`.

Verified on Goldcast on-demand pages (`*.goldcast.io/on-demand/<uuid>`), which served an
unauthenticated progressive MP4 from `staticassets.*`. That is one platform, not a rule: JSON-LD
on the page guarantees neither a usable URL nor open access. A registration wall makes it less
likely to work, not categorically impossible.

Note yt-dlp substitutes a fullwidth colon `：` (U+FF1A) for `:` in `%(title)s`, because a real
colon is illegal in filenames on some systems. Harmless, awkward to type, worth renaming.

## Compressing a talk / webinar / screen recording

This content class compresses well: mostly static slides, a small camera feed, little real
motion. This particular source spent 1.42 Mbps on that, which left a lot of slack.

### The recipe

```bash
ffmpeg -hwaccel cuda -hwaccel_output_format cuda -i INPUT.mp4 \
  -c:v hevc_nvenc -preset p7 -tune hq -rc vbr -cq 31 -b:v 0 \
  -g 480 -bf 4 -b_ref_mode middle \
  -c:a aac -b:a 96k \
  -movflags +faststart -tag:v hvc1 \
  OUTPUT.mp4
```

Result: 631,355,650 -> 141,459,018 bytes (602 -> 135 MiB, 4.5x), about 6 minutes of wall time
(~7.6x realtime). No resizing and no frame-rate conversion, so nothing is lost to scaling — but
that is not a guarantee about text, so inspect small text at 1:1 (see below).

`-cq` is the quality dial: lower is bigger and better. On this source, cq 31 gave 141,459,018
bytes and cq 30 gave 171,265,519 bytes (135 vs 163 MiB) — a 21% jump for one step. The steps are
not even; measure rather than extrapolate.

### GOP and B-frames: the biggest win here

**`-g 480 -bf 4 -b_ref_mode middle`**, at unchanged CQ, against the same command without them:

| Clip | Default | With the three options | Delta | VMAF |
| --- | --- | --- | --- | --- |
| Slide (offset 900) | 723,925 B | 581,525 B | **-19.7%** | 96.00 -> 95.90 |
| Motion (offset 2400) | 2,774,747 B | 2,590,792 B | **-6.6%** | 90.09 -> 90.06 |

That is a useful combination on this recording, and it beat every "quality feature" knob tried
below. Caveats worth keeping straight:

- The three options were tested **together**, so this does not establish which one did the work.
  Most of it is probably `-g 480`: inter-frame prediction already references static content
  without B-reference frames, but a long GOP cuts how often a full intra frame is spent. If you
  need to know, test them one at a time.
- `-g 480` is 20 s at 24 fps. No measurable encoding-speed penalty in these tests, but random
  access gets slower — a player seeks by decoding forward from the previous random-access point.
  Fine for archival and linear viewing; annoying if the file is scrubbed heavily, and wrong for
  adaptive streaming.
- ffmpeg's `g` and `bf` defaults defer to the driver preset, so "the default" is not a fixed
  number. Compare against your actual baseline command, not against the help text.

### Audio is the cheapest win

Conference recordings often spend a lot on audio. This source spent 317 kbps on stereo speech:
114.80 MB of a 631 MB file. Re-encoding to 96 kbps brings that to 34.72 MB — **an 80 MB saving
before touching a single video setting.**

96 kbps AAC is widely considered adequate for speech; that was not confirmed here by a listening
test, and VMAF says nothing about audio. Check by ear if it matters.

`-ac 1 -b:a 64k` would save a further ~11.6 MB. Listen first for both speakers surviving the
downmix and for anything genuinely stereo. `-ac 2` is redundant when the source is already
stereo.

### Container flags worth keeping

- `-tag:v hvc1` — improves HEVC playback compatibility with Apple software (QuickTime, Safari),
  which often refuses the default `hev1` tag.
- `-movflags +faststart` — moves `moov` to the front for progressive playback. Range-capable
  clients can fetch trailing metadata without it, so this matters most for dumb progressive
  downloads.

Neither supplies a missing HEVC decoder. For recipients who cannot play HEVC at all, make a
separate H.264 copy from the original.

## Choosing an encoder

### NVENC vs x265

Slide clip, 60 s, **audio included** in both:

| Encoder | Time | Size | VMAF |
| --- | --- | --- | --- |
| `libx265 -preset slow -crf 28` | 41.3 s | 1,580,685 B | 96.18 |
| `hevc_nvenc -preset p7 -tune hq -cq 32` | 8.7 s | 1,466,777 B | 96.00 |

On this clip and this machine, NVENC produced a slightly smaller file at approximately matched
VMAF in about one-fifth the time. Two sampled operating points are not a rate-distortion curve,
so read this as "NVENC was competitive here", not "NVENC beats x265".

Older NVENC generations have a considerably worse reputation for quality per bit, and x265 may
well be the better choice when size matters more than time — but nothing here measures that.
Re-test on the hardware in front of you.

### What did not pay off

- **AV1 (`av1_nvenc`)**: motion clip, 60 s, video-only. `av1_nvenc -cq 32 -temporal-aq 1
  -rc-lookahead 32` gave 9,299,375 B at VMAF 94.57; `hevc_nvenc -cq 26` gave 9,255,697 B at
  94.09. Near-identical size, marginally higher VMAF, plus a playback-compatibility cost — not
  enough to switch here. Different CQ values because the scales are not comparable across codecs.
- **`-tune uhq -temporal-aq 1 -rc-lookahead 32`**: on the motion clip, ~14% smaller at matched
  VMAF (uhq cq 38 = 2,380,383 B at 89.97 vs baseline cq 32 = 2,774,747 B at 90.09). On the slide
  clip the same combination did not improve matched-quality size, and it doubled encode time
  (16.1 s vs 8.7 s for 60 s). Worth it for camera footage; not for this recording, which is
  mostly slides. Again a three-option bundle, so no single option is implicated — NVIDIA
  documents temporal AQ as helping low-motion regions with high spatial detail, which is
  precisely the case it failed to help here, so test it alone before dismissing it.

The tested ffmpeg 7.1.1 build rejects `-tune uhq` on `av1_nvenc` (its tune range is 1-4, HEVC's
is 1-5). Newer SDK/ffmpeg versions extend UHQ to AV1; check `ffmpeg -h encoder=av1_nvenc` rather
than assuming either way.

## Proving a setting helped

### Benchmark on clips, not the whole file

`-ss <offset> -t 60` on the source, encode the variants, compare. A full 48-minute encode per
variant makes experimenting impossible; 60 seconds makes it a few seconds each.

Pick **two** clips: an easy stretch and a hard one. A single easy clip flatters every setting and
misleads about the final size — an estimate taken from one static 60-second window underpredicted
the real encode here by roughly 40%.

### Compare at matched quality, never matched CQ

Turning on a "quality feature" at unchanged CQ usually just spends more bits, which looks like an
improvement and is not. To tell whether a setting is genuinely more efficient, sweep CQ on both
configurations and compare size at equal VMAF:

```bash
for cq in 28 30 32 34 36; do
  ffmpeg -v error -y -ss 900 -t 60 -i IN.mp4 \
    -c:v hevc_nvenc -preset p7 -tune hq -rc vbr -cq $cq -b:v 0 -an baseline_$cq.mp4
  ffmpeg -v error -y -ss 900 -t 60 -i IN.mp4 \
    -c:v hevc_nvenc -preset p7 -tune hq -rc vbr -cq $cq -b:v 0 -an \
    -g 480 -bf 4 -b_ref_mode middle candidate_$cq.mp4
done
```

Distinct output names matter: `-y` means a second config silently overwrites the first. Hold
everything except the tested change identical, and keep audio out (`-an`) or identical in both,
or you are comparing audio too.

Then read off which config is smaller at the VMAF you care about. Several settings that looked
like big wins at fixed CQ turned out to be pure bitrate increases.

### VMAF and what it does not measure

```bash
ffmpeg -nostats -v info -ss 300 -t 30 -i ENCODED.mp4 -ss 300 -t 30 -i ORIGINAL.mp4 \
  -lavfi "libvmaf=n_threads=16" -f null - 2>&1 | grep -o 'VMAF score: [0-9.]*'
```

First input is the distorted one, second is the reference; the build needs `libvmaf` compiled in.
The matching `-ss` above only works because both files are full-length. **For a clip encoded from
source offset 900, compare encoded time 0 against original time 900**, and normalise timestamps
so the frames actually line up:

```bash
ffmpeg -nostats -v info -i CLIP.mp4 -ss 900 -t 60 -i ORIGINAL.mp4 \
  -lavfi "[0:v]settb=AVTB,setpts=PTS-STARTPTS[d];[1:v]settb=AVTB,setpts=PTS-STARTPTS[r];[d][r]libvmaf=n_threads=16" \
  -f null - 2>&1 | grep -o 'VMAF score: [0-9.]*'
```

As a screening threshold in this experiment, >=95 was hard to fault and ~90 was visibly softer on
close inspection. Those are not guarantees — the default model assumes particular viewing
conditions, and an average over 30 seconds hides a bad half-second. Three caveats:

- **Sampling.** Three 30-second windows over a 48-minute file is ~3% coverage. Sample the hard
  parts deliberately, not just the middle.
- **The reference is usually already lossy**, so the score measures added damage, not absolute
  quality.
- **It is not a text-legibility test.** A full-frame average hides damage in a small region,
  which is exactly where slide text lives. For screen content, crop-compare at 1:1 and look:

```bash
ffmpeg -v error -y -ss 930 -i ORIGINAL.mp4 -vf "crop=900:340:960:420" -frames:v 1 a.png
ffmpeg -v error -y -ss 930 -i ENCODED.mp4  -vf "crop=900:340:960:420" -frames:v 1 b.png
ffmpeg -v error -y -i a.png -i b.png -filter_complex vstack compare.png
```

Finally, verify the output actually decodes end to end — stream identification is not enough:

```bash
ffmpeg -v error -i OUTPUT.mp4 -map 0:v:0 -map 0:a:0 -f null -
```

## Gotchas

### `GPU-Util` does not show NVENC

`nvidia-smi`'s `GPU-Util` column reports SM (shader) activity. NVENC is a separate fixed-function
block on the die and does not appear there — 3% during a busy encode is expected and does not
mean acceleration failed. Read the encoder block instead:

```bash
nvidia-smi --query-gpu=utilization.encoder --format=csv -l 1
nvidia-smi dmon -s u      # the "enc" column
```

If encoding still feels slow, the source decode may be the bottleneck. Don't guess — time the
same encode with and without `-hwaccel cuda -hwaccel_output_format cuda` and compare. Keeping
frames on the GPU rules out *software* filters; CUDA-aware ones like `scale_cuda` still work, and
`hwdownload` bridges to the rest at a cost.

### Encoder help shows option defaults, not effective settings

`ffmpeg -hide_banner -h encoder=hevc_nvenc` lists `-temporal-aq`, `-spatial-aq`, `-rc-lookahead`,
`-multipass` and their defaults — but ffmpeg may defer some of these to the driver preset rather
than sending the printed default, so "default false" does not prove the feature is off under
`-preset p7`. What is measurable: setting them explicitly changed output size materially here, so
whatever the preset was doing, it was not the same thing.

Treat the help output as the list of knobs that exist, then measure. `-tune uhq` exists on newer
builds and is not implied by `p7`; availability depends on the ffmpeg build, the driver and the
GPU.

### CQ is not CRF

`-rc vbr -cq N -b:v 0` is quality-targeted rate control; `-b:v 0` means "no average bitrate
target", not "zero bits". NVENC's CQ scale is **not** numerically interchangeable with x265's CRF
— `-cq 32` and `-crf 32` are different pictures — nor comparable between `hevc_nvenc` and
`av1_nvenc`. It guarantees neither a file size nor a perceptual quality level, so always measure.
