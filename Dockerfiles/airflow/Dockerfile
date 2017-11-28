FROM debian:stretch

RUN apt-get -qq update \
 && apt-get -qq -y install python-dev gcc curl wget htop vim \
 && wget -qO- https://bootstrap.pypa.io/get-pip.py  | python - \
 && pip install airflow[postgres,crypto,async,celery] \
 && useradd -m -s /bin/bash -u 1000 dheryanto 

RUN mkdir -p /opt/airflow \
 && chown -R dheryanto:dheryanto /opt/airflow

ENV AIRFLOW_HOME=/opt/airflow

USER dheryanto

COPY .vimrc /home/dheryanto/

WORKDIR /opt/airflow

CMD ["bash"]