# Simple authentication
<?php
    if (!isset($_SERVER['PHP_AUTH_USER'])) {
        header("WWW-Authenticate: Basic realm=\"Private Area\"");
        header("HTTP/1.0 401 Unauthorized");
        print "Sorry - you need valid credentials to be granted access!\n";
        exit;
    } else {
        if (($_SERVER['PHP_AUTH_USER'] == 'paul') && ($_SERVER['PHP_AUTH_PW'] == 'hudson')) {
            print "Welcome to the private area!";
        } else {
            header("WWW-Authenticate: Basic realm=\"Private Area\"");
            header("HTTP/1.0 401 Unauthorized");
            print "Sorry - you need valid credentials to be granted access!\n";
            exit;
        }
    }
?>

# Change upload size limit
# http://stackoverflow.com/questions/2184513/php-change-the-maximum-upload-file-size
; Maximum allowed size for uploaded files.
upload_max_filesize = 40M

; Must be greater than or equal to upload_max_filesize
post_max_size = 40M