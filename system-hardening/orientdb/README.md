OrientDB 2.2x Setup
===================

## Authentication
- Change default password for reader and writer
```
orientdb>

UPDATE OUser SET password = 'hello' WHERE name = 'reader'
UPDATE OUser SET password = 'hello' WHERE name = 'reader'
```

## Configuration
- Edit `orientdb-server-config.xml`
```
<properties>
    # Change database location
  <entry name="server.database.path" value="/data/databases/orientdb"/>
</properties>

<listeners>
  # Use only one port rather than a 'range' of ports for better security
  # Specify ip-address to be a specific host like 192.168.47.129 so can only be accesed by local network
  <listener protocol="binary" socket="default" port-range="2424" ip-address="192.168.47.129"/>
  <listener protocol="http" socket="default" port-range="2480" ip-address="192.168.47.129">
</listeners>
```

- Edit `hazelcast.xml`. Hazelcast is the library used for the distributed communication.
```
<network>
    # Use only one port rather than a 'range' of ports for better security
  <port auto-increment="false">2434</port>
  
  # Sometimes there are multiple interfaces and hazelcast chooses the wrong one
  # Set it manually
  <interfaces enabled="true">
    <interface>10.152.68.*</interface>   
  </interfaces>    
</network>
```

- Edit `server.sh`
```
# Increase JVM max heap
ORIENTDB_OPTS_MEMORY="-Xms512m -Xmx4g"
```

- Files permission
```
# Allow only the owner (orientdb) to access config folder
chmod 700 config
cd config
find * -type d -print0 | xargs -0 chmod 0700  # For directories in config
find . -type f -print0 | xargs -0 chmod 0600  # For files in config
```

- Firewall configuration
```
# Open required ports (hazelcast requires udp)
# Check configuration and active zone
firewall-cmd --list-all  
sudo firewall-cmd --zone=public --permanent --add-port=2434/tcp
sudo firewall-cmd --zone=public --permanent --add-port=2434/udp 
sudo firewall-cmd --zone=public --permanent --add-port=2424/tcp
sudo firewall-cmd --zone=public --permanent --add-port=2480/tcp
```

- Environment variables `~/.bash_profile`
```
ORIENTDB_HOME=/opt/orientdb

EXPORT ORIENTDB_HOME
```
## Starting up
- Start the server in distributed mode `./dserver.sh`
- Set `password` and `node name` 
- Save the credentials to `~/.orientdb.credentials` just in case
```
server.root.password=myserverpassword
database.admin.password=mydatabasepassword
```
- `chmod 600 ~/.orientdb.credentials`

## Add orientdb.service

Create `/usr/lib/systemd/system/orientdb-server.service`
```
[Unit]
Description=OrientDB Server

[Service]
WorkingDirectory=/opt/orientdb/bin
Type=simple
ExecStart=/opt/orientdb/bin/dserver.sh
User=orientdb

[Install]
WantedBy=multi-user.target
```

```
# Start the service
sudo systemctl start orientdb-server && systemctl status orientdb-server
# Start the service at boot time
sudo systemctl enable orientdb-server
```

## Logging with `journalctl`
- Check for correct timezone `timedatectl status`
- Edit `/etc/systemd/journald.conf`
```
# Make logs persistent
[Journal]
Storage=persistent
SystemMaxUse=500M
```
- To view the log from orientdb in real time `journalctl -f -u orientdb-server`  

## Setup other nodes
### Current Issues
- Lucene index cannot be replicated currently (from standalone to distributed). Need to delete the index before copying to different nodes then *recreate* the index.  
![todo](http://www.maniacworld.com/lazy-cat.jpg)

## Setup OrientDB Workbench
- Edit `orientdb-server-config.xml` and `workbench-config.xml`
```
# Use one port rather than a range of ports
<listener protocol="http" port-range="2491" ip-address="0.0.0.0">
```
- Open port for workbench
`sudo firewall-cmd --zone=public --permanent --add-port=2491/tcp`
- Secure config folder
```
chmod 700 config
cd config
find . -type f -print0 | xargs -0 chmod 0600  # For files in config
```

## Add orientdb-workbench.service
Create `/usr/lib/systemd/system/orientdb-workbench.service`
```
[Unit]
Description=OrientDB Workbench

[Service]
WorkingDirectory=/opt/orientdb-workbench/bin
Type=simple
ExecStart=/opt/orientdb-workbench/bin/start-workbench.sh
User=orientdb
Group=orientdb

[Install]
WantedBy=multi-user.target
```
```
# Start progress
sudo systemctl start orientdb-workbench && systemctl status orientdb-workbench
# Default user and password is 'admin'
sudo systemctl enable orientdb-workbench
```

```
# Check hazelcast.xml for details (group-name, group-password ...) in adding cluster in workbench
# Guide: 
# http://orientdb.com/enterprise/last/userguide.html
# http://orientdb.com/enterprise/last/gettingstarted.html
```