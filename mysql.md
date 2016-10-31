# Create user and grant permission
# https://www.digitalocean.com/community/tutorials/how-to-create-a-new-user-and-grant-permissions-in-mysql
CREATE USER 'newuser'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON *.* TO 'newuser'@'localhost';
FLUSH PRIVILEGES;

# Erorr: MySql server has gone away
# http://stackoverflow.com/questions/12425287/mysql-server-has-gone-away-when-importing-large-sql-file
# Modify my.ini
SET GLOBAL max_allowed_packet=1024M;

# Backup database with mysqldump
# http://stackoverflow.com/questions/13484667/downloading-mysql-dump-from-command-line
$ mysqldump -u [uname] -p db_name > db_backup.sql
$ mysqldump -u [uname] -p db_name | gzip > db_backup.sql.gz
# Only specific table
# http://dba.stackexchange.com/questions/9306/how-do-you-mysqldump-specific-tables
mysqldump -u... -p... mydb t1 t2 t3 > mydb_tables.sql

# Restore this way
# http://stackoverflow.com/questions/105776/how-do-i-restore-a-mysql-dump-file
mysql> create database mydb;
mysql> use mydb;
mysql> source db_backup.dump;
# Alternatively
mysql < backup.sql

# Speed up restore mysqldump
# http://stackoverflow.com/questions/1112069/is-there-a-faster-way-to-load-mysqldumps
innodb_flush_log_at_trx_commit = 2
innodb_log_file_size = 256M
innodb_flush_method = O_DIRECT

# Monitor progress when importing --- but better use the method above
mysql -h <host> -u <user> -p <dbname> < sqlfile.sql
sudo dnf -y install pv  # To monitor progress
pv sqlfile.sql | mysql -h <host> -u <user> -p <dbname>

# Foreign key: When to use on update on delete
# http://stackoverflow.com/questions/6720050/foreign-key-constraints-when-to-use-on-update-and-on-delete
GOOD DEFAULT: ON DELETE RESTRICT ON UPDATE CASCADE
ON UPDATE CASCADE : the best one usually : if you update a company_id in a row of table COMPANY the engine will update it accordingly on all USER rows referencing this COMPANY (but no triggers activated on USER table, warning). The engine will track the changes for you, it's good.
ON DELETE RESTRICT : the default : if you try to delete a company_id Id in table COMPANY the engine will reject the operation if one USER at least links on this company, can save your life.

# Install mysql without root, sudo
# http://superuser.com/questions/209203/how-can-i-install-mysql-on-centos-without-being-root-su
$ cd $MYSQL_HOME
$ vim my.cnf
[server]
user=davidheryanto
basedir=$MYSQL_HOME
datadir=$MYSQL_HOME/data
port=3306

[mysql]
socket=$MYSQL_HOME/socket

max_allowed_packet=128M  

$ ./scripts/mysql_install_db --defaults-file=./my.cnf
$ ./mysqld_safe --defaults-file=./my.cnf

# Initial setup
$ mysql_secure_installation

# Change datadir in system with SELinux
cp -r /var/lib/mysql /data/mysql
chmod 700 /data/mysql
chown mysql:mysql /data/mysql
# Set datadir=/data/mysql
vim /etc/my.cnf
# Verify the original SELinux context is mysqld_db_t
ls -lZ /var/lib/mysql
semanage fcontext -a -t mysqld_db_t "/data/mysql(/.*)?"
restorecon -R -v /data/mysql

# Set sql_mode to ansi, more cross platform, eg use ' instead of `
# http://dba.stackexchange.com/questions/23129/benefits-of-using-backtick-in-mysql-queries
SET sql_mode = 'ANSI_QUOTES';

# On Linux
-----------
./bin/mysqld --console --initialize --datadir=./data
vim my.cnf  # Set innodb_buffer_pool_size=8G
./bin/mysqld_safe --console
./bin/mysql_secure_installation
vim ~/.my.cnf  # Add [client] user,pass for convenience


