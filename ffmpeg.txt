# Show file info
ffprobe -show_streams -i "file.mp4"

# Speed up
ffmpeg -i input.mkv -filter:v "setpts=0.5*PTS" output.mkv
# Smoother set -> increase frame rate
ffmpeg -i input.mkv -r 16 -filter:v "setpts=0.125*PTS" -an output.mkv
# Speed up both video and audio
ffmpeg -i input.mp4 -filter_complex "[0:v]setpts=2/3*PTS[v];[0:a]atempo=1.5[a]" -map "[v]" -map "[a]" output.mp4

# Increase audio vol
ffmpeg -i input.wav -af 'volume=2.0' output.wav

# Increase audio vol of video and denoise, strict allows aac
ffmpeg -i input.mp4 -vcodec copy -af "volume=+23.0dB, highpass=f=800, lowpass=f=2800" -strict -2 output.mp4

# Speed up, increase vol
ffmpeg -i input.mp4 -filter_complex "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0,volume=+23.0dB[a]" -map "[v]" -map "[a]" -strict -2 output.mp4

# Speed up, increase vol, scale
ffmpeg -i input.mp4 -filter_complex "[0:v]setpts=0.625*PTS,scale=640:trunc(ow/a/2)*2[v];[0:a]atempo=1.6,volume=3.0[a]" -map "[v]" -map "[a]" output.mp4

# Convert video format to mp4, increase & filter audio
# http://andrebluehs.net/blog/converting-avi-to-mp4-with-ffmpeg/
ffmpeg -i input.avi -acodec aac -b:a 128k  -strict -2 -vcodec mpeg4 -b:v 1200k -flags +aic+mv4 -af "volume=+23.0dB, highpass=f=1000, lowpass=f=3000" output.mp4

# Change container from flv to mp4
ffmpeg -i input.flv -c copy -copyts output.mp4

# Batch convert script (Assume videos is in current dir)
Get-ChildItem -Filter *.mp4 | Foreach-Object {
	$out = 'FAST_' + $_.BaseName + '.mp4'
	echo $out
	ffmpeg -i $_.FullName -filter_complex "[0:v]setpts=0.625*PTS,scale=640:trunc(ow/a/2)*2[v];[0:a]atempo=1.6,volume=3.0[a]" -map "[v]" -map "[a]" $out
}

# Add subtitle
http://superuser.com/questions/549179/using-ffmpeg-to-add-subtitles-to-a-m4v-video-file
ffmpeg -i input.m4v -i subtitle.srt -map 0 -map 1 -c copy -c:s mov_text output.m4v