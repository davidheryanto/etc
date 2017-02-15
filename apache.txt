# Protect directory with password
http://stackoverflow.com/questions/14073972/password-protect-my-website
https://www.digitalocean.com/community/tutorials/how-to-set-up-password-authentication-with-apache-on-ubuntu-14-04

# Set up virtual host, to run multiple websites
# https://www.kristengrote.com/blog/articles/how-to-set-up-virtual-hosts-using-wamp
Edit httpd.conf
Uncomment # Include conf/extra/httpd-vhosts.conf
Edit httpd.vhosts.conf (most likely in APACHE_HOME/conf/extra/)
-----------------------------------------
<Directory C:/Users/Kristen/Documents/Projects>
Order Deny,Allow   
Allow from all 
</Directory>

<VirtualHost *:80>   
DocumentRoot "C:\Users\Kristen\Documents\Projects\MySite" 
ServerName mysite.local 
</VirtualHost>t>
------------------------------------------

# Set AllowOverride
# /etc/httpd/conf/httpd.conf
http://stackoverflow.com/questions/18740419/how-to-set-allowoverride-all

# Alias and new syntax, use 'Require' vs 'Allow from'
# http://stackoverflow.com/questions/8204902/wamp-403-forbidden-message-on-windows-7
# Look for 'require local'
Example:
Alias /process_mining/ "C:/Users/David/Git/process_mining/" 

<Directory "C:/Users/David/Git/process_mining/">
Require local
</Directory>

# .htaccess rewrite, using subfolder as root document
# http://stackoverflow.com/questions/10642426/htaccess-rewrite-subdomain-to-directory
RewriteEngine on

RewriteCond %{HTTP_HOST} example.com$
RewriteCond %{REQUEST_URI} !^/subfolder
RewriteRule ^(.*)$ /subfolder/$1 [L] 

# To allow .htaccess, edit httpd.conf and under /var/www/html
# eg to allow permalinks, rewrite
AllowOverride All

# php.ini, config that normally needs to be changed
upload_max_filesize = 64M
memory_limit = 512M
post_max_size = 64M