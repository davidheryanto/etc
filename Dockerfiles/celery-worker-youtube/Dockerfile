FROM debian:stretch

RUN apt-get -qq update \
&& apt-get -qq -y install python-dev gcc curl wget htop vim procps \
&& wget -qO- https://bootstrap.pypa.io/get-pip.py  | python - \
&& pip install airflow[postgres,crypto,async,celery]

RUN useradd -m -s /bin/bash -u 1000 airflow \
&& mkdir -p /opt/airflow \
&& chown -R airflow:airflow /opt/airflow \
&& mkdir /var/log/airflow \
&& chown airflow:airflow /var/log/airflow \
&& echo "AIRFLOW_HOME=/opt/airflow" >> /etc/environment 

# Youtube-dl
RUN wget -q https://yt-dl.org/downloads/latest/youtube-dl -O /usr/local/bin/youtube-dl \
&& chmod a+rx /usr/local/bin/youtube-dl

COPY .vimrc /home/airflow/

USER airflow

WORKDIR /opt/airflow
ENV AIRFLOW_HOME=/opt/airflow

CMD ["airflow", "worker", "--queues", "youtube", "--concurrency", "1"]