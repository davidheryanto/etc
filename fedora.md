# Setup GTX 750 Ti on Fedora 23
# =======================================================================================

# Note
With SecureBoot enabled, installing the driver requires signing of the kernel modules etc
Not sure how to do it properly
Better just disable SecureBoot

# Install pre-requisites
sudo dnf -y install gcc "kernel-devel-uname-r == $(uname -r)" 

# https://kaischroed.wordpress.com/howto-install-nvidia-driver-on-fedora-replacing-nouveau/
echo 'blacklist nouveau' >> /etc/modprobe.d/disable-nouveau.conf
echo 'nouveau modeset=0' >> /etc/modprobe.d/disable-nouveau.conf
# Edit grub.cfg (/boot/grub2/grub.cfg or /boot/efi/EFI/fedora/grub.cfg)
# Why? Fedora package nouveau as part of boot image
# Add rdblacklist=nouveau
e.g. 
/vmlinuz-3.6.3-1.fc17.x86_64 root=/dev/mapper/vg_fedo-lv_root ro rd.lvm.lv=vg_fedo/lv_swap rd.md=0 rd.dm=0 SYSFONT=True rd.lvm.lv=vg_fedo/lv_root rd.luks=0  KEYTABLE=es LANG=en_US.UTF-8 rdblacklist=nouveau rhgb quiet
# Execute .run file
./NVIDIA-Linux-x86_64-304.60.run

# In Fedora23, the default login manager gdm may have some problem
# Replace gdm with lightdm
systemctl stop gdm
systemctl disable gdm
dnf -y install lightdm
systemctl enable lightdm

# Disable Fedora Gnome auto update
gsettings set org.gnome.software download-updates false

# Disable PackageKit from update
sudo /usr/bin/gpk-prefs
Select 'Never'

# =======================================================================================

# Install Microsoft SQL Server: https://docs.microsoft.com/en-us/sql/linux/sql-server-linux-setup-red-hat
sudo su
curl https://packages.microsoft.com/config/rhel/7/mssql-server.repo > /etc/yum.repos.d/mssql-server.repo
exit
sudo yum install -y mssql-server
sudo /opt/mssql/bin/sqlservr-setup
systemctl status mssql-server
sudo firewall-cmd --zone=public --add-port=1433/tcp --permanent
sudo firewall-cmd --reload
