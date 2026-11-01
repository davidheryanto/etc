# NVIDIA cheatsheet

Version compatibility, tweaks, and fixes for NVIDIA GPUs on Linux. For the Fedora install procedure see `fedora.md` → "NVIDIA driver and CUDA".

## Contents

- **CUDA setup for PyTorch: the driver is all you install**
    - Which driver to install
    - Install torch
    - Pinning a different CUDA wheel
    - What actually bites

- **Power management**
    - Set the power limit (cap watts)
    - Persistence mode (also fixes 100% CPU on ECC GPUs)

- **Suspend and resume**
    - Reload `nvidia_uvm` after wake (CUDA "device unavailable" fallback)

- **Fan control (X11 only)**
    - Enable fan speed control (`cool-bits`)
    - Auto-apply a fan curve via user systemd

- **Driver maintenance**
    - Patch a `.run` installer

- **Xid 79: the GPU fell off the bus**
    - Catch it automatically (capture on the Xid, block suspend)

- **Docker GPU smoke test**

## CUDA setup for PyTorch: the driver is all you install

Driver 580 or newer, then `pip install torch`. That is the whole setup — the wheels bundle the CUDA runtime, cuBLAS, and cuDNN as pip `nvidia-*` packages, so there is no CUDA toolkit to install and no versions to line up.

Check what you're on before anything else:

```bash
nvidia-smi --query-gpu=name,driver_version --format=csv
```

### Which driver to install

Skip to "Install torch" if you're already on 580 or newer.

Take Long-lived or Production. Both clear the 580 floor; New Feature buys nothing for CUDA work and has the shortest support window. As of August 2026 (Production updated October 2026):

| Branch | Version | Supported until | Where |
|---|---|---|---|
| Long-lived (LTS) | 580.178.04 | 2028-08 | archive page only |
| Production | 595.112.07 | 2027-03 | https://www.nvidia.com/en-us/drivers/unix/ |
| New Feature | 610.57.04 | 2027-08 | https://www.nvidia.com/en-us/drivers/unix/ |

The Unix driver page lists Production, New Feature, and Legacy — **not LTS**. Get 580.x from https://www.nvidia.com/en-us/drivers/unix/linux-amd64-display-archive/

Install steps: `fedora.md` → "Install the official NVIDIA driver (`.run` file)".

The installer picks the kernel module flavour for you and gets it right: open on Turing and newer, proprietary on older cards. Blackwell (RTX 50 series) and later run on the open modules only. To confirm afterwards — `Dual MIT/GPL` is open, `NVIDIA` is proprietary:

```bash
modinfo -F license nvidia
```

### Install torch

```bash
# Installs the CUDA 13.0 build (default as of August 2026)
pip install torch

# Expect e.g.: 2.13.0 13.0 NVIDIA GeForce RTX 5090
python -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.get_device_name(0))"
```

**580 itself won't go stale — the pairing might.** A CUDA family's minimum driver is permanent: 13.x needs 580 and always will, however many drivers ship after it. What changes is which CUDA `pip install torch` hands you. So if that second command ever prints a `torch.version.cuda` outside 13.x, this page has aged out — take the floor for that family from "Pinning a different CUDA wheel" instead.

### Pinning a different CUDA wheel

