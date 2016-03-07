# Install Acrobat Reader 11
# -------------------------------------------------------
# Install winetricks
wget  https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks
chmod +x winetricks
sudo mv winetricks /usr/bin/

# Run in 32-bit mode
printf "\n# Wine\nexport WINEARCH=win32\n" >> ~/.bash_profile
source ~/.bash_profile

# Install winetricks packages
sudo dnf -y install cabextract
winetricks atmlib 
winetricks riched20 
winetricks wsh5ca7 
winetricks mspatcha

# Get Adobe Reader 11
cd ~/Downloads
wget https://www.dropbox.com/s/ogon7ng3ilrylnm/AdbeRdr11008_en_US.exe?dl=0
mv AdbeRdr11008_en_US.exe?dl=0 AdbeRdr11008_en_US.exe
wine AdbeRdr11008_en_US.exe 
# When opening: Always open in protected mode disabled
# -------------------------------------------------------
