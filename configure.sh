sudo sh -c 'printf "\n%%wheel        ALL=(ALL)       NOPASSWD: ALL  # sudo no passwd\n" >> /etc/sudoers'

# Startup config after fresh install Fedora
sudo dnf -y install gcc wget gcc-c++ gcc-gfortran vim htop gnome-tweak-tool kdiff3 git nethogs mlocate unar rsync wine system-config-printer

sudo dnf -y install http://www.infinality.net/fedora/linux/20/noarch/fontconfig-infinality-1-20130104_1.noarch.rpm http://www.infinality.net/fedora/linux/20/x86_64/freetype-infinality-2.4.12-1.20130514_01.fc18.x86_64.rpm; echo 4 | sudo /etc/fonts/infinality/infctl.sh setstyle

sudo dnf -y install http://download1.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-23.noarch.rpm http://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-23.noarch.rpm
sudo dnf -y install vlc

git config --global user.name "David Heryanto"; git config --global user.email david.heryanto@hotmail.com
git config --global push.default simple
git config --global merge.tool kdiff3

sudo updatedb

:" 

EXTRA
===========

Wallpaper:
https://www.dropbox.com/sh/w3mtnr9xv2veixp/AAB3h4oSSmnKQ6vQ-yeZuaDFa?dl=0

sudo /etc/fonts/infinality/infctl.sh setstyle
dconf-editor: 
	- org.gnome.desktop.interface: enable-animations=false
git config --global user.name \"David Heryanto\"; git config --global user.email david.heryanto@hotmail

vim /home/davidheryanto/.ipython/profile_default/static/custom/custom.css
pre {
	font-size: 9pt !important;
}
#notebook-container {
	width: 100%;
}
.smalltooltip {
	height: 300px;
}
.bigtooltip {
    height: 300px;
}

vim ~/.ipython/profile_default/ipython_config.py
c = get_config()
c.InteractiveShellApp.exec_lines = [
    'import numpy as np',
    'import matplotlib.pyplot as plt',
    'import pylab',
    '%matplotlib inline',
]
c.NotebookApp.open_browser = False
# c.NotebookApp.ip = '*'

"
