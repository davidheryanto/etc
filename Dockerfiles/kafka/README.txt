============================================================
Run Kafka broker and zookeeper locally
============================================================

# https://docs.confluent.io/current/quickstart/ce-docker-quickstart.html#ce-docker-quickstart
# https://docs.confluent.io/current/installation/docker/config-reference.html

docker rm -f zookeeper kafka

docker run --rm \
  --net=host \
  --name=zookeeper \
  --env=ZOOKEEPER_CLIENT_PORT=2181 \
  --detach confluentinc/cp-zookeeper:5.5.1

# Update KAFKA_ADVERTISED_LISTENERS (e.g to the address of the server)
# if the client is running on a different host

docker run --rm \
  --net=host \
  --name=kafka \
  --env=KAFKA_ZOOKEEPER_CONNECT=localhost:2181 \
  --env=KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
  --env=KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
  --detach confluentinc/cp-kafka:5.5.1

# Now test producing and consuming messages
# ============================================================

docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 bash

# Create a topic
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 kafka-topics --zookeeper localhost:2181 --topic topic1 --create --partitions 1 --replication-factor 1

# Delete a topic with same command as create but use --delete (instead of --create)

# List topics
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 kafka-topics --list --bootstrap-server=localhost:9092

# Produce message
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 kafka-console-producer --broker-list localhost:9092 --topic topic1

# Consume messages (additional options: --group CONSUMER_GROUP_ID)
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 kafka-console-consumer --bootstrap-server localhost:9092 --topic topic1 --from-beginning

# List consumer groups
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 kafka-consumer-groups --list --bootstrap-server localhost:9092

# Check metrics for a consumer group
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 kafka-consumer-groups --bootstrap-server localhost:9092 --group myconsumergroup --describe

# Add partitions to an existing topic
ZOOKEEPER=localhost:2181
TOPIC=topic1
docker run --rm -it --net host confluentinc/cp-kafka:5.2.1 kafka-topics \
--zookeeper $ZOOKEEPER --alter --topic $TOPIC --partitions 3

# Common CONSUMER configurations
# ============================================================
# https://kafka.apache.org/documentation/

bootstrap.servers       = localhost:9092
group.id                = myconsumergroup
enable.auto.commit      = true
auto.commit.interval.ms = 1000
key.deserializer        = org.apache.kafka.common.serialization.StringDeserializer
value.deserializer      = org.apache.kafka.common.serialization.StringDeserializer
metadata.max.age.ms     = 30000
auto.offset.reset       = earliest

============================================================
Deploy Kafka Brokers and Zookeeper with Helm
============================================================
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

# Assume you have created a topic "topic1"
# To "produce" messages
/usr/bin/kafka-console-producer --broker-list kafka.cluster.local:31090 --topic topic1

# To "consume" messages
usr/bin/kafka-console-consumer --bootstrap-server kafka.cluster.local:31090 --topic topic1 --from-beginning