# MySQL Community Server 5.7 Setup on Fedora 24

## Installation
1. Download and install MySQL Community Server  
   http://dev.mysql.com/get/Downloads/MySQL-5.7/mysql-5.7.14-1.fc24.x86_64.rpm-bundle.tar
2. Change to root: `sudo su -`. Retrieve the temporary password  
   `grep 'temporary password' /var/log/mysqld.log`
3. `mysql_secure_installation`  
   Modify root password and follow the recommended configuration (e.g. remove anonymous users etc.)
4. Save password to .mylogin.cnf so we no need to remember password. Since .mylogin.cnf can only be accessed by root, it should be pretty safe to use this approach.  
   `mysql_config_editor set -h localhost -u root -p`

## Secure Configuration
> Following CIS Security Benchmarks for MySQL 5.7 Community  
> https://benchmarks.cisecurity.org/community/editors/groups/single/?group=mysql

### Level 1 Profile

### 1 Operating System Level Configuration

#### 1.1 Place Databases on Non-System Partitions (Scored)
Assumptions:
- databases will be stored at /data/mysql
- /data/mysql is mounted on non-system partition
- current datadir is /var/lib/mysql
```
systemctl stop mysqld
cp -r /var/lib/mysql /data/mysql
chmod 700 /data/mysql
chown mysql:mysql /data/mysql
# Set datadir=/data/mysql
vim /etc/my.cnf
# Verify the original SELinux context is mysqld_db_t
ls -lZ /var/lib/mysql
semanage fcontext -a -t mysqld_db_t "/data/mysql(/.*)?"
restorecon -R -v /data/mysql
```

Check:
```
show variables where variable_name = 'datadir';
df -h <datadir Value>
```

Output of df should **NOT** include ('/'), "/var", or "/usr".

#### 1.2 Use Dedicated Least Privileged Account for MySQL Daemon/Service (Scored)
```
ps -ef | egrep "^mysql.*$"
```

If no lines are returned, then this is a finding.

#### 1.4 Verify That the MYSQL_PWD Environment Variables Is Not In Use (Scored)
```
grep MYSQL_PWD /proc/*/environ
```

This may return one entry for the process which is executing the grep command.

#### 1.6 Verify That 'MYSQL_PWD' Is Not Set In Users' Profiles (Scored)
```
grep MYSQL_PWD /home/*/.{bashrc,profile,bash_profile}
```

### 2 Backup and Disaster Recovery

#### 2.1.1 Backup policy in place (Not Scored)
- Check with "crontab -l" if there is a backup schedule.  
- Remember to backup database `mysql` as well.

Create the backup script `backup-mysql-db.sh`:
```
#! /usr/bin/bash

declare -a databases=("mysql" "information_schema")

for db in "${databases[@]}"
do
  /usr/bin/mysqldump --routines "$db" > /data/backup/mysql/"$db"_$(date +%Y-%m-%d.sql)
  chmod 600 /data/backup/mysql/"$db"_$(date +%Y-%m-%d.sql)
  chown root:root /data/backup/mysql/"$db"_$(date +%Y-%m-%d.sql)
done
```

Add a cron job (make sure end with a newline):
```
# E.g. run mysqldump once a month
# 0 0 1 * * /root/utils/backup-mysql.sh 
crontab -e
```

#### 2.1.2 Verify backups are good (Not Scored)
- Validate backups regularly.
- Try executing cron jobs at specific time, and check that the dump is created.

#### 2.1.3 Secure backup credentials (Not Scored)
- Credentials for user performing backup should be secure, e.g. use private key instead of password to login.

#### 2.1.4 The backups should be properly secured (Not Scored)
- Check file permission and owner of backup files.  
  Cron job creating the backup should set permission to 0600 and owner to root (or appropriate user).
- Consider also encrypting the backup files.

#### 2.1.6 Disaster recovery plan (Not Scored)
- How to perform the recovery: Using slave, offsite backups.
  - `mysql {destination_db} < {backup.sql}`
  - Check the indexes and table content (eyeballing)
- State the estimated backup time.

#### 2.1.7 Backup of configuration and related files (Not Scored)
Create the backup script `backup-mysql-conf.sh`:
```
#! /usr/bin/bash

cp /etc/my.cnf /data/backup/mysql/my.cnf_$(date +%Y-%m-%d.sql)
chmod 600 /data/backup/mysql/my.cnf_$(date +%Y-%m-%d.sql)
chown root:root /data/backup/mysql/my.cnf_$(date +%Y-%m-%d.sql)
```
Add a cron job (make sure end with a newline):
```
0 0 1 * * /root/utils/backup-mysql-conf.sh 
```

#### 2.2 Dedicate Machine Running MySQL (Not Scored)
- Reduce the attack surface.
- Run only MySQL related services and minimize the number of services and applications running.

