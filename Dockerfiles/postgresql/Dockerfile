FROM debian:stretch

RUN apt-get -qq update \
  && apt-get -y install postgresql-9.6 vim htop procps

RUN usermod -u 1000 postgres \
  && groupmod -g 1000 postgres \
  && chown -R postgres:postgres /var/log/postgresql \
  && chown -R postgres:postgres /var/run/postgresql

COPY init /usr/local/sbin
COPY pg-init.sql /

RUN chmod 755 /usr/local/sbin/init

CMD ["init"]
