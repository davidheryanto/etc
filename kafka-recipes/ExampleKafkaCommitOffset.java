// First check if there is an existing consumer group
String consumerGroupId = "consumerGroupIdToCheck";

Properties adminProperties = new Properties();
adminProperties.put(
  CommonClientConfigs.BOOTSTRAP_SERVERS_CONFIG,
  "localhost:9092"));
AdminClient adminClient = AdminClient.create(adminProperties);
ListConsumerGroupOffsetsResult listConsumerGroupOffsetsResult =
adminClient.listConsumerGroupOffsets(
  consumerGroupId, new ListConsumerGroupOffsetsOptions().timeoutMs(5000));
Map<TopicPartition, OffsetAndMetadata> topicPartitionOffsetAndMetadataMap =
listConsumerGroupOffsetsResult.partitionsToOffsetAndMetadata().get(5, TimeUnit.SECONDS);
boolean consumerGroupExists = topicPartitionOffsetAndMetadataMap.size() > 0;

if (!consumerGroupExists) {
  log.info(
    "Consumer group '{}' does not exist, will create it and commit the latest offset",
    consumerGroupId);
  Properties consumerProperties = new Properties();
  consumerProperties.setProperty(
    "bootstrap.servers", "localhost:9092");
  consumerProperties.setProperty("group.id", consumerGroupId);
  consumerProperties.setProperty(
    "key.deserializer", "org.apache.kafka.common.serialization.ByteArrayDeserializer");
  consumerProperties.setProperty(
    "value.deserializer", "org.apache.kafka.common.serialization.ByteArrayDeserializer");
  KafkaConsumer<String, String> consumer = new KafkaConsumer<>(consumerProperties);

  for (String topic : sourceSpec.getOptionsOrThrow("topics").split(",")) {
    topic = topic.trim();
    List<PartitionInfo> partitionInfos =
    consumer.partitionsFor(topic, Duration.ofSeconds(10));
    List<TopicPartition> topicPartitions = new ArrayList<>();
    for (PartitionInfo partitionInfo : partitionInfos) {
      topicPartitions.add(
        new TopicPartition(partitionInfo.topic(), partitionInfo.partition()));
    }
    consumer.assign(topicPartitions);
    consumer.poll(1000);
    consumer.commitSync();
  }
}
