import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.apache.kafka.clients.CommonClientConfigs;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.ListConsumerGroupOffsetsOptions;
import org.apache.kafka.clients.admin.ListConsumerGroupOffsetsResult;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.PartitionInfo;
import org.apache.kafka.common.TopicPartition;

/**
 * ExampleKafkaCommitOffset is an example of creating a commit offset to the latest offset
 * in each partition of Kafka topics subscribed by the chosen consumer group id.
 *
 * One use case is when we want to start a Kafka consumer some time in the future.
 * We would like this consumer to start listening to all messages from offset with timestamp "now".
 * But since we do not when this Kafka consumer will start (let's say it is started by other
 * agents), we cannot assume then when it is started the latest offset have not moved.
 *
 * By creating a commit offset manually, we ensure when this consumer starts in the future,
 * it can make use of our manually created commit offset to determine which offset to start reading
 * from.
 */
public class ExampleKafkaCommitOffset {
  public static void main(String[] args)
      throws InterruptedException, ExecutionException, TimeoutException {
    // First check if there is an existing consumer group
    final String CONSUMER_GROUP_ID = "myconsumergroup";
    final String TOPICS = "test1,test2";
    final String BOOTSTRAP_SERVERS = "localhost:9092";

    Properties adminProperties = new Properties();
    adminProperties.put(CommonClientConfigs.BOOTSTRAP_SERVERS_CONFIG, BOOTSTRAP_SERVERS);
    AdminClient adminClient = AdminClient.create(adminProperties);
    ListConsumerGroupOffsetsResult listConsumerGroupOffsetsResult =
        adminClient.listConsumerGroupOffsets(
            CONSUMER_GROUP_ID, new ListConsumerGroupOffsetsOptions().timeoutMs(5000));
    Map<TopicPartition, OffsetAndMetadata> topicPartitionOffsetAndMetadataMap =
        listConsumerGroupOffsetsResult.partitionsToOffsetAndMetadata().get(5, TimeUnit.SECONDS);
    boolean consumerGroupExists = topicPartitionOffsetAndMetadataMap.size() > 0;

    if (!consumerGroupExists) {
      System.out.println(
          String.format(
              "Consumer group '%s' does not exist, will create it and commit the latest offset",
              CONSUMER_GROUP_ID));

      Properties consumerProperties = new Properties();
      consumerProperties.setProperty("bootstrap.servers", BOOTSTRAP_SERVERS);
      consumerProperties.setProperty("group.id", CONSUMER_GROUP_ID);
      consumerProperties.setProperty(
          "key.deserializer", "org.apache.kafka.common.serialization.ByteArrayDeserializer");
      consumerProperties.setProperty(
          "value.deserializer", "org.apache.kafka.common.serialization.ByteArrayDeserializer");
      KafkaConsumer<String, String> consumer = new KafkaConsumer<>(consumerProperties);

      for (String topic : TOPICS.split(",")) {
        topic = topic.trim();
        List<PartitionInfo> partitionInfos = consumer.partitionsFor(topic, Duration.ofSeconds(10));
        List<TopicPartition> topicPartitions = new ArrayList<>();
        for (PartitionInfo partitionInfo : partitionInfos) {
          topicPartitions.add(new TopicPartition(partitionInfo.topic(), partitionInfo.partition()));
        }
        consumer.assign(topicPartitions);
        consumer.poll(1000);
        consumer.commitSync();
      }
    }
  }
}
