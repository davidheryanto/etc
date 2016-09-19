# Hide tool panes by default as of May 2015
# https://forums.adobe.com/message/7544218#7544218
Edit C:\Program Files (x86)\Adobe\Acrobat DC\Acrobat\AcroApp\ENU\Viewer.aapp
Remove everything inside <Application> </Application> i.e. becomes:

	<Application xmlns="http://ns.adobe.com/acrobat/app/2014" title="Viewer" id="Viewer" majorVersion="1" requiresDoc="true" minorVersion="0">
	</Application>

# Then to show the Page Thumbnails or Bookmarks etc in Navigation Panes:
Press F4