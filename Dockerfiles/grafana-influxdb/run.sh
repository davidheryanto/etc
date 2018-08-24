#!/bin/bash

NETWORK=net1
INFLUXDB_HOST=172.18.2.1
GRAFANA_HOST=172.18.2.2

docker rm -f influxdb grafana 

docker run -d --name influxdb --net $NETWORK --ip $INFLUXDB_HOST \
  -p 8086:8086 influxdb

docker run -d --name grafana  --net $NETWORK --ip $GRAFANA_HOST \
  -p 3000:3000 grafana/grafana

# Create new InfluxDB database
curl -i -XPOST http://localhost:8086/query --data-urlencode \
"q=CREATE DATABASE mydb"

# Insert dummy data
curl -i -XPOST 'http://localhost:8086/write?db=mydb' \
--data-binary 'cpu_load,host=server01,region=us-west value=0.64'
