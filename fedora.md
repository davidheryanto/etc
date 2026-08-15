# Fedora cheatsheet

Install notes, tweaks, and fixes collected across Fedora versions. Latest releases first; older notes live under "Historical notes" at the bottom.

## Contents

- **Quick setup**
    - Fedora 42 (current)
    - Fedora 39 fresh-install checklist
    - Useful GNOME extensions

- **GNOME**
    - Settings tweaks
    - Hi-DPI fractional scaling
    - Disable Ctrl+Shift+E emoji shortcut
    - Disable auto-update
    - Zoom / magnifier shortcuts

- **Fonts**
    - Install user fonts
    - Substitute system fonts

- **NVIDIA driver and CUDA**
    - Install the official NVIDIA driver (`.run` file)
    - RPM Fusion `akmod-nvidia-open` — rebuilds itself on kernel updates
    - Install CUDA toolkit — only if you compile CUDA code
    - Preserve video memory across suspend
    - Use integrated GPU for the desktop
    - NVIDIA Container Toolkit (Docker GPU access)

- **Docker and Kubernetes**
    - Install Docker CE
    - Kind (local Kubernetes cluster)

- **Disk and LVM**
    - Resize root and home partitions
    - Add a new disk to a volume group

- **Apps**
    - Maestral (lightweight Dropbox client)
    - Wine and Adobe Reader

- **Misc**
    - Default editor (vim)
    - Disable terminal beep
    - GTK themes (Materia, Arc)
    - Fastest dnf mirror
    - Inotify watchers (for Dropbox)
    - SELinux troubleshooting
    - VLC slow seek
    - Open files from terminal

- **Historical notes**
    - Fedora 35: NVIDIA Container Toolkit (older method)
    - Fedora 32–33: Docker with moby-engine and cgroups v1
    - Fedora 33: Wine + Adobe Reader original notes
    - Fedora 27: sidecar GCC for old CUDA
    - Fedora 29 Optimus laptops (Bumblebee — deprecated)
    - Microsoft SQL Server

## Quick setup

### Fedora 42 (current)

```bash
# Development tools — needed when something compiles C/C++ from source
# (e.g. official NVIDIA .run installer, Python wheels with native code)
sudo dnf install @development-tools

# NVIDIA: preserve VRAM across suspend (fixes black screen / garbled UI on resume)
# https://wiki.archlinux.org/title/NVIDIA/Tips_and_tricks#Preserve_video_memory_after_suspend
sudo tee /etc/modprobe.d/nvidia-power-management.conf <<'EOF'
options nvidia NVreg_PreserveVideoMemoryAllocations=1 NVreg_TemporaryFilePath=/var/nvidia-tmp
EOF
sudo systemctl enable nvidia-suspend.service nvidia-resume.service nvidia-hibernate.service
```

### Fedora 39 fresh-install checklist

Steps to take on a fresh install. Most still apply on newer Fedora releases:

```bash
# --- GUI tweaks ---
# Settings → Keyboard Shortcuts → bind a hotkey to gnome-terminal
# Settings → Accessibility → reduce animation
# Settings → Sound → mute system sounds

# --- vim as default editor everywhere (sudo, git, etc.) ---
sudo dnf -y install vim-default-editor --allowerasing

# --- Passwordless sudo for the wheel group ---
sudo visudo
# uncomment:  %wheel  ALL=(ALL)  NOPASSWD: ALL

# --- User fonts (e.g. SF Mono, Inter) ---
mkdir -p ~/.local/share/fonts
cp /path/to/*.ttf ~/.local/share/fonts/
fc-cache -f ~/.local/share/fonts

# --- System update + commonly used apps ---
sudo dnf upgrade
sudo dnf -y install gnome-tweaks gnome-extensions-app unar htop nethogs iotop \
    keepassxc aria2 alacarte gnome-shell-extension-system-monitor

# Then in Tweaks → Fonts → set monospace font (e.g. SF Mono Regular)

# --- Install via vendor repos / installers ---
# - Sublime Text:  https://www.sublimetext.com/docs/linux_repositories.html
# - Sublime Merge: https://www.sublimemerge.com/docs/linux_repositories
# - Miniconda
# - JetBrains Toolbox
# - Docker (see Docker section below)

# --- Bashrc ---
# See bash.md → "Example ~/.bashrc" for a clean starting point.

# --- Global gitignore (note: no quotes around ~ so the shell expands it) ---
git config --global core.excludesfile ~/etc/.gitignore
```

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

Useful on 4K displays where 100% is too small and 200% is too big:

