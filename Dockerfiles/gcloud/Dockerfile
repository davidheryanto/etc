FROM debian:stretch

RUN apt-get -qq update \
&& apt-get -y install wget curl vim python \
&& wget -qO- https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-206.0.0-linux-x86_64.tar.gz | tar xzf - \
&& /google-cloud-sdk/bin/gcloud components install --quiet kubectl

ENV PATH=$PATH:/google-cloud-sdk/bin

COPY activate-service-account /usr/local/bin/

CMD ["bash"]
