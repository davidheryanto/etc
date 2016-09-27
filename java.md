# Collapse whitespace
# http://stackoverflow.com/questions/3958955/how-to-remove-duplicate-white-spaces-in-string-using-java
yourString = yourString.replaceAll("\\s+", " ");

# Set CLASSPATH
java -classpath C:\java\MyClasses;C:\java\OtherClasses ... (or java -cp)

# Connect to mysql
# http://stackoverflow.com/questions/2839321/java-connectivity-with-mysql
MysqlDataSource dataSource = new MysqlDataSource();
dataSource.setServerName("myDBHost.example.org");
dataSource.setDatabaseName("mydb");
dataSource.setUser("scott");
dataSource.setPassword("tiger");
Connection connection = dataSource.getConnection();

Statement statement = connection.createStatement();
String query = "SELECT ...";
ResultSet resultSet = statement.executeQuery(query);

# Read credentials from my.ini. Use ini4j library.
Path iniPath = Paths.get(System.getProperty("user.home"), "my.ini");
Wini mySqlIini = new Wini(iniPath.toFile());
MysqlDataSource dataSource = new MysqlDataSource();
dataSource.setServerName("myDBHost.example.org");
dataSource.setDatabaseName("mydb");
dataSource.setUser(mySqlIini.get("client", "user"));
dataSource.setPassword(mySqlIini.get("client", "password"));
Connection conn = dataSource.getConnection();

# CORS Filter
http://stackoverflow.com/questions/23450494/how-to-enable-cross-domain-requests-on-jax-rs-web-services

# Join paths
Path p = Paths.get("arbitrary", "number", "of", "subdirs", "filename.ext");
File f = p.toFile();
String absPath = f.getAbsolutePath();

# Remove dir with apache-commons: 'commons-io:commons-io:2.4'
FileUtils.deleteDirectory(dir);

# Get user home directory
System.getProperty("user.home")

# Intellij Idea: Clear cache
http://stackoverflow.com/questions/1727922/how-to-clear-the-intellij-project-index
# Delete this folder
USER_HOME/.IntelliJIdeaXX/system

# Maven: META-INF in src not copied to target/classes
http://stackoverflow.com/questions/1297473/maven-including-a-meta-inf-folder-in-the-classes-folder
Move META-INF into resources/

# UnitTest: Test for exception
@Test(expected = MyExceptionClass.class) 
public void functionThrowingException() { }

# EntityManager: find by non primary key
http://stackoverflow.com/questions/11034322/how-do-i-find-a-value-in-a-column-that-just-have-unique-values-with-eclipselink
List<T> results = em.createQuery("SELECT t FROM TABLE t where t.value = :value1").setParameter("value1", "some value").getResultList();

# EntityManager: get the latest data
entityManager.refresh(entity)

# JPA: Unidirectional one to many
http://stackoverflow.com/questions/12038380/how-to-define-unidirectional-onetomany-relationship-in-jpa

# JPA: Writable mappings problem. Which table can update/insert a column
# http://stackoverflow.com/questions/7952115/multiple-writable-mappings-exception-in-eclipselink
"I solved my problem placing the insertable=false, updatable=false in the @JoinColumn annotation"

# JPA: Returning partial entity, only some fields not all
# http://stackoverflow.com/questions/6526048/jpa-2-0-load-a-subset-of-fields-for-an-entity
select new your.package.Address(a.city) from Address a where ...

# JPA: Pagination
# http://stackoverflow.com/questions/16088949/jpa-query-to-select-based-on-criteria-alongwith-pagination
return em.createNamedQuery("yourqueryname", YourEntity.class)
      .setMaxResults(noOfRecords)
      .setFirstResult(pageIndex * noOfRecords));
      .getResultList();

# Bidirectional MOXY Binding
http://blog.bdoughan.com/2013/03/moxys-xmlinversereference-is-now-truly.html

# Port forwarding with UPnP
https://github.com/kaklakariada/portmapper

