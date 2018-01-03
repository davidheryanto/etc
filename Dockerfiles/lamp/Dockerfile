FROM debian:stretch

RUN apt-get -qq update \
&& apt-get -y install apache2 mysql-server php php-mysql php-cli \
&& apt-get -y install vim less curl wget htop 

# Set mysql to bind to all addresses i.e. 0.0.0.0 (default is 127.0.0.1)
RUN sed -i "/bind-address/s/127.0.0.1/0.0.0.0/g" /etc/mysql/mariadb.conf.d/50-server.cnf

