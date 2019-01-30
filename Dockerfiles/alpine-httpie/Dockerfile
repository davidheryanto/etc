# Copied from https://hub.docker.com/r/alpine/httpie/dockerfile
FROM alpine:latest

RUN apk add --no-cache python3 && \
pip3 install --upgrade pip setuptools httpie && \
rm -r /root/.cache

ENTRYPOINT [ "http" ]
CMD ["--help"]