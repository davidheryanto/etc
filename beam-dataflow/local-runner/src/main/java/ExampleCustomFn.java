import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonObject;
import options.DirectPubsubOptions;
import org.apache.beam.sdk.Pipeline;
import org.apache.beam.sdk.io.TextIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubMessage;
import org.apache.beam.sdk.options.PipelineOptionsFactory;
import org.apache.beam.sdk.transforms.*;
import org.apache.beam.sdk.transforms.windowing.FixedWindows;
import org.apache.beam.sdk.transforms.windowing.Window;
import org.apache.beam.sdk.values.KV;
import org.apache.beam.sdk.values.PCollection;
import org.joda.time.Duration;

import java.nio.charset.Charset;

public class ExampleCustomFn {
    public static void main(String[] args) {
        DirectPubsubOptions options = PipelineOptionsFactory.create().as(DirectPubsubOptions.class);
        options.setPubsubRootUrl("http://localhost:8085");
        options.setTargetParallelism(1);

        Pipeline pipeline = Pipeline.create(options);
        pipeline.apply(PubsubIO.readMessagesWithAttributes().fromSubscription("projects/project1/subscriptions/subscription1").withTimestampAttribute("ts_value"))
                .apply(Window.into(FixedWindows.of(Duration.standardSeconds(60))))
                .apply(ParDo.of(new KVOfServiceTypeCustomerPrice()))
                .apply(Combine.perKey(new AverageFn()))
                .apply(ParDo.of(new FormatOutput()))
                .apply(TextIO.write().withWindowedWrites().withNumShards(1).to("results/out"));

        pipeline.run().waitUntilFinish();
    }

    public static class KVOfServiceTypeCustomerPrice extends DoFn<PubsubMessage, KV<String, Double>> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            PubsubMessage msg = c.element();
            JsonObject data = Json.parse(new String(msg.getPayload(), Charset.forName("UTF-8"))).asObject();
            String serviceType = data.getString("service_type", "");
            Double customerPrice = data.getDouble("customer_price", 0.0);
            c.output(KV.of(serviceType, customerPrice));
        }
    }

    public static class AveragePriceForServiceType implements SerializableFunction<Iterable<Double>, Double> {
        @Override
        public Double apply(Iterable<Double> input) {
            return null;
        }
    }

    public static class FormatOutput extends DoFn<KV<String, Double>, String> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            KV<String,Double> elem = c.element();
            String out = String.format("[Service Type] %s: [Average] %s", elem.getKey(), elem.getValue());
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
