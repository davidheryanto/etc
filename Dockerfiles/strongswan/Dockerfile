FROM alpine:3.9

RUN apk add --no-cache strongswan

COPY isrgrootx1.pem.txt /isrgrootx1.pem.txt
COPY letsencryptauthorityx3.pem.txt /letsencryptauthorityx3.pem.txt
COPY lets-encrypt-r3.pem.txt /lets-encrypt-r3.pem.txt

ENTRYPOINT ["charon-cmd"]