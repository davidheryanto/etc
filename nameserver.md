# https://www.isc.org/downloads/file/bind-9-10-3/?version=win-64-bit
dig @ns1.hostgator.sg nazrepublic.com
dig @ns2.hostgator.sg nazrepublic.com

# Check SOA serial
dig +nssearch google.com

# Get hostname from ip address and vice versa i.e. DNS lookup
host google.com
host 8.8.8.8