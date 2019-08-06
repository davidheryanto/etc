import avro.shaded.com.google.common.collect.ImmutableMap;
import org.apache.beam.runners.direct.DirectOptions;
import org.apache.beam.sdk.Pipeline;
import org.apache.beam.sdk.io.kafka.KafkaIO;
import org.apache.beam.sdk.io.kafka.KafkaRecord;
import org.apache.beam.sdk.options.PipelineOptionsFactory;
import org.apache.beam.sdk.transforms.DoFn;
import org.apache.beam.sdk.transforms.ParDo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Main {
  private static final Logger logger = LoggerFactory.getLogger(Main.class.getName());

  public static void main(String[] args) {
    DirectOptions pipelineOptions = PipelineOptionsFactory.as(DirectOptions.class);
    Pipeline pipeline = Pipeline.create(pipelineOptions);

    pipeline
        .apply(
            KafkaIO.readBytes()
                .withBootstrapServers("localhost:9092")
                .withTopic("mytopic")
                .updateConsumerProperties(
                    ImmutableMap.of(
                        "group.id", "group_20190806_1145", "enable.auto.commit", "true")))
        .apply(
            ParDo.of(
                new DoFn<KafkaRecord<byte[], byte[]>, Void>() {
                  @ProcessElement
                  public void processElement(ProcessContext c) {
                    logger.info("Got message");
                  }
                }));

    pipeline.run();
  }
}
