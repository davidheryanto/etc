# Deploy Kafka Brokers and Zookeeper with Helm
# https://github.com/helm/charts/tree/master/incubator/kafka
helm repo add incubator http://storage.googleapis.com/kubernetes-charts-incubator
helm install --name my-kafka incubator/kafka

# Remember to set external.enabled: true for access from outside Kube cluster
# Also uncomment advertised.listeners
# And possibly need to add this property too: 
# https://github.com/helm/charts/issues/6670#issuecomment-406623919

# To test the client from "outside" the cluster:
# Remember to possibly modify /etc/hosts, example:
# 10.110.7.33 kafka.cluster.local

docker run --rm -it --net host confluentinc/cp-kafka:5.0.1 bash

# Assume you have created a topic "test1"
# To "produce" messages
/usr/bin/kafka-console-producer --broker-list kafka.cluster.local:31090 --topic test1

# To "consume" messages
usr/bin/kafka-console-consumer --bootstrap-server kafka.cluster.local:31090 --topic test1 --from-beginning

============================================================
Run Kafka broker and zookeeper locally
============================================================

# https://docs.confluent.io/current/quickstart/ce-docker-quickstart.html#ce-docker-quickstart
# https://docs.confluent.io/current/installation/docker/config-reference.html

docker rm -f zookeeper kafka

docker run --rm \
  --net=host \
  --name=zookeeper \
  -e ZOOKEEPER_CLIENT_PORT=2181 \
  confluentinc/cp-zookeeper:5.2.1

docker run --rm \
  --net=host \
  --name=kafka \
  -e KAFKA_ZOOKEEPER_CONNECT=localhost:2181 \
  -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
  -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
  confluentinc/cp-kafka:5.2.1

# Now test producing and consuming messages
# ============================================================

docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 bash

# Create a topic
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 \
kafka-topics --zookeeper localhost:2181 --topic test1 --create --partitions 1 --replication-factor 1

# List topics
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 \
kafka-topics --list --bootstrap-server=localhost:9092

# Produce message
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 \
kafka-console-producer --broker-list localhost:9092 --topic test1

# Consume messages
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 \
kafka-console-consumer --bootstrap-server localhost:9092 --topic test1 --from-beginning