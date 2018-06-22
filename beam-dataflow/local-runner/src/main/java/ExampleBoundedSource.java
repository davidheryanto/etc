import org.apache.beam.sdk.Pipeline;
import org.apache.beam.sdk.io.TextIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubOptions;
import org.apache.beam.sdk.options.PipelineOptions;
import org.apache.beam.sdk.options.PipelineOptionsFactory;
import org.apache.beam.sdk.repackaged.org.apache.commons.lang3.time.DateFormatUtils;
import org.apache.beam.sdk.transforms.DoFn;
import org.apache.beam.sdk.transforms.MapElements;
import org.apache.beam.sdk.transforms.PTransform;
import org.apache.beam.sdk.transforms.ParDo;
import org.apache.beam.sdk.transforms.windowing.FixedWindows;
import org.apache.beam.sdk.transforms.windowing.Window;
import org.apache.beam.sdk.values.PCollection;
import org.joda.time.Duration;
import org.joda.time.Instant;

import java.util.Date;
import java.util.concurrent.ThreadLocalRandom;

public class ExampleBoundedSource {
    public static void main(String[] args) {
//        PubsubOptions options = PipelineOptionsFactory.create().as(PubsubOptions.class);
//        options.setPubsubRootUrl("http://localhost:8085");
//        options.setStreaming(true);

        PipelineOptions options = PipelineOptionsFactory.create();

        Pipeline pipeline = Pipeline.create(options);
//        String subscription = "projects/project1/subscriptions/subscription1";

//        pipeline.apply(PubsubIO.readStrings().fromSubscription(subscription))
        pipeline
                .apply(TextIO.read().from("gs://apache-beam-samples/shakespeare/kinglear.*"))
                .apply(ParDo.of(new AddTimestampFn(
                        new Instant(System.currentTimeMillis()), new Instant(System.currentTimeMillis() +  Duration.standardHours(1).getMillis()))))
                .apply(Window.into(FixedWindows.of(Duration.standardSeconds(3))))
                .apply(new MyTransform())
                .apply(TextIO.write().withWindowedWrites().withNumShards(1).to("results/out"));

        pipeline.run().waitUntilFinish();
    }


    public static class MyTransform extends PTransform<PCollection<String>, PCollection<String>> {
        @Override
        public PCollection<String> expand(PCollection<String> input) {
            PCollection<String> words = input.apply(ParDo.of(new MyFunc()));
            return words;
        }
    }

    public static class MyFunc extends DoFn<String, String> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            System.out.printf("[%s] %s\n", DateFormatUtils.format(new Date(), "HH:mm:ss"), c.element());
            c.output(c.element() + " edited");
        }
    }

    static class AddTimestampFn extends DoFn<String, String> {
        private final Instant minTimestamp;
        private final Instant maxTimestamp;

        AddTimestampFn(Instant minTimestamp, Instant maxTimestamp) {
            this.minTimestamp = minTimestamp;
            this.maxTimestamp = maxTimestamp;
        }

        @ProcessElement
        public void processElement(ProcessContext c) {
            Instant randomTimestamp =
                    new Instant(
                            ThreadLocalRandom.current()
                                    .nextLong(minTimestamp.getMillis(), maxTimestamp.getMillis()));
            c.outputWithTimestamp(c.element(), new Instant(randomTimestamp));
        }
    }

}