# On Windows, using the zip installation
---------------------------------------------
# Create my.ini at MYSQL_HOME folder
[mysqld]
log_syslog=0
innodb_buffer_pool_size=8G

> .\bin\mysqld --console --initialize
> .\bin\mysqld --console
> .\bin\mysql_secure_installation.exe

# Add [client] if want to auto login
[client]
user=root
password=my_secure_password
---------------------------------------------

# Simple wordpress setup
# http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/hosting-wordpress.html
mysql -u root -p
create user wordpress_user@localhost identified by 'password';
create database wordpress;
grant all privileges on wordpress.* to wordpress_user@localhost;
flush privileges;

# Select column name
SELECT `COLUMN_NAME` 
FROM `INFORMATION_SCHEMA`.`COLUMNS` 
WHERE `TABLE_SCHEMA`='yourdatabasename' 
    AND `TABLE_NAME`='yourtablename';

# Query: offset
SELECT column FROM table LIMIT 10 OFFSET 8;

# Python driver
==============================================
# pip install PyMySQL
import pymysql
connection = pymysql.connect(host='myhost', user='myuser', password='mypass', db='mydb', cursorclass=pymysql.cursors.SSDictCursor)
cursor = connection.cursor()
# OR
from contextlib import closing
with closing(connection.cursor()) as cursor:

# ALTERNATIVE
-------------
# Need to install -devel library first
# Fedora: sudo dnf -y install community-mysql-devel.x86_64
# pip install MySQL-python 
import MySQLdb
connection = MySQLdb.connect(host='localhost', user='root', passwd='mypassword', db='mydatabase')
# Connect with config file
db = MySQLdb.connect(host="outhouse",db="thangs",read_default_file="~/.my.cnf")
==============================================

# Update root password
# http://stackoverflow.com/questions/7534056/mysql-root-password-change
UPDATE mysql.user SET Password=PASSWORD('MyNewPass') WHERE User='root';
FLUSH PRIVILEGES;;

# Forgot root password
# http://stackoverflow.com/questions/33510184/change-mysql-root-password-on-centos7
systemctl stop mysqld
systemctl set-environment MYSQLD_OPTS="--skip-grant-tables"
systemctl start mysqld
mysql -u root

mysql> UPDATE mysql.user SET authentication_string = PASSWORD('MyNewPassword')
  WHERE User = 'root' AND Host = 'localhost';
mysql> FLUSH PRIVILEGES;
mysql> quit

systemctl stop mysqld
systemctl unset-environment MYSQLD_OPTS
systemctl start mysqld

# Sqlalchemy example
# Connection string
mysql+mysqldb://<user>:<password>@<host>[:<port>]/<dbname>

engine = create_engine(connection_string)
# OR connection = engine.connect()
Session = sessionmaker(bind=engine)
session = Session()

Base = declarative_base()
class User(Base):
    __tablename__ = 'user'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(50))
    password = Column(String(50))
    
    def __repr__(self):
        return '{},{}'.format(self.name,self.password)

Base.metadata.create_all(engine)
user = User(name='david', password='password')
session.add(user)
session.commit()
session.query(User).all()

# Show table info
SHOW CREATE TABLE <table_name>

# Change buffer pool size to 70% VM memory for better performance (my.cnf)
innodb_buffer_pool_size=1G
# Change from command line
SELECT @@innodb_buffer_pool_size;
SET GLOBAL innodb_buffer_pool_size=4026531840;

# Check buffer pool size
show variables like '%buffer_pool_size%'

# Use SSCursor in python for memory efficient result fetching
# http://stackoverflow.com/questions/1808150/how-to-efficiently-use-mysqldb-sscursor

import MySQLdb.cursors

connection=MySQLdb.connect(
    host="thehost",user="theuser",
    passwd="thepassword",db="thedb",
    cursorclass = MySQLdb.cursors.SSCursor)
