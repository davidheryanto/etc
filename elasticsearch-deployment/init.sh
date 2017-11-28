#!/bin/bash

# Initialization script for setting up Elasticsearch
# Note: Run these commands as root
apt-get -qq update && apt-get -qq -y install openjdk-8-jdk \
&& wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-6.0.0.deb \
&& dpkg -i elasticsearch-6.0.0.deb && rm elasticsearch-6.0.0.deb \
&& /usr/share/elasticsearch/bin/elasticsearch-plugin install --batch x-pack \
&& /usr/share/elasticsearch/bin/elasticsearch-plugin install --batch discovery-gce \
&& /usr/share/elasticsearch/bin/elasticsearch-plugin install --batch repository-gcs