FROM debian:stretch

RUN apt-get -qq update \
&& apt-get -y install postgresql-9.6 vim htop procps

# Modify uid and gid of postgres to 1000.
# For the find / command, it may causes error, hence we terminate with semicolon
# and exit 0.
# Also note that exec needs to terminate with \;
RUN USERNAME=postgres \
&& OLD_UID=$(id -u $USERNAME) \
&& OLD_GID=$(id -g $USERNAME) \
&& NEW_UID=1000 \
&& NEW_GID=1000 \
&& usermod -u $NEW_UID $USERNAME \
&& groupmod -g $NEW_GID $USERNAME \
&& find / -user $OLD_UID -exec chown -h $USERNAME {} \; \
; find / -group $OLD_GID -exec chgrp -h $USERNAME {} \; \
; exit 0

COPY .vimrc /root/
COPY init /usr/local/bin/
COPY pg-init.sql /

RUN chmod 755 /usr/local/bin/init

CMD ["init"]