# Alternatively, 
# Note: use 127.0.0.1 rather than localhost to avoid socket permission err
# http://stackoverflow.com/questions/4662364/cant-connect-to-localhost-using-pythons-mysqldb
# MySQLdb.connect(host='127.0.0.1',db='mydb',read_default_file='~/.my.cnf')
cursor=connection.cursor()
cursor.execute(query)
for row in cursor:
    print(row)

# Change buffer pool size, critical for performance
SELECT @@innodb_buffer_pool_size;
SET GLOBAL innodb_buffer_pool_size=4294967296;  # 4GB

# Rename table
RENAME TABLE `oldname` TO `newname`;

# Check that query using index
# http://dba.stackexchange.com/questions/20038/how-can-i-tell-if-an-index-is-being-used-to-sort-in-mysql
EXPLAIN EXTENDED
select * from Person where name like '%polan%'

# Create fulltext index
alter table <table_name> add fulltext index <index_name>(<col_name>);

# Create index
CREATE INDEX part_of_name ON customer (name(10));

# Show tables in database
select distinct table_name from information_schema.columns where table_schema = '<mydb>'

# Add column to existing table
ALTER TABLE <table_name> ADD <new_col> VARCHAR(128) after <existing_col>;

# Change type of column
ALTER TABLE mytable MODIFY mycol INTEGER;

# Update column value from inner join
UPDATE < to_table > t
SET < to_col > = (
        SELECT s.< from_col >
        FROM < from_table > s
        WHERE s.< from_col_link > = t.< to_col_link >
        )
WHERE EXISTS (
        SELECT *
        FROM < from_table > s
        WHERE s.< from_col_link > = t.< to_col_link >
        );

# Update column value with if else
UPDATE < TABLE >
SET < to_col > = CASE 
        WHEN < from_col > = 'S'
            THEN 'Salmon'
        WHEN < from_col > = 'P'
            THEN 'Piranha'
        ELSE ''
        END
WHERE from_col IN ('S','P');

# Allow/open remote access
# http://stackoverflow.com/questions/14779104/how-to-allow-remote-connection-to-mysql
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' IDENTIFIED BY 'password' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON *.* TO 'root'@'192.168.1.%' IDENTIFIED BY 'password' WITH GRANT OPTION;  # Grant access to ip from subnet
# Check with this
SELECT Host,User,Password FROM mysql.user;

DROP TABLE IF EXISTS mytable;

# Check the engine used
SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES where TABLE_SCHEMA = 'dbname'

# Check data path
# http://stackoverflow.com/questions/17968287/how-to-find-the-mysql-data-directory-from-command-line-in-windows
mysql> 'SHOW VARIABLES LIKE '%dir'

# MySQL config location paths
# http://dev.mysql.com/doc/refman/5.7/en/option-files.html
Windows:
# Setting msyqld config e.g. buffer pool size
- %PROGRAMDATA%\MySQL\MySQL Server 5.7\my.ini
# Login credentials
- %APPDATA%\MySQL\.mylogin.cnf
# Use the following to generate
# http://dev.mysql.com/doc/refman/5.7/en/mysql-config-editor.html
mysql_config_editor set -h hostname -u username -p 


# Mariadb my.cnf location paths
https://mariadb.com/kb/en/mariadb/configuring-mariadb-with-mycnf/

# Install Mariadb
sudo dnf -y install mariadb-server

# Start, stop, auto start mariadb
sudo systemctl start/stop/enable/disable mariadb

# MariaDB: Forgot root password -> reset root password
# http://www.liberiangeek.net/2014/10/reset-root-password-mariadb-centos-7/
sudo mysqld_safe --skip-grant-tables --skip-networking &
mysql -u root
use mysql;
update user set password=PASSWORD("new-password") where User='root';
flush privileges;
# Kill the background process mysqld_safe