# Assertions
# To enable, run java with VM options -ea (Edit configurations in Intellij)
assert IteratorUtils.count(graph.vertices()) == 6 : "Graph should have 6 vertices";

# Java print comma for thousands
# http://stackoverflow.com/questions/5323502/how-to-set-thousands-separator-in-java
String str = String.format("%,d", number);

// Or custom grouping separator

DecimalFormatSymbols symbols = DecimalFormatSymbols.getInstance();
symbols.setGroupingSeparator(' ');
DecimalFormat formatter = new DecimalFormat("###,###.##", symbols);
System.out.println(formatter.format(number)

# Heap vs off-heap memory http://orientdb.com/docs/2.1/Performance-Tuning.html
java -Xmx800m -Dstorage.diskCache.bufferSize=7200 ...

# Get current/runtime heap and free memory
# http://stackoverflow.com/questions/2015463/how-to-view-the-current-heap-size-that-an-applicatin-is-using
long heapMaxSize = Runtime.getRuntime().maxMemory();
long heapFreeSize = Runtime.getRuntime().freeMemory();
System.out.println(String.format("Max heap: %,d Byte", heapMaxSize));
System.out.println(String.format("Free memory: %,d Byte", heapFreeSize));

# Convert List to array
# http://stackoverflow.com/questions/5374311/convert-arrayliststring-to-string-array
String[] arr = list.toArray(new String[list.size()]);

# Convert underscore to camelcase
# http://stackoverflow.com/questions/1143951/what-is-the-simplest-way-to-convert-a-java-string-from-all-caps-words-separated
# http://mvnrepository.com/artifact/com.google.guava/guava
CaseFormat.UPPER_UNDERSCORE.to(CaseFormat.LOWER_CAMEL, "THIS_IS_AN_EXAMPLE_STRING");

# Iterate Map<K, V>
for (Map.Entry<String, String> entry : person.entrySet()) {
    System.out.println(entry.getKey() + "/" + entry.getValue());
}

# Apache commons lang3 library
http://mvnrepository.com/artifact/org.apache.commons/commons-lang3/3.4
'org.apache.commons:commons-lang3:3.4'

# Read, write properties file
FileOutputStream output = new FileOutputStream("config.properties");
Properties prop = new Properties();
prop.setProperty("database", "localhost");
prop.store(output, null);

FileInputStream input = new FileInputStream("config.properties");
Properties prop = new Properties();
prop.load(input);
prop.getProperty("database")

# Join list of strings
String joined = String.join("/", "2014", "10", "28" ); // "2014/10/28"

List<String> list = Arrays.asList("foo", "bar", "baz");
joined = String.join(";", list); // "foo;bar;baz"

# Read csv
# https://commons.apache.org/proper/commons-csv/user-guide.html
compile 'org.apache.commons:commons-csv:1.2'

Reader in = new FileReader("path/to/file.csv");
Iterable<CSVRecord> records = CSVFormat.EXCEL.withHeader().parse(in);
for (CSVRecord record : records) {
    String lastName = record.get("Last Name");
    String firstName = record.get("First Name");
}

# Logging
# http://stackoverflow.com/questions/5950557/good-examples-using-java-util-logging
private static final Logger log = Logger.getLogger( ClassName.class.getName() );
log.log( Level.FINE, "processing {0} entries in loop", list.size() );

# Sort HashMap
http://beginnersbook.com/2013/12/how-to-sort-hashmap-in-java-by-keys-and-values/

# Write to file
List<String> lines = Arrays.asList("The first line", "The second line");
Path file = Paths.get("the-file-name.txt");
Files.write(file, lines, Charset.forName("UTF-8"));
// Files.write(file, lines, Charset.forName("UTF-8"), StandardOpenOption.APPEND);

# Create UTF-8 Writer object
Writer writer = new BufferedWriter(
  new OutputStreamWriter(
  new FileOutputStream("output.txt"), StandardCharsets.UTF_8));