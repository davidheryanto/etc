# Gradle compile dependencies
compile 'com.orientechnologies:orientdb-core:2.1.12'
compile 'com.orientechnologies:orientdb-graphdb:2.1.12'

# Enable CORS
# http://stackoverflow.com/questions/27612752/building-web-app-using-orientdb-javascript-api
Add:
<parameter name="network.http.additionalResponseHeaders" value="Access-Control-Allow-Origin: * ;Access-Control-Allow-Credentials: true;Access-Control-Allow-Headers: Content-Type;Access-Control-Allow-Methods: POST, GET, DELETE, HEAD, OPTION" />

After:
<parameter value="utf-8" name="network.http.charset"/>

# Connect via console
CONNECT remote:hostname/db1 root my_root_password

# Connect to graph
OrientGraphFactory graphFactory = new OrientGraphFactory("remote:hostname/db1", "root", "password").setupPool(1, 10);
OrientGraph graph = graphFactory.getTx();

# Default datetime format yyyy-MM-dd HH:mm:ss
# Set datetime format
alter database DATETIMEFORMAT "yyyyMMddHHmmss"
ALTER DATABASE DATEFORMAT "dd MMMM yyyy"

# Backup from bin/ folder
./backup.sh plocal:../databases/mydb admin admin /destination/folder/mydb.zip
# Restore from console
orientdb> create database plocal:../databases/mydb
orientdb> restore database /backup/folder/mydb.zip

# Gradle integration
# Must add these dependencies in CORRECT ORDER 
dependencies {
    compile group: 'com.orientechnologies', name: 'orientdb-client', version: '2.2.11'
    compile group: 'com.orientechnologies', name: 'orientdb-core', version: '2.2.11'
    compile group: 'com.orientechnologies', name: 'orientdb-graphdb', version: '2.2.11'
}

# Change server password from console
# http://orientdb.com/docs/2.1/Server-Security.html 
SET SERVER USER <serveruser> <password> <userpermission>

# Connect to a database 
CONNECT remote:localhost/my_database root rootpassword

# Create database user 
INSERT INTO OUser SET name = 'admin', 
          password = 'my-admin_password', status = 'ACTIVE', 
          rules = ( SELECT FROM ORole WHERE name = 'admin' )
# Update database USER password
UPDATE OUser SET password = 'my-new-pass' WHERE name = 'admin'