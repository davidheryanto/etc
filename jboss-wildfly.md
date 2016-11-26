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

# Log all requests
# Edit standalone-custom.xml
<server name="default-server">
       ...
      <host name="default-host" alias="localhost">
          .....
          <filter-ref name="request-dumper"/>
      </host>
 </server>

 <filters>
    .....
    <filter name="request-dumper" class-name="io.undertow.server.handlers.RequestDumpingHandler" module="io.undertow.core" />
</filters
# More concise log: https://mirocupak.com/logging-requests-with-undertow/
# Pattern list: https://github.com/undertow-io/undertow/blob/master/core/src/main/java/io/undertow/server/handlers/accesslog/AccessLogHandler.java
<host name="default-host" alias="localhost">
    ...
    <access-log use-server-log="true" 
        pattern="%h %t &quot;%r&quot; %s &quot;%{i,User-Agent}&quot;"/>
    ...
</host>
# Pattern example 
<access-log use-server-log="true" pattern="%n%h: %U %q %T sec [%B bytes]"/>
# To enable %D or %T (Time taken to process the request) 
# https://kb.novaordis.com/index.php/Undertow_WildFly_Subsystem_Configuration_-_access-log
<server name="default-server" >
    <http-listener name="http" ... record-request-start-time="true"/>
    <ajp-listener name="ajp" ... record-request-start-time="true"/>
    ...
</server>

# Install a new module e.g. MySQLConnector/J 
mkdir -p $JBOSS_HOME/modules/system/layers/base/com/mysql/main
cp Downloads/mysql-connector-java-5.1.40.jar $JBOSS_HOME/modules/system/layers/base/com/mysql/main/
vim $JBOSS_HOME/modules/system/layers/base/com/mysql/main/module.xml
<module xmlns="urn:jboss:module:1.3" name="com.mysql">
  <resources>
    <resource-root path="mysql-connector-java-5.1.40.jar"/>
  </resources>
  <dependencies>
    <module name="javax.api"/>
    <module name="javax.transaction.api"/>
  </dependencies>
</module>

# Configure datasource 
<datasource jndi-name="java:jboss/datasources/MySqlDS" pool-name="MySqlDS_Pool" enabled="true" jta="true" use-java-context="true" use-ccm="true">
  <connection-url>jdbc:mysql://localhost:3306/MyDB</connection-url>
  <driver>mysql</driver>
  <pool />
  <security>
    <user-name>jboss</user-name>
    <password>jboss</password>
  </security>
  <statement/>
  <timeout>
    <idle-timeout-minutes>0</idle-timeout-minutes>
    <query-timeout>600</query-timeout>
  </timeout>
</datasource>

# Configure pool 
<pool>
  <min-pool-size>10</min-pool-size>
  <max-pool-size>50</max-pool-size>
  <prefill>true</prefill>
  <use-strict-min>true</use-strict-min>
  <flush-strategy>FailingConnectionOnly</flush-strategy>
</pool>

# Configure statement cache. 'track-statements': automatic closing of statements and ResultSets
<statement>
  <track-statements>true</track-statements>
  <prepared-statement-cache-size>10</prepared-statement-cache-size>
  <share-prepared-statements/>
</statement>

# Check that JNDI is configured correctly 
NamingEnumeration<NameClassPair> list = ctx.list("java:jboss/datasources");
while (list.hasMore()) {
    System.out.println(list.next().getName());
}