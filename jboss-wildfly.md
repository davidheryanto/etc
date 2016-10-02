# Enable debugging in Intellij
vim ./bin/standalone.conf
JAVA_OPTS="$JAVA_OPTS -agentlib:jdwp=transport=dt_socket,address=65092,suspend=n,server=y"

# Bind app and management to any IP
./standalone.sh -b=0.0.0.0 -bmanagement=0.0.0.0

# Use custom configuration file
# Create standalone-custom.xml at standalone/configuration
./standalone.bat -c standalone-custom.xml