#### 2.3 Do Not Specify Passwords in Command Line (Not Scored)
Check that password is not entered in plain text
```
history | grep ".*mysql -p.*"
history | grep ".*mysql --password.*"
```

#### 2.4 Do Not Reuse Usernames (Not Scored)
Each user should be linked to **ONE** of these:
- system accounts
- a person
- an application

Check the grants for each user:
```
SELECT Host,User FROM mysql.user;
SHOW GRANTS FOR '{user}'@'{host}'
```

#### 2.6 Set a Password Expiry Policy for Specific Users (Not Scored)
```
SELECT user, host, password_lifetime from mysql.user where password_lifetime IS NULL;
```
To add password expiry to a user:
```
ALTER USER 'jeffrey'@'localhost' PASSWORD EXPIRE INTERVAL 90 DAY;
```

### 3 File System Permissions

#### 3.1 Ensure 'datadir' Has Appropriate Permissions (Scored)
```
# After ------, \. is added (corresponds to ACL, original command does not include \. )
# For symlink, need to use ls -lH <datadir>/..
ls -l <datadir>/.. | egrep "^d[r|w|x]{3}------\.\s*.\s*mysql\s*mysql\s*\d*.*mysql"
```
Lack of output implies a finding.

#### 3.2 Ensure 'log_bin_basename' Files Have Appropriate Permissions (Scored)
Limiting the accessibility of log objects (*binary log, error log, slow query log, relay log, and general log*) will protect the confidentiality, integrity, and availability of the MySQL logs.
```
# Identify the basename of binary log files
show variables like 'log_bin_basename';
# Verify permissions are 660 for mysql:mysql on each log file of the form log_bin_basename.nnnnnn.
chmod 660 <log file>
chown mysql:mysql <log file>
```

#### 3.3 Ensure 'log_error' Has Appropriate Permissions (Scored)
```
# Find the log_error value
show global variables like 'log_error';
# Verify permissions are 660 for mysql:mysql for `error_log_path`
chmod 660 {<log file>}
chown mysql:mysql <log file>
```

#### 3.4 Ensure 'slow_query_log' Has Appropriate Permissions (Scored)
```
show variables like 'slow_query_log_file';
chmod 660 <log file>
chown mysql:mysql <log file>
```

#### 3.5 Ensure 'relay_log_basename' Files Have Appropriate Permissions (Scored)
```
show variables like 'relay_log_basename';
chmod 660 <log file>
chown mysql:mysql <log file>
```

#### 3.6 Ensure 'general_log_file' Has Appropriate Permissions (Scored)
```
show variables like 'general_log_file';
chmod 660 <log file>
chown mysql:mysql <log file>
```

#### 3.7 Ensure SSL Key Files Have Appropriate Permissions (Scored)
```
show variables where variable_name = 'ssl_key';
ls -l <ssl_key Value> | egrep "^-r--------\.[ \t]*.[ \t]*mysql[ \t]*mysql.*$"
```
Lack of output from the above command implies a finding.

#### 3.8 Ensure Plugin Directory Has Appropriate Permissions (Scored)
```
show variables where variable_name = 'plugin_dir';
# Or use 755
chmod 775 <plugin_dir Value>
chown mysql:mysql <plugin_dir Value>
```

### 4 General

#### 4.1 Ensure Latest Security Patches Are Applied (Not Scored)
```
SHOW VARIABLES WHERE Variable_name LIKE "version";
```
Compare the version with the security announcements from Oracle

#### 4.2 Ensure the 'test' Database Is Not Installed (Scored)
```
SHOW DATABASES LIKE 'test';
# If exists
DROP DATABASE 'test';
```

#### 4.4 Ensure 'local_infile' Is Disabled (Scored)
The local_infile parameter dictates whether files located on the MySQL client's computer can be loaded or selected via LOAD DATA INFILE or SELECT local_file.

Disabling local_infile reduces an attacker's ability to read sensitive files off the affected server via a SQL injection vulnerability.

```
SHOW VARIABLES WHERE Variable_name = 'local_infile';
# Make sure the value is OFF
# If ON, edit my.cnf, add local-infile=0
```

#### 4.5 Ensure 'mysqld' Is Not Started with '-­‐-­‐skip-­‐grant-­‐tables' (Scored)
```
vim /etc/my.cnf
# Set the following
[mysqld]
skip-grant-tables = FALSE
```

#### 4.6 Ensure '-­‐-­‐skip-­‐symbolic-­‐links' Is Enabled (Scored)
```
SHOW variables LIKE 'have_symlink';
```
Make sure value is DISABLED, otherwise:
```
vim /etc/my.cnf
[mysqld]
skip_symbolic_links = YES
```

#### 4.7 Ensure the 'daemon_memcached' Plugin Is Disabled (Scored)
```
SELECT * FROM information_schema.plugins WHERE PLUGIN_NAME='daemon_memcached';
```
Ensure that no rows are returned. Otherwise:
```
mysql> uninstall plugin daemon_memcached;
```

