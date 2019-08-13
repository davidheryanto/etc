import java.util.Arrays;
import org.apache.beam.sdk.Pipeline;
import org.apache.beam.sdk.io.kafka.CustomTimestampPolicyWithLimitedDelay;
import org.apache.beam.sdk.io.kafka.KafkaIO;
import org.apache.beam.sdk.options.PipelineOptions;
import org.apache.beam.sdk.options.PipelineOptionsFactory;
import org.joda.time.Duration;
import org.joda.time.Instant;

public class KafkaIOCustomTimestampPolicyExample {
  // The definition of maxDelay:
  // https://github.com/GoogleCloudPlatform/DataflowTemplates/blob/0a09a9fae441313d8c67f043dad00db84f64829f/src/main/java/com/google/cloud/teleport/kafka/connector/CustomTimestampPolicyWithLimitedDelay.java#L47
  private static final Duration maxDelay = Duration.standardSeconds(10);

  public static void main(String[] args) {
    PipelineOptions pipelineOptions = PipelineOptionsFactory.create();
    Pipeline pipeline = Pipeline.create(pipelineOptions);
    pipeline.apply(
        KafkaIO.readBytes()
            .withBootstrapServers("BOOTSTRAP_SERVERS")
            .withTopics(Arrays.asList("TOPIC_ONE", "TOPIC_TWO"))
            .withTimestampPolicyFactory(
                (topicPartition, previousWatermark) ->
                    new CustomTimestampPolicyWithLimitedDelay<>(
                        // Replace with your custom timestamp function
                        kafkaRecord -> new Instant(kafkaRecord.getTimestamp()),
                        maxDelay,
                        previousWatermark)));
    pipeline.run();
  }
}
