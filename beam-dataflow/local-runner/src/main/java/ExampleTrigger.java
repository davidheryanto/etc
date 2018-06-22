import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonObject;
import options.DirectPubsubOptions;
import org.apache.beam.sdk.Pipeline;
import org.apache.beam.sdk.io.TextIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubMessage;
import org.apache.beam.sdk.options.PipelineOptionsFactory;
import org.apache.beam.sdk.transforms.Count;
import org.apache.beam.sdk.transforms.DoFn;
import org.apache.beam.sdk.transforms.ParDo;
import org.apache.beam.sdk.transforms.windowing.*;
import org.apache.beam.sdk.values.KV;
import org.joda.time.Duration;

import java.nio.charset.Charset;
import java.util.Date;

public class ExampleTrigger {
    public static void main(String[] args) {
        DirectPubsubOptions options = PipelineOptionsFactory.create().as(DirectPubsubOptions.class);
        options.setPubsubRootUrl("http://localhost:8085");
        options.setTargetParallelism(1);

        Pipeline pipeline = Pipeline.create(options);
        pipeline.apply(PubsubIO.readMessagesWithAttributes().fromSubscription("projects/project1/subscriptions/subscription1").withTimestampAttribute("ts_value"))
                .apply(Window.<PubsubMessage>into(FixedWindows.of(Duration.standardMinutes(10)))
                        .triggering(Repeatedly.forever(AfterFirst.of(
                                AfterPane.elementCountAtLeast(200),
                                AfterProcessingTime.pastFirstElementInPane().plusDelayOf(Duration.standardMinutes(1)))))
                        .withAllowedLateness(Duration.standardSeconds(30))
                        .discardingFiredPanes()
                )
                .apply(ParDo.of(new KVOfServiceTypeOccurence()))
                .apply(Count.perKey())
                .apply(ParDo.of(new FormatOutput()))
                .apply(TextIO.write().withWindowedWrites().withNumShards(1).to("results/out"));

        pipeline.run().waitUntilFinish();
    }

    public static class KVOfServiceTypeOccurence extends DoFn<PubsubMessage, KV<String, Long>> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            PubsubMessage msg = c.element();
            JsonObject data = Json.parse(new String(msg.getPayload(), Charset.forName("UTF-8"))).asObject();
            String serviceType = data.getString("service_type", "");
            c.output(KV.of(serviceType, 1L));
        }
    }

    public static class FormatOutput extends DoFn<KV<String, Long>, String> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            KV<String, Long> elem = c.element();
            String out = String.format("[%s] [Service Type] %s: [Count] %s",
                    new Date(), elem.getKey(), elem.getValue());
            c.output(out);
        }
    }

    public static class MessageToString extends DoFn<PubsubMessage, String> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            PubsubMessage msg = c.element();
            JsonObject data = Json.parse(new String(msg.getPayload(), Charset.forName("UTF-8"))).asObject();
            String output = String.format("[%s] Service Type: %s, Event Timestamp: %s",
                    c.timestamp(), data.get("service_type").asString(), data.get("event_timestamp").asString());
            c.output(output);
        }
    }
}
