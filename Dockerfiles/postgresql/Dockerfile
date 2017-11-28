FROM debian:stretch

RUN apt-get -qq update \
&& apt-get -y install postgresql-9.6 vim htop procps

# Modify uid and gid of postgres to 1000.
# For the find / command, it may causes error, hence we terminate with semicolon
# and exit 0.
# Also note that exec needs to terminate with \;
RUN PG_USER=postgres \
&& OLD_UID=$(id -u $PG_USER) \
&& OLD_GID=$(id -g $PG_USER) \
&& NEW_UID=1000 \
&& NEW_GID=1000 \
&& usermod -u $NEW_UID $PG_USER \
&& groupmod -g $NEW_GID $PG_USER \
&& find / -user $OLD_UID -exec chown -h $PG_USER {} \; \
; find / -group $OLD_GID -exec chown -h $PG_USER {} \; \
; exit 0

COPY .vimrc /root/
COPY init /usr/local/sbin
COPY pg-init.sql /

RUN chmod 755 /usr/local/sbin/init

CMD ["init"]
