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

# Get JBOSS_HOME
System.out.println("JBoss Home: " + System.getProperty("jboss.home.dir"));