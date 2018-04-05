FROM docker

RUN apk add --update openssl python \
&& wget -qO- https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-196.0.0-linux-x86_64.tar.gz | tar xzf - \
&& /google-cloud-sdk/bin/gcloud components install --quiet kubectl

ENV PATH=$PATH:/google-cloud-sdk/bin

COPY activate-service-account /usr/local/bin/

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["sh"]
