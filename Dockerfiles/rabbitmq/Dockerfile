FROM debian:stretch

RUN apt-get -qq update \
  && apt-get -y install rabbitmq-server procps

RUN USERNAME=rabbitmq \
&& OLD_UID=$(id -u $USERNAME) \
&& OLD_GID=$(id -g $USERNAME) \
&& NEW_UID=1000 \
&& NEW_GID=1000 \
&& usermod -u $NEW_UID $USERNAME \
&& groupmod -g $NEW_GID $USERNAME \
&& find / -user $OLD_UID -exec chown -h $USERNAME {} \; \
; find / -group $OLD_GID -exec chown -h $USERNAME {} \; \
; exit 0

COPY init /usr/local/sbin

RUN chmod 755 /usr/local/sbin/init

CMD ["init"]
