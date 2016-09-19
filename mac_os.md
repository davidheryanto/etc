# Xcode add delete current line shortcut
http://stackoverflow.com/questions/551383/xcode-duplicate-delete-line

# Develop without Developer Program Membership
http://mhassan.me/2013/02/15/using-xcode-without-provisioning-profile/

in /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/Library/Xcode/Specifications/iPhoneCodeSign.xcspec, replace:

<key>CommandLine</key>
<string>codesign</string>

with:

<key>CommandLine</key>
<string>/usr/local/bin/ldid3.py</string>

then please use the "-gta" option again in your build settings.

# Xcode
Ctrl + 6 : go to method in current file
Cmd + Shift + O : Open file
Cmd + Ctrl + -> : Go back 

# Shared folder vmware
Make sure vmware tools installed (Look for darwin.iso)
Shared folder will be under /Volumes/

# updatedb for locate
sudo ln -s /usr/libexec/locate.updatedb /usr/local/bin/updatedb to make the updatedb

# Install brew
ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

# Install iStats for monitoring temperature, battery etc
sudo gem install iStats

# Menu Bar
Ctrl + F2

# Dock
Ctrl + F3

# Capture screenshot
Command + Shift + 
# Select area, copy to clipboard
Command + Ctrl + Shift + 4

# Add .xml citation to word
Export the references from Zotero to .bibtex
Open .bibtex file with JabRef, export to .xml for Word
Rename to Sources.xml
Move it to ~/Documents/Microsoft User Data

# Full screen mode
Control + Command + F

# Snap Application
BetterSnapTool

# Switch to other instances of an app
Command + `

# Create bootable Mac OS X
# http://www.macworld.com/article/2981585/operating-systems/how-to-make-a-bootable-os-x-10-11-el-capitan-installer-drive.html
sudo /Applications/Install\ OS\ X\ El\ Capitan.app/Contents/Resources/createinstallmedia --volume /Volumes/Untitled --applicationpath /Applications/Install\ OS\ X\ El\ Capitan.app --nointeraction