# MySQL Community Server
# http://dev.mysql.com/doc/refman/5.7/en/linux-installation-yum-repo.html
---------------------------
wget http://dev.mysql.com/get/mysql57-community-release-el7-7.noarch.rpm
sudo dnf -y install ./mysql57-community-release-el7-7.noarch.rpm
sudo dnf -y install mysql-community-server
sudo systemctl start mysqld && sudo systemctl status mysqld
sudo grep 'temporary password' /var/log/mysqld.log  # Check temporary root password
mysql -uroot -p
ALTER USER 'root'@'localhost' IDENTIFIED BY 'MyNewPass4!'; 

# Optional
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' IDENTIFIED BY 'password' WITH GRANT OPTION;

flush privileges

# To revoke/remove remote access
# http://stackoverflow.com/questions/9947822/mysql-revoke-root-privileges-carefully
# Check with 
# SHOW GRANTS FOR root@localhost;
# SHOW GRANTS FOR root@127.0.0.1;
DROP USER root@'%';  # If want to drop root@'%' user
REVOKE all on myDB.* from root@'%'; FLUSH PRIVILEGES;  # If want to remove access to db only
----------------------------

# Show collation for tables
SHOW TABLE STATUS

# What collation to use for database 
# http://stackoverflow.com/questions/367711/what-is-the-best-collation-to-use-for-mysql-with-php
utf8_general_ci is somewhat faster than utf8_unicode_ci, but less accurate (for sorting).
Most of the time I use utf8_unicode_ci (I prefer accuracy to small performance improvements), unless I have a good reason to prefer a specific language.

# Convert collation for tables
# http://dba.stackexchange.com/questions/8239/how-to-easily-convert-utf8-tables-to-utf8mb4-in-mysql-5-5
ALTER TABLE my_table CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Repair/Check MySQL DB after copying the data dir
# http://stackoverflow.com/questions/12106727/mysql-copying-tables-files-gives-rise-to-error-1017-hy000-cant-find-file
mysqlcheck -u root -p --auto-repair --all-databases

# Restore mysql just by copying the data dir, remember to READ the 'Saved my life!' comment
http://stackoverflow.com/questions/7759170/mysql-table-doesnt-exist-but-it-does-or-it-should

# Duplicate table
CREATE TABLE newtable LIKE oldtable; 
INSERT newtable SELECT * FROM oldtable;

# Select random rows
ORDER BY RAND()

# Create table from another table / Create table from SELECT statement
# http://stackoverflow.com/questions/6595252/mysql-creating-a-new-table-with-information-from-a-query
CREATE TABLE new_tbl SELECT * FROM orig_tbl;

# NOT IN vs NOT EXISTS
# http://stackoverflow.com/questions/173041/not-in-vs-not-exists
SELECT ProductID,
       ProductName
FROM   Products p
WHERE  NOT EXISTS (SELECT *
                   FROM   [Order Details] od
                   WHERE  p.ProductId = od.ProductId) 

# Update column with a sequence number
# http://stackoverflow.com/questions/6617056/updating-columns-with-a-sequence-number-mysql
SET @rank:=0;
update my_table
set my_col=@rank:=@rank+1

# Check running queries
# http://stackoverflow.com/questions/16571416/how-can-i-get-a-full-list-of-all-queries-currently-running-on-my-mysql-server
mysql> SHOW FULL PROCESSLIST;

# To stop the query 
mysql> kill {Id}

# Select only rows with max value on a column
http://stackoverflow.com/questions/7745609/sql-select-only-rows-with-max-value-on-a-column

SELECT a.id, a.rev, a.contents
FROM YourTable a
INNER JOIN (
    SELECT id, MAX(rev) rev
    FROM YourTable
    GROUP BY id
) b ON a.id = b.id AND a.rev = b.rev

# Alternatively

SELECT a.*
FROM YourTable a
LEFT OUTER JOIN YourTable b
    ON a.id = b.id AND a.rev < b.rev
WHERE b.id IS NULL;