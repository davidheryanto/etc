FROM debian:stretch

RUN apt-get -qq update \
  && apt-get -y install rabbitmq-server procps

RUN usermod -u 1000 rabbitmq \
  && groupmod -g 1000 rabbitmq \
  && find / -user 103 -exec chown -h rabbitmq {} \; \
  ;  find / -group 104 -exec chgrp -h rabbitmq {} \; \
  ;  exit 0

COPY init /usr/local/sbin

RUN chmod 755 /usr/local/sbin/init

CMD ["init"]
