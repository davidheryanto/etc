#!/usr/bin/bash
# Startup config after fresh install Fedora
sudo dnf -y install gcc gcc-c++ vim htop
sudo dnf -y install kernel-devel-`uname -r` kernel-headers-`uname -r`
sudo dnf -y install http://dl.fedoraproject.org/pub/epel/7/x86_64/e/epel-release-7-5.noarch.rpm
sudo dnf -y install http://li.nux.ro/download/nux/dextop/el7/x86_64/nux-dextop-release-0-5.el7.nux.noarch.rpm
sudo dnf -y install http://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-21.noarch.rpm
gsettings set org.gnome.software download-updates false
sudo dnf -y install gnome-tweak-tool dconf-editor youtube-dl freetype-infinality kdiff3
sudo dnf -y install firewall-config ImageMagick
git config --global merge.tool kdiff3
git config --global push.default simple
mkdir ~/.bash
cd ~/.bash
git clone git://github.com/jimeh/git-aware-prompt.git
echo 'if ! [ -z "$PS1" ]; then
  export GITAWAREPROMPT=~/.bash/git-aware-prompt
  source $GITAWAREPROMPT/main.sh
  export PS1="\u@\h \W \[$txtcyn\]\$git_branch\[$txtred\]\$git_dirty\[$txtrst\]\$ "
fi' >> ~/.bashrc
sudo dnf -y install libgnome
gsettings set org.gnome.desktop.interface document-font-name 'Sans 10'
gsettings set org.gnome.desktop.interface font-name 'Cantarell 10'
gsettings set org.gnome.desktop.interface monospace-font-name 'Monospace 9'
gsettings set org.gnome.nautilus.preferences default-folder-viewer 'list-view'
gsettings set org.gnome.nautilus.preferences always-use-location-entry true

:" EXTRA
===========
sudo /etc/fonts/infinality/infctl.sh setstyle
dconf-editor: 
	- org.gnome.desktop.interface: enable-animations=false
git config --global user.name "David Heryanto"; git config --global user.email david.heryanto@hotmail

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
