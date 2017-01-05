# https://www.isc.org/downloads/file/bind-9-10-3/?version=win-64-bit
dig @ns1.hostgator.sg nazrepublic.com
dig @ns2.hostgator.sg nazrepublic.com

# dig: Check SOA serial
dig +nssearch google.com

# dig with diff name server
dig @8.8.8.8 example.com

# nslookup with different nameserver
nslookup example.com 8.8.8.8