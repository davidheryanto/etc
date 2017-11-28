FROM debian:stretch

RUN apt-get -qq update \
 && apt-get -qq -y install python-dev gcc curl wget htop vim procps \
 && wget -qO- https://bootstrap.pypa.io/get-pip.py  | python - \
 && pip install airflow[postgres,crypto,async,celery]

RUN useradd -m -s /bin/bash -u 1000 airflow \
 && mkdir -p /opt/airflow \
 && chown -R airflow:airflow /opt/airflow

ENV AIRFLOW_HOME=/opt/airflow

USER airflow

COPY .vimrc /home/airflow/

WORKDIR /opt/airflow

CMD ["bash"]