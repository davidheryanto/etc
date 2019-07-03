FROM alpine:3.10

RUN apk add --no-cache strongswan

EXPOSE 500/udp
EXPOSE 4500/udp

ENTRYPOINT ["/usr/sbin/ipsec"]
CMD ["start", "--nofork"]
