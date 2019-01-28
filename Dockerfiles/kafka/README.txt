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
/usr/bin/kafka-console-producer --broker-list kafka.cluster.local:31090 --topic test1