Only when something in your stack demands it:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cu126   # driver >= 525
pip install torch --index-url https://download.pytorch.org/whl/cu129   # driver >= 525
pip install torch --index-url https://download.pytorch.org/whl/cu132   # driver >= 580
```

Each CUDA major family has a minimum driver, and every minor version in that family runs on it:

| CUDA family | Minimum driver |
|---|---|
| 11.x | 450 |
| 12.x | 525 |
| 13.x | **580** |

The driver is backward compatible but never forward — a new driver runs old CUDA fine, an old driver cannot run new CUDA.

Reference: https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html

### What actually bites

- **`torchvision` and `torchaudio` must match** the `torch` version *and* its `cuXXX` channel. Mixing channels installs two CUDA runtimes and fails at import.
- **CUDA 13 dropped Maxwell, Pascal, and Volta.** Turing (SM 7.5) and newer only. On an older card, stay on `cu126`.
- **The ecosystem lags, not NVIDIA.** flash-attn, vLLM, xformers, and bitsandbytes are usually a release behind. Pick the channel the slowest one supports; don't chase the newest CUDA.
- **`nvidia-smi` reports a CUDA version you never installed.** That figure is the highest CUDA the driver can run, not a toolkit on disk.
- **`torch.cuda.is_available()` is `False` while `nvidia-smi` works.** Almost always a below-580 driver paired with a CUDA 13 wheel.

You need a real CUDA toolkit (`nvcc`) only to *compile* CUDA code — custom ops, flash-attn from source. See `fedora.md` → "Install CUDA toolkit — only if you compile CUDA code".

## Power management

### Set the power limit (cap watts)

Useful when you want to undervolt for noise / heat (e.g. cap a 600W card at 500W) or stay within a PSU budget:

```bash
# 1. Check the supported range (Min Power Limit / Max Power Limit / Default)
nvidia-smi -q -d POWER

# 2. Apply the cap. -pm 1 enables persistence so the limit survives idle.
sudo nvidia-smi -pm 1
sudo nvidia-smi -i 0 -pl <WATTS>     # -i 0 = first GPU
```

The cap is reset on reboot — and on at least some driver / GPU combos, also dropped after suspend. Install a small systemd unit that re-applies it on boot **and** after resume from suspend / hibernate:

```bash
sudo tee /etc/systemd/system/nvidia-power-limit.service >/dev/null <<'EOF'
[Unit]
Description=Set NVIDIA GPU power limit
After=multi-user.target
After=systemd-suspend.service systemd-hibernate.service systemd-suspend-then-hibernate.service nvidia-resume.service

[Service]
Type=oneshot
ExecStart=/usr/bin/nvidia-smi -pm 1
ExecStart=/usr/bin/nvidia-smi -i 0 -pl 500

[Install]
WantedBy=multi-user.target
WantedBy=systemd-suspend.service systemd-hibernate.service systemd-suspend-then-hibernate.service
EOF

sudo systemctl daemon-reload
sudo systemctl reenable nvidia-power-limit   # refresh symlinks for new WantedBy targets
sudo systemctl start nvidia-power-limit
sudo systemctl status nvidia-power-limit --no-pager

# Tail the journal to confirm it ran
sudo journalctl --no-pager -u nvidia-power-limit
```

How the resume binding works:
- `systemd-suspend.service` is the unit that issues the actual suspend syscall and **blocks** while the system is asleep.
- `WantedBy=systemd-suspend.service` pulls our unit in whenever suspend is invoked.
- `After=systemd-suspend.service` makes us wait until that service returns — i.e., until the system has resumed.
- `After=nvidia-resume.service` ensures the NVIDIA driver has finished its own post-resume reinit before we touch the power limit.

This is the same pattern NVIDIA's own `nvidia-resume.service` uses. An equivalent alternative is to drop a script into `/usr/lib/systemd/system-sleep/` that systemd runs with `pre` / `post` arguments — that's slightly simpler for one-off tweaks, but the unit file is more discoverable and easier to manage with `systemctl`.

### Persistence mode (also fixes 100% CPU on ECC GPUs)

Without persistence, the driver reloads on every CUDA process start — slow, and on ECC-enabled cards (e.g. Tesla / A100 / H100) it triggers a re-init scan that pegs a CPU core at 100%:

```bash
sudo nvidia-smi -pm 1
```

The systemd unit above already does this. Reference: https://stackoverflow.com/questions/52759509/100-gpu-utilization-on-a-gce-without-any-processes

## Suspend and resume

### Reload `nvidia_uvm` after wake

If CUDA reports "device unavailable" or "no CUDA-capable device" after waking from suspend, the `nvidia_uvm` (Unified Virtual Memory) module sometimes gets stuck. Reload it on resume:

```bash
sudo tee /etc/systemd/system/nvidia-reload.service >/dev/null <<'EOF'
[Unit]
Description=Reload NVIDIA UVM module after wake from sleep
After=syslog.target network.target suspend.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c "rmmod nvidia_uvm && modprobe nvidia_uvm"

