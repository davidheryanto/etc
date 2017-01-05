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

Install CUDA: https://developer.nvidia.com/cuda-downloads
Add: /usr/local/cuda-8.0/lib64 to /etc/ld.so.conf (Alternative to LD_LIBRARY_PATH)
sudo ldconfig

# Install earlier version of gcc e.g. in Fedora 24 (install gcc 5, instead of using gcc 6)
# Make sure "make -j4" set -j to be max no of core because compiling gcc takes a long time 
# CUDA 8.0 not yet support gcc 6
Download gcc 5.4: https://gcc.gnu.org/gcc-5/
./contrib/download_prerequisites
./configure --prefix=/usr/local/gcc/5.4.0
make -j4
sudo make install

Add /usr/local/gcc/5.4.0/bin to PATH
Add /usr/local/gcc/5.4.0/lib64 to /etc/ld.so.conf 
sudo ldconfig 

# Install cuDNN https://developer.nvidia.com/rdp/cudnn-download
# After extracting the archive, copy these files from cuDNN
sudo cp lib64/* /usr/local/cuda/lib64/
sudo cp include/* /usr/local/cuda/include/
sudo ldconfig

# May give this error: ldconfig: /usr/local/cuda-8.0/lib64/libcudnn.so.5 is not a symbolic link
# Because there are identical libcudnn.so.5 and libcudnn.so.5.1.5
sudo mv /usr/local/cuda-8.0/lib64/libcudnn.so.5 /usr/local/cuda-8.0/lib64/libcudnn.so.5.bak
sudo ln -s /usr/local/cuda-8.0/lib64/libcudnn.so.5.1.5 /usr/local/cuda-8.0/lib64/libcudnn.so.5
sudo ldconfig 

# Theano configuration 
Flags to use gpu http://deeplearning.net/software/theano/install.html#using-the-gpu
Check if code can use gpu http://deeplearning.net/software/theano/tutorial/using_gpu.html

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