#### 4.8 Ensure 'secure_file_priv' Is Not Empty (Scored)
```
SHOW GLOBAL VARIABLES WHERE Variable_name = 'secure_file_priv' AND Value<>'';
```
Ensure one row is returned. Otherwise:
```
vim /etc/my.cnf
[mysqld]
secure_file_priv=<path_to_load_directory>
```

### 5 MySQL Permissions

#### 5.1 Ensure Only Administrative Users Have Full Database Access (Scored)
```
SELECT user, host FROM mysql.user WHERE (Select_priv = 'Y') OR (Insert_priv = 'Y') OR (Update_priv = 'Y') OR (Delete_priv = 'Y') OR (Create_priv = 'Y') OR (Drop_priv = 'Y');

SELECT user, host FROM mysql.db WHERE db = 'mysql' AND ((Select_priv = 'Y') OR (Insert_priv = 'Y') OR (Update_priv = 'Y') OR (Delete_priv = 'Y') OR (Create_priv = 'Y') OR (Drop_priv = 'Y'));
```
Ensure all users returned are administrative users. Otherwise:

1. Enumerate non-­‐administrative users resulting from the audit procedure
2. For each non-­‐administrative user, use the REVOKE statement to remove privileges as appropriate

#### 5.2 Ensure 'file_priv' Is Not Set to 'Y' for Non-­‐Administrative Users (Scored)
```
select user, host from mysql.user where File_priv = 'Y';
```
Ensure only administrative users are returned in the result set. Otherwise:

1. Enumerate the non-administrative users found in the result set of the audit procedure
2. For each user, issue the following SQL statement:
   `REVOKE FILE ON *.* FROM '<user>';`

#### 5.4 Ensure 'super_priv' Is Not Set to 'Y' for Non-Administrative Users (Scored)
```
select user, host from mysql.user where Super_priv = 'Y';
```
Ensure only administrative users are returned in the result set.  
Otherwise, for each non-admin user: `REVOKE SUPER ON *.* FROM '<user>';`

#### 5.5 Ensure 'shutdown_priv' Is Not Set to 'Y' for Non-Administrative Users (Scored)
```
SELECT user, host FROM mysql.user WHERE Shutdown_priv = 'Y';
```
Ensure only administrative users are returned in the result set.  
Otherwise, for each non-admin user: `REVOKE SHUTDOWN ON *.* FROM '<user>';`

#### 5.6 Ensure 'create_user_priv' Is Not Set to 'Y' for Non-Administrative Users (Scored)
```
SELECT user, host FROM mysql.user WHERE Create_user_priv = 'Y';
```
Ensure only administrative users are returned in the result set.  
Otherwise, for each non-admin user: `REVOKE CREATE USER ON *.* FROM '<user>';`

#### 5.7 Ensure 'grant_priv' Is Not Set to 'Y' for Non-Administrative Users (Scored)
```
SELECT user, host FROM mysql.user WHERE Grant_priv = 'Y'; SELECT user, host FROM mysql.db WHERE Grant_priv = 'Y';
```
Ensure only administrative users are returned in the result set.  
Otherwise, for each non-admin user: `REVOKE GRANT OPTION ON *.* FROM <user>;`

#### 5.8 Ensure 'repl_slave_priv' Is Not Set to 'Y' for Non‐Slave Users (Scored)
```
SELECT user, host FROM mysql.user WHERE Repl_slave_priv = 'Y';
```
Ensure only accounts designated for slave users are granted this privilege.  
Otherwise, for each non-slave user `REVOKE REPLICATION SLAVE ON *.* FROM <user>;`

#### 5.9 Ensure DML/DDL Grants Are Limited to Specific Databases and Users (Scored)
```
SELECT User,Host,Db FROM mysql.db
WHERE Select_priv='Y' OR Insert_priv='Y' OR Update_priv='Y'
OR Delete_priv='Y' OR Create_priv='Y' OR Drop_priv='Y'
OR Alter_priv='Y';
```
Ensure all users returned should have these privileges on the indicated databases.

Otherwise, enumerate the unauthorized `users`, `hosts`, and `databases` in the result set. For each user:
```
REVOKE SELECT ON <host>.<database> FROM <user>;   
REVOKE INSERT ON <host>.<database> FROM <user>;
REVOKE UPDATE ON <host>.<database> FROM <user>;
REVOKE DELETE ON <host>.<database> FROM <user>;
REVOKE CREATE ON <host>.<database> FROM <user>;
REVOKE DROP ON <host>.<database> FROM <user>;
REVOKE ALTER ON <host>.<database> FROM <user>;
```

### 6 Auditing and Logging

#### 6.1 Ensure 'log_error' Is Not Empty (Scored)
```
SHOW variables LIKE 'log_error';
```
Otherwise, edit my.cnf, set `log-error` variable.  
http://dev.mysql.com/doc/refman/5.7/en/error-­‐log.html

#### 6.2