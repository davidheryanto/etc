# Fedora cheatsheet

Start here after installing Fedora, or when reviewing an existing workstation. Follow [Workstation setup and review](#workstation-setup-and-review), then open the linked procedures as needed.

This guide covers Fedora workstation setup and Fedora-specific instructions. [Linux](linux.md) covers shared commands, hardware configuration, and troubleshooting; [Bash](bash.md#shell-config) covers shell configuration. Older release-specific recipes live under [Historical notes](#historical-notes).

## Contents

- **[Workstation setup and review](#workstation-setup-and-review)**
    - [Base packages](#base-packages)
    - [Shell configuration](#shell-configuration)
    - [Git and SSH setup](#git-and-ssh-setup)
    - [Desktop preferences](#desktop-preferences)
    - [Hardware and wakeup behavior](#hardware-and-wakeup-behavior)
    - [Development tools](#development-tools)
    - [Personal apps and data](#personal-apps-and-data)
    - [Optional setup choices](#optional-setup-choices)
    - [Verify after reboot](#verify-after-reboot)
    - [Useful GNOME extensions](#useful-gnome-extensions)

- **[GNOME](#gnome)**
    - [Settings tweaks](#settings-tweaks)
    - [Hi-DPI fractional scaling](#hi-dpi-fractional-scaling)
    - [Disable Ctrl+Shift+E emoji shortcut](#disable-ctrlshifte-emoji-shortcut)
    - [Disable auto-update](#disable-auto-update)
    - [Zoom / magnifier shortcuts](#zoom--magnifier-shortcuts)

- **[Fonts](#fonts)**
    - [Install user fonts](#install-user-fonts)
    - [Substitute system fonts](#substitute-system-fonts)

- **[NVIDIA driver and CUDA](#nvidia-driver-and-cuda)**
    - [Install the official NVIDIA driver (`.run` file)](#install-the-official-nvidia-driver-run-file)
    - [RPM Fusion `akmod-nvidia-open` — rebuilds itself on kernel updates](#rpm-fusion-akmod-nvidia-open--rebuilds-itself-on-kernel-updates)
    - [Install CUDA toolkit — only if you compile CUDA code](#install-cuda-toolkit--only-if-you-compile-cuda-code)
    - [Preserve video memory across suspend](#preserve-video-memory-across-suspend)
    - [Use integrated GPU for the desktop](#use-integrated-gpu-for-the-desktop)
    - [NVIDIA Container Toolkit (Docker GPU access)](#nvidia-container-toolkit-docker-gpu-access)

- **[Docker and Kubernetes](#docker-and-kubernetes)**
    - [Install Docker CE](#install-docker-ce)
    - [Kind (local Kubernetes cluster)](#kind-local-kubernetes-cluster)

- **[Disk and LVM](#disk-and-lvm)**
    - [Resize root and home partitions](#resize-root-and-home-partitions)
    - [Add a new disk to a volume group](#add-a-new-disk-to-a-volume-group)

- **[Apps](#apps)**
    - [Maestral (lightweight Dropbox client)](#maestral-lightweight-dropbox-client)
    - [Wine and Adobe Reader](#wine-and-adobe-reader)

- **[Misc](#misc)**
    - [Default editor (vim)](#default-editor-vim)
    - [Disable terminal beep](#disable-terminal-beep)
    - [GTK themes (Materia, Arc)](#gtk-themes-materia-arc)
    - [Fastest dnf mirror](#fastest-dnf-mirror)
    - [Inotify watchers (for Dropbox)](#inotify-watchers-for-dropbox)
    - [SELinux troubleshooting](#selinux-troubleshooting)
    - [VLC slow seek](#vlc-slow-seek)
    - [Open files from terminal](#open-files-from-terminal)
    - [Per-process network usage (nethogs)](#per-process-network-usage-nethogs)

- **[Historical notes](#historical-notes)**
    - [Fedora 35: NVIDIA Container Toolkit (older method)](#fedora-35-nvidia-container-toolkit-older-method)
    - [Fedora 32–33: Docker with moby-engine and cgroups v1](#fedora-3233-docker-with-moby-engine-and-cgroups-v1)
    - [Fedora 33: Wine + Adobe Reader original notes](#fedora-33-wine--adobe-reader-original-notes)
    - [Fedora 27: sidecar GCC for old CUDA](#fedora-27-sidecar-gcc-for-old-cuda)
    - [Fedora 29 Optimus laptops (Bumblebee — deprecated)](#fedora-29-optimus-laptops-bumblebee--deprecated)
    - [Microsoft SQL Server](#microsoft-sql-server)

<a id="quick-setup"></a>

## Workstation setup and review

On a fresh install, follow the sections in order and choose the tools and preferences that apply to this machine. When reviewing an existing setup, scan the same sections, inspect the current configuration, and change what is missing or no longer suits you.

The package examples below come from the Fedora 42 notes; recipes have not been tested on every Fedora release. Check your release with `cat /etc/fedora-release`, and read any version or hardware requirements in the linked procedure.

<a id="fresh-install-checklist-fedora-42"></a>

<a id="setup-checklist"></a>

### Base packages

Update first:

```bash
sudo dnf upgrade
```

Choose packages from these groups; they are a personal starting list, not requirements for every workstation:

```bash
# Everyday CLI tools
sudo dnf install git curl wget vim unar htop nethogs iotop aria2

# GNOME customization, password manager, and launcher editor
sudo dnf install gnome-tweaks gnome-extensions-app keepassxc alacarte
```

For package inspection and maintenance, see [DNF and RPM](linux.md#dnf-and-rpm). Installing vim and selecting it as the [default editor](#default-editor-vim) are separate choices.

Open the tools you selected and check the default editor in a new login session.

### Shell configuration

Use [Bash startup files](bash.md#bashrc-vs-bash_profile), the [example bashrc](bash.md#example-bashrc), and [modular configuration](bash.md#modular-sourcing-bashrcd) to set up PATH, aliases, your prompt, and tool hooks. Merge with your existing configuration and adapt the personal paths and aliases.

Open a fresh terminal, run `command -v` for tools you use, and try your aliases. Startup should produce no errors. Also check an SSH/login shell if you use one.

### Git and SSH setup

Configure your [Git identity](git.md#global--local-profile), [global ignore file](git.md#global-gitignore), and [SSH keys](linux.md#keys-and-ssh-agent). If needed, follow the guide for [multiple GitHub accounts](git.md#multiple-github-accounts-personal--work).

In a real repository, inspect `git config --show-origin --get user.email` and run `git ls-remote origin` to verify the identity and repository access.

### Desktop preferences

Review [GNOME settings](#gnome), [fonts](#fonts), and [extensions](#useful-gnome-extensions). Set your terminal shortcut, scaling, animation, and sound preferences.

Try the shortcuts, check text on every display, and confirm your chosen extensions work after login.

### Hardware and wakeup behavior

Review [power and suspend](linux.md#power-and-suspend), [USB wakeup policy](linux.md#usb-wakeup-policy), and [audio/webcam](linux.md#audio-and-webcam). Identify your own USB devices and decide which should wake the machine before adapting the example rules. For NVIDIA, review [driver options](#nvidia-driver-and-cuda) and [suspend handling](#preserve-video-memory-across-suspend).

Test suspend/resume, intended keyboard/mouse wake behavior, speakers, microphone, and webcam. Test dock/KVM reconnects if used, and repeat wake tests after reboot.

### Development tools

Install the runtimes and services needed for your work: [C/C++ tools](#optional-setup-choices), [Python/uv](uv.md#install--upgrade-uv) and its [supply-chain settings](uv.md#supply-chain-safety-python), [Node](node.md), [Docker](#install-docker-ce), [Kind](#kind-local-kubernetes-cluster), or [GPU tools](nvidia.md).

Run the relevant version command and a small project or container you actually use.

### Personal apps and data

Install your browser, password manager, editor, and other apps. Restore selected settings and configure sync if used ([Maestral](#maestral-lightweight-dropbox-client)). Choose a backup destination and schedule; sync alone does not cover the same recovery needs.

Open important files, confirm sync completes, check the latest backup, and restore a sample file to a separate location.

### Optional setup choices

These are decisions to make for this workstation, not steps to run automatically:

- **Build tools:** install when compiling C/C++ code or dependencies, including the official NVIDIA `.run` installer:

  ```bash
  sudo dnf install @c-development
  ```

- **Global Git ignore:** follow [the Git guide](git.md#global-gitignore). If this checkout is at `~/etc` and its ignore rules suit you:

  ```bash
  git config --global core.excludesfile ~/etc/.gitignore
  ```

- **Passwordless sudo:** only if you explicitly want every member of `wheel` to run any command as root without a password. Edit with `sudo visudo` and enable `%wheel ALL=(ALL) NOPASSWD: ALL`; leave the existing policy alone otherwise.
- **Update policy:** review your preference for automatic updates. [Disabling GNOME software updates](#disable-auto-update) is optional; if you choose it, establish a manual update routine.
- **GPU and containers:** choose a driver installation method only if needed; [CUDA toolkit](#install-cuda-toolkit--only-if-you-compile-cuda-code), [Docker GPU access](#nvidia-container-toolkit-docker-gpu-access), and [Kind](#kind-local-kubernetes-cluster) serve separate needs.
- **Storage changes:** inspect [disk usage and devices](linux.md#disk-usage-and-devices) first. [LVM resizing](#disk-and-lvm) is for an applicable storage layout and a specific capacity need, not routine first-install setup.
- **Troubleshooting tweaks:** [inotify limits](#inotify-watchers-for-dropbox), [DNF mirror settings](#fastest-dnf-mirror), and [SELinux troubleshooting](#selinux-troubleshooting) are references to use when relevant.
- **Vendor apps:** [Sublime Text](https://www.sublimetext.com/docs/linux_repositories.html), [Sublime Merge](https://www.sublimemerge.com/docs/linux_repositories), and JetBrains Toolbox, if used.

### Verify after reboot

Save your work and reboot when ready, then check:

- Login and a fresh terminal work; PATH, aliases, editor, and tool hooks behave as intended.
- Network access, display layout/scaling, audio input/output, and required peripherals work.
- Suspend and resume work; intended devices can wake the machine, and unwanted devices do not. Retest after unplugging/reconnecting a dock or switching a KVM if applicable. The USB rules do not cover every possible wake source.
- Required apps and configured services start. Inspect `systemctl --failed` and `systemctl --user --failed`; investigate relevant failures with [service and log commands](linux.md#services-and-logs).
- Your development project, container, or GPU workload runs, if applicable.
- Sync and backups still run; a sample backup restore succeeds.

### Useful GNOME extensions

Browse and install from https://extensions.gnome.org:

| Extension                                                                              | Purpose                                              |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [No overview](https://extensions.gnome.org/extension/4099/no-overview/)                | Skip the Activities overview on login                |
| [Dash to Panel](https://extensions.gnome.org/extension/1160/dash-to-panel/)            | Combine top bar and dash into a Windows-style panel  |
| [AppIndicator](https://extensions.gnome.org/extension/615/appindicator-support/)       | Restore system tray icons                            |
| [Resource Monitor](https://extensions.gnome.org/extension/1634/resource-monitor/)      | CPU / RAM / network meters in the top bar            |

## GNOME

### Settings tweaks

```bash
gnome-control-center        # open the Settings GUI from the terminal
sudo dnf -y install dconf-editor   # edit low-level settings not exposed in Settings
```

### Hi-DPI fractional scaling

Useful on 4K displays where 100% is too small and 200% is too big. Set it in Settings → Displays → Scale (125% / 150% / 175%) — 125% suits a 32" 4K.

Fedora 42 enables the two Mutter features this needs out of the box, so there is nothing to turn on:

```bash
gsettings get org.gnome.mutter experimental-features
# ['scale-monitor-framebuffer', 'xwayland-native-scaling']
```

- `scale-monitor-framebuffer` — offers the fractional scales.
- `xwayland-native-scaling` — X11 apps render at native resolution instead of being upscaled and blurry. It sets `Xft.dpi` to 192 (2×) for them; that is expected, not an override to undo.

Scale the display rather than the text (`text-scaling-factor`, Tweaks → Fonts): text scaling enlarges fonts only, leaving icons and spacing small. On older releases, or if the list comes back empty, set both:

```bash
gsettings set org.gnome.mutter experimental-features "['scale-monitor-framebuffer', 'xwayland-native-scaling']"
```

### Disable Ctrl+Shift+E emoji shortcut

GNOME's IBus binds Ctrl+Shift+E to emoji entry, which clashes with terminal emulators and editors:

```bash
ibus-setup
# → Emoji tab → clear or rebind the shortcut
```

### Disable auto-update

```bash
gsettings set org.gnome.software allow-updates false
gsettings set org.gnome.software download-updates false
```

### Zoom / magnifier shortcuts

| Shortcut       | Action       |
| -------------- | ------------ |
| `Super+Alt+8`  | Toggle zoom  |
| `Super+Alt+=`  | Zoom in      |
| `Super+Alt+-`  | Zoom out     |

## Fonts

### Install user fonts

User-scoped fonts don't need root and don't conflict with system fonts:

```bash
mkdir -p ~/.local/share/fonts
cp ~/path/to/*.ttf ~/.local/share/fonts/
fc-cache -f ~/.local/share/fonts
```

### Substitute system fonts

Map common Windows / macOS font names to whatever you've actually installed locally — websites and apps that hard-code "Segoe UI" or "Helvetica Neue" then render with your preferred font.

Modern Fedora reads `~/.config/fontconfig/fonts.conf`. The older `~/.fonts.conf` path still works but is deprecated:

```bash
mkdir -p ~/.config/fontconfig
cat > ~/.config/fontconfig/fonts.conf <<'EOF'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <!-- Replace common monospace fonts with SF Mono -->
  <match target="pattern">
    <test name="family" qual="any"><string>Courier New</string></test>
    <edit name="family" mode="assign"><string>SF Mono</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Liberation Mono</string></test>
    <edit name="family" mode="assign"><string>SF Mono</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Monaco</string></test>
    <edit name="family" mode="assign"><string>SF Mono</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Consolas</string></test>
    <edit name="family" mode="assign"><string>SF Mono</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Source Code Pro</string></test>
    <edit name="family" mode="assign"><string>SF Mono</string></edit>
  </match>

  <!-- Replace common sans-serif fonts with Inter -->
  <match target="pattern">
    <test name="family" qual="any"><string>Cantarell</string></test>
    <edit name="family" mode="assign"><string>Inter</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Helvetica</string></test>
    <edit name="family" mode="assign"><string>Inter</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Helvetica Neue</string></test>
    <edit name="family" mode="assign"><string>Inter</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Segoe UI</string></test>
    <edit name="family" mode="assign"><string>Inter</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Noto Sans</string></test>
    <edit name="family" mode="assign"><string>Inter</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>sans-serif</string></test>
    <edit name="family" mode="assign"><string>Inter</string></edit>
  </match>
</fontconfig>
EOF

fc-cache -f
```

## NVIDIA driver and CUDA

### Install the official NVIDIA driver (`.run` file)

Grab the `.run` file from https://www.nvidia.com/en-us/drivers/unix/. The install runs in two halves — prepare the system from your desktop, then finish from a text console. Don't paste it all at once: the handover step shuts the desktop down.

**Already running an NVIDIA driver and just want a newer one?** Steps 2–4 are one-time setup you did the first time round, so skip to the second half. The installer removes the old driver itself — no uninstall step. Only check that `rpm -q kernel-devel` still matches `uname -r`, because a kernel update since your last install would otherwise fail the module build.

**First half — in your normal desktop session:**

```bash
# 1. Pre-requisites — kernel headers and the build chain.
#    dkms is optional; it's what makes --dkms in the second half work.
sudo dnf -y install kernel-devel kernel-headers gcc make dkms acpid \
    libglvnd-glx libglvnd-opengl libglvnd-devel pkgconfig

# 2. Blacklist the nouveau driver. The installer offers to do this itself,
#    but the change needs a reboot to take effect — so letting it costs you
#    an install -> reboot -> re-run round trip. Doing it now avoids that.
sudo bash -c 'echo "blacklist nouveau" >> /etc/modprobe.d/blacklist.conf'

# 3. Pass the same blacklist to the kernel via grub. Edit /etc/default/grub
#    and add to GRUB_CMDLINE_LINUX:
#       rd.driver.blacklist=nouveau nvidia-drm.modeset=1
sudo grub2-mkconfig -o /boot/grub2/grub.cfg

# 4. Remove the nouveau X driver and regenerate initramfs
sudo dnf remove xorg-x11-drv-nouveau
sudo dracut --force /boot/initramfs-$(uname -r).img $(uname -r)

# First install only: reboot so nouveau is no longer loaded. The desktop
# comes back on a basic framebuffer driver; carry on from there.
sudo reboot
```

**Now save and close your open apps**, then press **Ctrl+Alt+F3** and log in at the text console. The next command shuts down GNOME and every graphical app along with it — **anything unsaved is lost**. It does not reboot your machine and it does not change anything permanently: your next reboot starts the desktop as usual.

Run it from the text console rather than a desktop terminal window, or you'll destroy the very terminal you're installing from.

**Second half — at the text console:**

```bash
# 5. Stop the desktop. The installer has to unload the running nvidia
#    module to replace it, and it can't while GNOME still has the GPU open.
sudo systemctl isolate multi-user.target

# 6. Install. --dkms rebuilds the module automatically on kernel updates.
#    Upgrading over an existing driver needs no cleanup — the installer
#    removes the old one itself.
sudo bash NVIDIA-Linux-x86_64-595.91.07.run --dkms

# 7. Reboot to load the new driver
sudo reboot

# ...then once you're back on the desktop, confirm the version:
nvidia-smi
```

Changed your mind before installing? `sudo systemctl isolate graphical.target` brings GNOME straight back — no reboot needed.

**Which version:** this route gets you any driver NVIDIA ships, including branches RPM Fusion doesn't carry. For picking one and the minimum your CUDA needs, see `nvidia.md` → "Which driver to install". The long-lived (LTS) branch isn't on the download page above — it lives at https://www.nvidia.com/en-us/drivers/unix/linux-amd64-display-archive/

**Kernel modules:** the installer picks for you — open on Turing and newer, proprietary on anything older — and that default is already correct. Blackwell (RTX 50 series) and later run on the open modules only; the open modules can't support pre-Turing at all. To force a flavour anyway, pass `-M=open` or `-M=proprietary`. Branches after 580 dropped Maxwell, Pascal, and Volta — on those cards install the 580 LTS branch; older cards need NVIDIA's legacy drivers.

**SecureBoot:** if enabled, the unsigned NVIDIA kernel module will be rejected at load time. Easiest fix: disable SecureBoot in firmware. The harder fix is signing the module with a Machine Owner Key — see https://rpmfusion.org/Howto/Secure%20Boot.

**Kernel updates:** with `--dkms`, the module rebuilds on the next boot — that's the trade-off vs RPM Fusion, which handles this for you. If something breaks, log in at a text console (Ctrl+Alt+F3), run `sudo systemctl isolate multi-user.target`, and re-run the installer. Build failures land in `/var/log/nvidia-installer.log`; a compiler too new for the driver is the usual cause.

Reference: https://www.if-not-true-then-false.com/2015/fedora-nvidia-guide/

### RPM Fusion `akmod-nvidia-open` — rebuilds itself on kernel updates

Hands-off after the initial install — `akmods` recompiles the module on every kernel update. The trade-off vs the `.run` file: you take whatever version RPM Fusion has packaged.

```bash
# Enable RPM Fusion (free + nonfree)
sudo dnf install \
    https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm \
    https://download1.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm

# akmod-nvidia-open lives in the separate nonfree-tainted repo
sudo dnf install rpmfusion-nonfree-release-tainted

# -open is required on Blackwell (RTX 50 series) and recommended on Turing
# and newer. Use akmod-nvidia instead only on pre-Turing cards.
sudo dnf install akmod-nvidia-open xorg-x11-drv-nvidia-cuda

# See what you're about to get before committing:
dnf list --showduplicates akmod-nvidia-open

# akmod takes a few minutes to compile after install.
# Wait until `modinfo` prints a version, then reboot:
modinfo -F version nvidia
sudo reboot
```

Don't mix the two routes — an `akmod` package and a `.run` install will fight over the same module. Run `sudo /usr/bin/nvidia-uninstall` before switching from `.run` to RPM Fusion.

Reference: https://rpmfusion.org/Howto/NVIDIA

### Install CUDA toolkit — only if you compile CUDA code

**Skip this for PyTorch and TensorFlow** — their wheels bundle the CUDA runtime and cuDNN, so the driver alone is enough. See `nvidia.md` → "CUDA setup for PyTorch: the driver is all you install".

You need `nvcc` only to build CUDA code yourself — custom ops, or flash-attn from source. Match the toolkit's major version to your PyTorch wheel (a `cu130` wheel wants a 13.x toolkit), pick it from https://developer.nvidia.com/cuda-toolkit-archive, and pass `--toolkit` so the installer skips the driver you already have:

```bash
sudo bash cuda_X.Y.Z_linux.run --override --silent --toolkit
echo "/usr/local/cuda-X.Y/lib64" | sudo tee /etc/ld.so.conf.d/cuda-X.Y.conf
sudo ldconfig

# Add to ~/.bashrc (see bash.md → "Per-tool PATH additions")
export PATH=/usr/local/cuda-X.Y/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda-X.Y/lib64:$LD_LIBRARY_PATH
```

For cuDNN, install the pip package into your project (`uv add nvidia-cudnn-cu13`) rather than copying headers and libs into `/usr/local/cuda-X.Y` by hand — the old manual route breaks on toolkit upgrades.

### Preserve video memory across suspend

Garbled visuals or "device unavailable" CUDA errors after resume usually mean the driver didn't preserve VRAM. VRAM is saved to a file in `NVreg_TemporaryFilePath` — the directory must exist and have room for your VRAM. Use `/var/tmp` (on disk), not `/tmp` (RAM on Fedora):

```bash
sudo tee /etc/modprobe.d/nvidia-power-management.conf <<'EOF'
options nvidia NVreg_PreserveVideoMemoryAllocations=1 NVreg_TemporaryFilePath=/var/tmp
EOF
sudo systemctl enable nvidia-suspend.service nvidia-resume.service nvidia-hibernate.service

# Module options apply on the next driver load — after your next reboot, confirm:
grep -E 'PreserveVideo|TemporaryFile' /proc/driver/nvidia/params
```

References:
- https://bbs.archlinux.org/viewtopic.php?id=274043
- https://wiki.archlinux.org/title/NVIDIA/Tips_and_tricks#Preserve_video_memory_after_suspend

### Use integrated GPU for the desktop

For machines with both integrated and discrete GPUs: route GNOME / Mutter through the integrated GPU and keep NVIDIA available for CUDA workloads:

```bash
# Add to /etc/environment
__EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/50_mesa.json
```

Reference: https://gitlab.gnome.org/GNOME/mutter/-/issues/2969

### NVIDIA Container Toolkit (Docker GPU access)

Lets Docker containers see your GPU — required for ML workloads in containers:

```bash
# One repo for all RPM distros — no per-distribution variable needed
curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo \
    | sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
sudo dnf install nvidia-container-toolkit

# Wire it into Docker
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Test
docker run --rm --gpus all nvidia/cuda:13.0.3-base-ubuntu24.04 nvidia-smi
```

If you hit `Failed to initialize NVML: Insufficient Permissions`, SELinux is blocking access:

```bash
sudo setsebool -P container_use_devices 1

# If still blocked, generate a custom SELinux policy from the audit log
sudo ausearch -c 'nvidia-smi' --raw | audit2allow -M my-nvidiasmi
sudo semodule -i my-nvidiasmi.pp
```

Reference: https://github.com/NVIDIA/nvidia-container-toolkit/issues/33

## Docker and Kubernetes

### Install Docker CE

Install from Docker's own repo. Docker supports the two newest Fedora releases; older ones keep their repo but stop getting updates:

```bash
# Fedora 41+ ships dnf5 — config-manager takes a subcommand, not --add-repo
sudo dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install docker-ce docker-ce-cli containerd.io

sudo systemctl enable --now docker
sudo usermod -aG docker $USER     # log out and back in for group change to apply

# Test
docker run hello-world
```

### Kind (local Kubernetes cluster)

Spins up a Kubernetes cluster inside Docker — handy for local development and CI:

```bash
# Install kind
cd $(mktemp -d)
curl -Lo kind https://kind.sigs.k8s.io/dl/v0.33.0/kind-linux-amd64
sudo install kind /usr/local/bin/

# Install kubectl — keep it within one minor version of the cluster.
# kind v0.33.0 defaults to Kubernetes 1.37 (see the kind release notes).
curl -LO https://dl.k8s.io/release/v1.37.0/bin/linux/amd64/kubectl
sudo install kubectl /usr/local/bin/

# Create a cluster
kind create cluster
kubectl run nginx --image nginx
```

Only if pods can't reach the internet — allow masquerade for the kind network's subnet:

```bash
docker network inspect kind | grep Subnet     # e.g. 172.18.0.0/16
sudo firewall-cmd --permanent --zone=FedoraWorkstation \
    --add-rich-rule='rule family=ipv4 priority=1 source address=172.18.0.0/16 masquerade'
sudo firewall-cmd --reload
```

## Disk and LVM

### Resize root and home partitions

Shrink `/` to grow `/home` (or vice versa). Works on ext4 + LVM. **Boot from a live USB** — you can't safely shrink a mounted filesystem.

```bash
# 1. Look at the current layout
lsblk

# Example:
# sda                               8:0    0 931.5G  0 disk
# └─sda3                            8:3    0 929.9G  0 part
#   ├─fedora_localhost--live-swap 253:0    0  15.7G  0 lvm
#   ├─fedora_localhost--live-home 253:1    0   400G  0 lvm
#   └─fedora_localhost--live-root 253:2    0 514.2G  0 lvm

# 2. If LUKS-encrypted, decrypt first
sudo cryptsetup luksOpen /dev/mapper/fedora_localhost--live-root root
sudo cryptsetup luksOpen /dev/mapper/fedora_localhost--live-home home

# 3. Filesystem check (answer 'a' to accept all auto-fixes)
sudo fsck /dev/mapper/root

# 4. Shrink root by 120G. --resizefs also resizes the filesystem.
sudo lvresize --resizefs --size -120G /dev/fedora_localhost-live/root

# 5. Grow home by 120G
sudo fsck /dev/mapper/home
sudo lvresize --resizefs --size +120G /dev/fedora_localhost-live/home

# 6. Verify
lsblk
```

### Add a new disk to a volume group

When you install a second drive and want it to extend an existing partition rather than be mounted separately:

```bash
# Inspection commands
sudo pvdisplay     # physical volumes
sudo vgdisplay     # volume groups
sudo lvdisplay     # logical volumes

# 1. Find the new disk (e.g. /dev/nvme0n1)
lsblk

# 2. Mark it as an LVM physical volume
sudo pvcreate /dev/nvme0n1
sudo lvmdiskscan -l

# 3. Add it to an existing volume group
sudo vgextend fedora_localhost-live /dev/nvme0n1

# 4. Use all the new free space to extend a logical volume
sudo lvresize --resizefs --extents +100%FREE /dev/fedora_localhost-live/home

# 5. Confirm
df -h
```

## Apps

### Maestral (lightweight Dropbox client)

A community Dropbox client — no system tray nag, no proprietary daemon. Runs as a systemd user service:

```bash
# python3-systemd comes from Fedora (the daemon's unit is Type=notify);
# --system-site-packages lets the venv import it instead of building from source
sudo dnf install python3-systemd
uv venv --system-site-packages --python /usr/bin/python3 ~/Apps/maestral
uv pip install --python ~/Apps/maestral 'maestral[gui]'

mkdir -p ~/bin
ln -s ~/Apps/maestral/bin/maestral ~/bin/maestral

maestral start
maestral autostart -Y
systemctl --user status maestral-daemon@maestral
```

Reference: https://maestral.app/docs/installation

### Wine and Adobe Reader

For when you really need the Windows version of an app:

```bash
sudo dnf -y install wine.i686 winetricks cabextract
export WINEARCH=win32
winetricks mspatcha && winetricks atmlib && winetricks riched20

# Install Acrobat Reader from a Windows .exe
wine AcroRdrDC2000920063_en_US.exe

# Then in the Reader app:
# - Disable Protected Mode (it can cause crashes under Wine)
# - Copy Segoe UI.ttf into ~/.wine/drive_c/windows/Fonts for proper UI rendering
```

## Misc

### Default editor (vim)

```bash
sudo dnf install vim-default-editor --allowerasing   # replaces nano-default-editor
```

This sets `EDITOR=/usr/bin/vim` system-wide via `/etc/profile.d/`, so `git commit`, `crontab -e`, etc. use vim in new login shells. No manual `~/.bash_profile` editing needed. `sudo` resets the environment, so `sudo visudo` still opens `vi`.

### Disable terminal beep

The hardware bell — often triggered by tab-completion in zsh and similar:

```bash
# Temporary
sudo modprobe -r pcspkr

# Permanent
echo "blacklist pcspkr" | sudo tee /etc/modprobe.d/blacklist-pcspkr.conf   # must end in .conf
```

Reference: https://superuser.com/a/15779

### GTK themes (Materia, Arc)

```bash
sudo dnf -y install materia-gtk-theme arc-theme
```

### Fastest dnf mirror

Edit `/etc/dnf/dnf.conf`:

```
[main]
gpgcheck=1
installonly_limit=3
clean_requirements_on_remove=True
fastestmirror=true
```

### Inotify watchers (for Dropbox)

Dropbox can hit the default inotify watch limit on big folders. Bump it:

```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p --system
```

### SELinux troubleshooting

When something works on Ubuntu but fails on Fedora, SELinux is the usual suspect:

```bash
sudo dnf install setroubleshoot
# Then open the "SELinux Alert Browser" GUI — it explains the denial and shows
# the exact command to allow it.
```

Reference: https://fedoramagazine.org/troubleshooting-selinux/

### VLC slow seek

Tools → Preferences → Video → Output → switch to **OpenGL video output**.

### Open files from terminal

```bash
xdg-open file.pdf         # opens in the default app for the file type
```

### Per-process network usage (nethogs)

```bash
sudo nethogs           # live sent/received per process, sorted by traffic
sudo nethogs -v 3      # cumulative totals instead of rates — "what used all my data today"
# -v view mode: 0 kB/s (default), 1 total kB, 2 total bytes, 3 total MB, 4 MB/s, 5 GB/s
# Keys: m cycle view modes, r/s sort by received/sent, q quit
# macOS built-in equivalent: sudo nettop -P
```

## Historical notes

These sections are kept for reference but are **no longer the recommended path** on current Fedora.

### Fedora 35: NVIDIA Container Toolkit (older method)

Before `nvidia-ctk runtime configure` existed, Docker was wired to NVIDIA by hand-editing `/etc/docker/daemon.json`. The current recommended method is in the main "NVIDIA Container Toolkit" section above. The SELinux / `setsebool` fixes still apply.

### Fedora 32–33: Docker with moby-engine and cgroups v1

Fedora 31 switched to cgroups v2, which Docker didn't support cleanly until ~20.10. Workaround on F32–F33:

```bash
# Force cgroups v1
sudo grubby --update-kernel=ALL --args="systemd.unified_cgroup_hierarchy=0"

# Allow Docker to make remote / local connections
sudo firewall-cmd --permanent --zone=trusted --add-interface=docker0
sudo firewall-cmd --permanent --zone=FedoraWorkstation --add-masquerade

# Install Moby (open-source Docker)
sudo dnf install -y moby-engine docker-compose
sudo systemctl enable docker
sudo usermod -aG docker $USER
sudo systemctl reboot

# Test
sudo docker run hello-world
```

There was also a firewalld + iptables compat fix for Kind on F32. The original notes had `sed` args in the wrong order — the corrected form:

```bash
# Switch firewalld backend from nftables to iptables
sudo sed -i 's/FirewallBackend=.*/FirewallBackend=iptables/' /etc/firewalld/firewalld.conf
sudo systemctl restart firewalld
```

> **Outdated on F33+.** Modern Docker handles cgroups v2 natively — install via the `docker-ce.repo` (see "Install Docker CE" above) and skip the cgroups workaround entirely.

### Fedora 33: Wine + Adobe Reader original notes

The Wine notes are evergreen — see the "Wine and Adobe Reader" section above. The Fedora 33 notes also originally appended `EDITOR` to `~/.bash_profile` in two consecutive commands, leaving a duplicate line. Use `vim-default-editor` instead (see "Default editor" above) — no manual editing needed.

### Fedora 27: sidecar GCC for old CUDA

> **Outdated.** Modern CUDA (12+) supports modern GCC, so you don't need this anymore. Kept here only as a reference for legacy systems where CUDA caps at an older compiler (e.g. CUDA 8.0 / GCC 5.x).

```bash
./contrib/download_prerequisites
./configure --prefix=/usr/local/gcc/5.4.0
make -j$(nproc)
sudo make install

# Point CUDA at the sidecar compiler
sudo ln -s /usr/local/gcc/5.4.0/bin/gcc /usr/local/cuda/bin/gcc
sudo ln -s /usr/local/gcc/5.4.0/bin/g++ /usr/local/cuda/bin/g++
```

### Fedora 29 Optimus laptops (Bumblebee — deprecated)

> **Deprecated.** Modern Fedora handles Optimus laptops via NVIDIA PRIME — install `akmod-nvidia` from RPM Fusion and run apps on the discrete GPU with `prime-run <app>`. Bumblebee is unmaintained.

```bash
# Old approach — kept for reference only
sudo dnf -y --nogpgcheck install \
    http://install.linux.ncsu.edu/pub/yum/itecs/public/bumblebee/fedora$(rpm -E %fedora)/noarch/bumblebee-release-1.2-1.noarch.rpm
sudo dnf -y --nogpgcheck install \
    http://install.linux.ncsu.edu/pub/yum/itecs/public/bumblebee-nonfree/fedora$(rpm -E %fedora)/noarch/bumblebee-nonfree-release-1.2-1.noarch.rpm
sudo dnf install -y bumblebee-nvidia bbswitch-dkms primus kernel-devel
sudo usermod -a -G bumblebee $USER

# Run apps on the discrete GPU
optirun nvidia-smi
optirun python train.py
```

### Microsoft SQL Server

> **Outdated.** The original notes pointed at the RHEL 7 repo. If you still need SQL Server on Fedora, check the current Microsoft docs at https://learn.microsoft.com/sql/linux/sql-server-linux-setup-red-hat for the up-to-date repo URL. The install pattern (add Microsoft repo, `dnf install mssql-server`, run setup, open firewall port 1433) is unchanged.
