# Loop with step
for i {0..10..2}
do
  ..
done

# Pad zero in string
n=1
wget http://aolradio.podcast.aol.com/sn/SN-`printf %03d $n`.mp3

# Run command or get env var
${HOME}
$(echo foo)

# Brace expansion 
# http://unix.stackexchange.com/questions/315963/bash-command-to-copy-before-cursor-and-paste-after
echo a{b,c,d{e,f,g}}
ab ac ade adf adg