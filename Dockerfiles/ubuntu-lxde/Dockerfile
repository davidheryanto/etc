FROM ubuntu:16.04

RUN apt-get -qq update \
&& apt-get -y install lxde vim htop curl wget sudo openssh-server iputils-ping \
&& apt-get -qq -y install software-properties-common \
&& add-apt-repository -y ppa:x2go/stable \
&& apt-get -qq update \
&& apt-get -qq -y install x2goserver x2goserver-xsession

RUN useradd -u 1000 -s /bin/bash -m dheryanto \
&& usermod -aG root dheryanto

COPY .vimrc /home/dheryanto/
COPY init /usr/local/bin/

CMD ["init"]