[Install]
WantedBy=suspend.target
EOF

sudo systemctl enable --now nvidia-reload
```

This is a fallback. First try the official `nvidia-suspend.service` / `nvidia-resume.service` and the `NVreg_PreserveVideoMemoryAllocations=1` modprobe option — see `fedora.md` → "Preserve video memory across suspend". Use the UVM reload only if those don't fix it.

Reference: https://forums.fast.ai/t/cuda-lib-not-working-after-suspend-on-ubuntu-16-04/3546

## Fan control (X11 only)

Fan speed control through `nvidia-settings` only works on X11. On Wayland you'd need a tool like `nvidia-fancontrol` or run the cards through IPMI / a fan controller.

### Enable fan speed control (`cool-bits`)

By default the driver doesn't expose fan speed as a writable setting. Flip a bit in xorg.conf to allow it:

```bash
sudo nvidia-xconfig --cool-bits=4
# Log out / restart X for the change to take effect
```

Other useful `cool-bits` values:
- `4`  — manual fan control
- `8`  — manual GPU clock control (overclock / underclock)
- `12` — both (4 + 8)

### Auto-apply a fan curve via user systemd

Run a fan-curve script on login as a user-level service. The script in this repo (`nvidia-fancurve-linux.py`) reads GPU temperature and adjusts fan speed in a loop:

```bash
mkdir -p ~/.config/systemd/user
tee ~/.config/systemd/user/nvidia-fancurve.service >/dev/null <<EOF
[Unit]
Description=NVIDIA fan curve

[Service]
ExecStart=$HOME/etc/nvidia-fancurve-linux.py
Restart=on-failure
RestartSec=20s

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now nvidia-fancurve
systemctl --user status nvidia-fancurve
```

References:
- https://wiki.archlinux.org/title/NVIDIA/Tips_and_tricks
- https://askubuntu.com/a/766111/1165335

## Driver maintenance

### Patch a `.run` installer

For applying community patches to the official NVIDIA installer (e.g. compatibility fixes for very new kernels, before NVIDIA ships a release):

```bash
# Extract the installer into a directory
./NVIDIA-Linux-x86_64-XXX.XX.run -x

cd NVIDIA-Linux-x86_64-XXX.XX
patch -p1 < /path/to/mypatchfile

