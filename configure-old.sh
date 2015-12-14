#!/usr/bin/bash
# Startup config after fresh install Fedora
sudo dnf -y install gcc gcc-c++ vim htop gnome-tweak-tool kdiff3 git nethogs mlocate unar rsync wine

sudo dnf -y install http://www.infinality.net/fedora/linux/20/noarch/fontconfig-infinality-1-20130104_1.noarch.rpm http://www.infinality.net/fedora/linux/20/x86_64/freetype-infinality-2.4.12-1.20130514_01.fc18.x86_64.rpm

gsettings set org.gnome.software download-updates false

git config --global user.name "David Heryanto"; git config --global user.email david.heryanto@hotmail.com
git config --global push.default simple
git config --global merge.tool kdiff3

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