```bash
gsettings set org.gnome.mutter experimental-features "['scale-monitor-framebuffer']"
# Then Settings → Displays → pick 125% / 150% / 175%
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

**Kernel modules:** the installer picks for you — open on Turing and newer, proprietary on anything older — and that default is already correct. Blackwell (RTX 50 series) and later run on the open modules only; the open modules can't support pre-Turing at all. To force a flavour anyway, pass `-M=open` or `-M=proprietary`.

**SecureBoot:** if enabled, the unsigned NVIDIA kernel module will be rejected at load time. Easiest fix: disable SecureBoot in firmware. The harder fix is signing the module with a Machine Owner Key — see https://rpmfusion.org/Howto/Secure%20Boot.

**Kernel updates:** with `--dkms`, the module rebuilds on the next boot — that's the trade-off vs RPM Fusion, which handles this for you. If something breaks, log in at a text console (Ctrl+Alt+F3), run `sudo systemctl isolate multi-user.target`, and re-run the installer. Build failures land in `/var/log/nvidia-installer.log`; a compiler too new for the driver is the usual cause.

Reference: https://www.if-not-true-then-false.com/2015/fedora-nvidia-guide/

### RPM Fusion `akmod-nvidia-open` — rebuilds itself on kernel updates

Hands-off after the initial install — `akmods` recompiles the module on every kernel update. The trade-off vs the `.run` file: you take whatever version RPM Fusion has packaged.

```bash
# Enable RPM Fusion (free + nonfree). The nonfree release package also
# enables the dedicated nvidia-driver repo, which carries a newer driver
# than plain nonfree — check `dnf repolist | grep nvidia` if in doubt.
sudo dnf install \
    https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm \
    https://download1.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm

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

For cuDNN, install the pip package (`pip install nvidia-cudnn-cu13`) rather than copying headers and libs into `/usr/local/cuda-X.Y` by hand — the old manual route breaks on toolkit upgrades.

### Preserve video memory across suspend

Garbled visuals or "device unavailable" CUDA errors after resume usually mean the driver didn't preserve VRAM:

```bash
sudo tee /etc/modprobe.d/nvidia-power-management.conf <<'EOF'
options nvidia NVreg_PreserveVideoMemoryAllocations=1 NVreg_TemporaryFilePath=/var/nvidia-tmp
EOF
sudo systemctl enable nvidia-suspend.service nvidia-resume.service nvidia-hibernate.service
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

On modern Fedora (33+ with cgroups v2), Docker installs cleanly from Docker's own repo:

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install docker-ce docker-ce-cli containerd.io

sudo systemctl enable --now docker
sudo usermod -aG docker $USER     # log out and back in for group change to apply

# Test
docker run hello-world
```

If your Fedora version is too new to be in the Docker repo yet, edit `/etc/yum.repos.d/docker-ce.repo` and replace `$releasever` with the latest supported Fedora number (e.g. `40`).

### Kind (local Kubernetes cluster)

Spins up a Kubernetes cluster inside Docker — handy for local development and CI:

```bash
# Install kind
cd $(mktemp -d)
curl -Lo kind https://kind.sigs.k8s.io/dl/v0.23.0/kind-linux-amd64
sudo install kind /usr/local/bin/

# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/

# Allow Kind containers to reach the internet (assumes the "kind" Docker network
# uses 172.18.0.0/16 — check with: docker inspect kind | grep Subnet)
sudo firewall-cmd --permanent --zone=FedoraWorkstation \
    --add-rich-rule='rule family=ipv4 priority=1 source address=172.18.0.0/16 masquerade'
sudo firewall-cmd --reload

# Create a cluster
kind create cluster
kubectl run nginx --image nginx
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
mkdir -p ~/Apps && cd ~/Apps
/usr/bin/python3 -m venv maestral-venv
source maestral-venv/bin/activate
pip install -U 'maestral[gui]' importlib-metadata
sudo dnf install python3-systemd

mkdir -p ~/bin
ln -s ~/Apps/maestral-venv/bin/maestral ~/bin/maestral

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
sudo dnf install vim-default-editor
```

This sets `EDITOR=/usr/bin/vim` system-wide via `/etc/profile.d/`, so `git commit`, `sudo visudo`, etc. all use vim. No manual `~/.bash_profile` editing needed.

### Disable terminal beep

The hardware bell — often triggered by tab-completion in zsh and similar:

```bash
# Temporary
sudo modprobe -r pcspkr

# Permanent
echo "blacklist pcspkr" | sudo tee -a /etc/modprobe.d/blacklist
```

Reference: https://superuser.com/a/15779

### GTK themes (Materia, Arc)

```bash
# Materia
sudo dnf copr enable tcg/themes
sudo dnf -y install materia-gtk-theme

# Arc
sudo dnf -y install arc-theme
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
sudo dnf -y install libgnome
gnome-open file.pdf       # opens in the default app for the file type
# Modern equivalent that works without libgnome:
xdg-open file.pdf
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
