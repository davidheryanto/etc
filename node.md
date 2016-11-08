# npm set proxy
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

# npm remove proxy
npm config rm proxy
npm config rm https-proxy

# Install http server
# https://github.com/indexzero/http-server
npm install http-server -g
http-server [-p 80] [-a 0.0.0.0] [--cors] [--ssl] [--cert <path to ssl cert.pem>] [--key path to ssl key.pem]

# Disable check SSL Certificate
# http://stackoverflow.com/questions/13913941/how-to-fix-ssl-certificate-error-when-running-npm-on-windows
npm set strict-ssl false

# Use http version of the repo
npm config set registry http://registry.npmjs.org/

# Kill software that blocks http-server
pskill ccsvchst

# Nice packages
# =============
# Database Util 
https://github.com/tgriesser/knex
https://github.com/tgriesser/bookshelf
# JSON Schema generator 
https://github.com/krg7880/json-schema-generator
```
npm install -g json-schema-generator
json-schema-generator path/to/input.json -o path/to/output.json
```

# Returning an error object as JSON
# http://stackoverflow.com/questions/18391212/is-it-not-possible-to-stringify-an-error-using-json-stringify
JSON.stringify(err, Object.getOwnPropertyNames(err))