# Run the patched installer from inside the extracted directory
sudo ./nvidia-installer
```

## Xid 79: the GPU fell off the bus

**Symptoms.** The NVIDIA card vanishes: `nvidia-smi` says `Unable to determine the device handle for GPU0 ... Unknown Error` / `No devices were found`, and anything using it hangs or dies. The kernel log says why (Xid 79 means the driver can no longer reach the GPU over PCIe; it names a symptom, not one cause):

```
NVRM: Xid (PCI:0000:01:00): 79, pid=..., name=..., GPU has fallen off the bus.
NVRM: Xid (PCI:0000:01:00): 154, GPU recovery action changed from 0x0 (None) to 0x1 (GPU Reset Required)
```

**Capture first,** to persistent storage (`/tmp` is RAM on Fedora). Find your GPU and the bridge above it with `lspci -Dnnk` and `lspci -tv`; the addresses below are examples:

```bash
mkdir -p ~/xid79-$(date +%F) && cd ~/xid79-$(date +%F)
journalctl -k -b -o short-precise > kernel.log
journalctl -b -o short-precise > journal.log
sudo nvidia-bug-report.sh                    # if it hangs, Ctrl+C and retry with --safe-mode
sudo lspci -nnvv -s 01:00.0 > lspci-gpu.txt; sudo lspci -nnvv -s 00:01.0 > lspci-bridge.txt
sudo journalctl --sync
```

**Recover.** NVIDIA's answer to Xid 79 is a restart. Try an orderly reboot first; it can hang at shutdown with `nvidia-modeset: ... Error while waiting for GPU progress` repeating every few seconds, and then only cutting the power gets you out. **Don't suspend:** `nvidia-suspend.service` waits on the lost GPU with the same message and never finishes, so the machine hangs half asleep. If your monitors are on the iGPU, the desktop keeps working until then, which also means a drop at idle can go unnoticed for hours; see [Catch it automatically](#catch-it-automatically). Afterwards, `journalctl -k -b -1 | grep -i xid` shows the event if your journal is persistent (Fedora's default). To search across several boots use `journalctl _TRANSPORT=kernel --since ...`: `-k` implies the current boot only.

**Investigate.** Check the power connector (12V-2x6) is fully seated at both ends, and look for PCIe errors before the Xid (`journalctl -k -b -1 | grep -i -E "aer|pcieport"`). Change one thing at a time, so you know what helped. Similar failures on Blackwell cards (RTX 50, RTX PRO 6000), at any load and across driver branches 580 to 615, are collected in https://github.com/NVIDIA/open-gpu-kernel-modules/issues/1151 (open as of 2026-11; matching it on Xid 79 alone doesn't prove the same cause). Workarounds reported there, each helping some and not others, all experimental:

- Force PCIe Gen 3 in the BIOS (undo: back to Auto).
- Lock the clocks, `sudo nvidia-smi -lgc <min>,<max>`, with a power limit (undo: `sudo nvidia-smi -rgc`). A lower power limit only acts when the card works near it.
- A different PSU, or the card in the primary x16 slot.

**Log it while it runs,** so a repeat shows what the card was doing (to a persistent path):

```bash
nvidia-smi --query-gpu=timestamp,pstate,power.draw,clocks.gr,temperature.gpu,utilization.gpu,pcie.link.gen.current,clocks_event_reasons.active --format=csv -lms 1000 >> ~/gpu-$(date +%F).csv
```

### Catch it automatically

The crash dump NVIDIA asks for exists only in memory until the driver unloads, and the manual capture above needs you to notice the drop. Three small root pieces cover that: a watcher that captures the report as soon as the Xid appears and warns the desktop, a guard that refuses suspend once the GPU is gone (and skips the NVIDIA resume step), and the vitals logger as a service.

`/usr/local/sbin/gpu-xid-watch`:

```bash
#!/bin/bash
set -u
FLAG=/run/gpu-lost OUT=/var/log/nvidia-crash
PAT='NVRM: Xid \(PCI:[^)]*\): (79|154),'
notify() {  # desktop users only (uid >= 1000)
  for bus in /run/user/*/bus; do
    uid=$(stat -c %u "$bus" 2>/dev/null) && [ "$uid" -ge 1000 ] || continue
    runuser -u "$(id -nu "$uid")" -- env DBUS_SESSION_BUS_ADDRESS="unix:path=$bus" \
      notify-send -u critical "$1" "$2" || true
  done
}
on_lost() {
  [ -e "$FLAG" ] && return; echo "$1" > "$FLAG"
  notify "GPU fell off the bus" "Save your work and power off; don't suspend. Capturing a bug report to $OUT."
  mkdir -p "$OUT"; t=$(date +%F_%H%M%S)
  timeout 300 nvidia-bug-report.sh --output-file "$OUT/nvidia-bug-report_$t.log" >/dev/null 2>&1 \
    || timeout 300 nvidia-bug-report.sh --safe-mode --output-file "$OUT/nvidia-bug-report_${t}_safe.log" >/dev/null 2>&1
  notify "GPU crash report saved" "In $OUT. Power off now."
}
hit=$(journalctl -k -b -o cat --no-pager | grep -m1 -E "$PAT"); [ -n "$hit" ] && on_lost "$hit"
journalctl -k -f -n0 -o cat | grep --line-buffered -E "$PAT" | while read -r l; do on_lost "$l"; done
```

`/usr/local/sbin/gpu-lost-check` (exit 1 once the GPU is lost this boot; `--quiet` skips the notification):

```bash
#!/bin/bash
PAT='NVRM: Xid \(PCI:[^)]*\): (79|154),'
[ -e /run/gpu-lost ] || journalctl -k -b -o cat --no-pager | grep -qE "$PAT" || exit 0
echo "GPU fell off the bus this boot: refusing to suspend. Shut down instead." >&2
[ "${1:-}" = --quiet ] && exit 1
for bus in /run/user/*/bus; do
  uid=$(stat -c %u "$bus" 2>/dev/null) && [ "$uid" -ge 1000 ] || continue
  runuser -u "$(id -nu "$uid")" -- env DBUS_SESSION_BUS_ADDRESS="unix:path=$bus" \
    notify-send -u critical "Suspend blocked" "The GPU fell off the bus; suspend would hang. Shut down instead." || true
done
exit 1
```

Units in `/etc/systemd/system/`:

```ini
# gpu-xid-watch.service
[Unit]
Description=Capture nvidia-bug-report when the GPU falls off the bus
[Service]
ExecStart=/usr/local/sbin/gpu-xid-watch
Restart=always
[Install]
WantedBy=multi-user.target

# gpu-lost-guard.service: a failing Requires= dependency cancels the sleep job
[Unit]
Description=Block suspend when the GPU has fallen off the bus
DefaultDependencies=no
Before=nvidia-suspend.service nvidia-hibernate.service systemd-suspend.service systemd-hibernate.service systemd-hybrid-sleep.service systemd-suspend-then-hibernate.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/gpu-lost-check
[Install]
RequiredBy=nvidia-suspend.service nvidia-hibernate.service systemd-suspend.service systemd-hibernate.service systemd-hybrid-sleep.service systemd-suspend-then-hibernate.service

# nvidia-resume.service.d/gpu-lost.conf: nvidia-resume still starts after a cancelled
# suspend; skip it cleanly instead of touching a lost driver
[Service]
ExecCondition=/usr/local/sbin/gpu-lost-check --quiet
```

Install and enable:

```bash
sudo chmod 755 /usr/local/sbin/gpu-xid-watch /usr/local/sbin/gpu-lost-check
sudo restorecon -R /usr/local/sbin /etc/systemd/system    # SELinux (Fedora)
sudo systemctl daemon-reload
sudo systemctl enable --now gpu-xid-watch.service
sudo systemctl enable gpu-lost-guard.service
```

A shell-script hook in `/usr/lib/systemd/system-sleep/` can't do the guard's job: systemd ignores its exit code. The service route covers the GNOME menu, the suspend key, the lid and `systemctl suspend` alike, since all go through `systemd-suspend.service`.

**Test the guard** with a fake flag: `sudo touch /run/gpu-lost`, then suspend from the menu. The screen should come straight back with a "Suspend blocked" notification, and `journalctl -b --since -2min | grep -E "gpu-lost|nvidia-resume"` should show the guard failed and `nvidia-resume` `Skipped due to 'exec-condition'`. Then `sudo rm /run/gpu-lost` (a reboot clears it too).

**Undo:** `sudo systemctl disable --now gpu-xid-watch.service gpu-lost-guard.service`, delete the files above, `sudo systemctl daemon-reload`.

**Before posting logs** to an issue or forum, read and redact them: `nvidia-bug-report.log.gz` and full journals carry host names, user names, paths and serial numbers. Never commit them to a repo.

## Docker GPU smoke test

After installing the NVIDIA Container Toolkit (see `fedora.md` → "NVIDIA Container Toolkit"), confirm the driver is reachable from a container:

The container's CUDA version is independent of the host — only the host driver and the container toolkit matter, so a CUDA 13 image runs on any driver ≥ 580 regardless of what's installed on the host.

```bash
# nvidia-smi inside a container — should match the host driver version
docker run --rm --gpus all nvidia/cuda:13.0.3-base-ubuntu24.04 nvidia-smi
```

For an end-to-end test that actually exercises the GPU (CUDA + cuDNN), spin up a development image and run a small training script:

```bash
# Pick a tag that matches your CUDA / cuDNN / Ubuntu combo from
#   https://hub.docker.com/r/nvidia/cuda/tags
docker run --rm -it --gpus all nvidia/cuda:13.0.3-cudnn-devel-ubuntu24.04 bash

# Inside the container:
apt-get update && apt-get -y install curl git python3-pip
pip install torch          # CUDA 13.0 wheel — see "PyTorch needs a driver, not a CUDA toolkit"
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```
