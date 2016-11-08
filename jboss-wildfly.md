# Enable debugging in Intellij
vim ./bin/standalone.conf
JAVA_OPTS="$JAVA_OPTS -agentlib:jdwp=transport=dt_socket,address=65092,suspend=n,server=y"

# Bind app and management to any IP
./standalone.sh -b=0.0.0.0 -bmanagement=0.0.0.0

# Use custom configuration file
# Create standalone-custom.xml at standalone/configuration
./standalone.bat -c standalone-custom.xml

# Enable gzip compression. Edit standalone-custom.xml (create one if not exists)
# http://dimaki.blogspot.sg/2014/12/how-to-enable-gzip-compression-in.html
<server name="default-server">
<host name="default-host" alias="localhost">
    <filter-ref name="gzipFilter" predicate="exists['%{o,Content-Type}'] and regex[pattern='(?:application/javascript|text/css|text/html|text/xml|application/json)(;.*)?', value=%{o,Content-Type}, full-match=true]"/>
    <filter-ref name="Vary-header"/>
</host>
</server>
<filters>
    <gzip name="gzipFilter"/>
    <response-header name="Vary-header" header-name="Vary" header-value="Accept-Encoding"/>
</filters>

# Undertow web server: Serve static files
# http://stackoverflow.com/questions/22684037/how-to-configure-wildfly-to-serve-static-content-like-images 
<server name="default-server">
    <http-listener name="default" socket-binding="http"/>
    <host name="default-host" alias="localhost">
        <location name="/" handler="welcome-content"/>
        <location name="/img" handler="images"/>
    </host>
</server>
<handlers>
    <file name="welcome-content" path="${jboss.home.dir}/welcome-content" directory-listing="true"/>
    <file name="images" path="/var/images" directory-listing="true"/>
</handlers>

# Use SSL with automatically generated cert 
# Sometimes enable-http2="false", else Chrome will think its insecure
<security-realm name="ApplicationRealm">
    <server-identities>
        <ssl>
            <keystore path="application.keystore" relative-to="jboss.server.config.dir" keystore-password="password" alias="server" key-password="password" generate-self-signed-certificate-host="localhost"/>
        </ssl>
    </server-identities>
</security-realm>

<server name="default-server">
<https-listener name="https" socket-binding="https" security-realm="ApplicationRealm" enable-http2="false"/>
<server>