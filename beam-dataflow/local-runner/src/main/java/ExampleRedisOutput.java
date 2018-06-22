import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonObject;
import options.DirectPubsubOptions;
import org.apache.beam.sdk.Pipeline;
import org.apache.beam.sdk.io.TextIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubMessage;
import org.apache.beam.sdk.io.redis.RedisIO;
import org.apache.beam.sdk.options.PipelineOptionsFactory;
import org.apache.beam.sdk.transforms.Count;
import org.apache.beam.sdk.transforms.DoFn;
import org.apache.beam.sdk.transforms.ParDo;
import org.apache.beam.sdk.transforms.windowing.*;
import org.apache.beam.sdk.values.KV;
import org.joda.time.Duration;
import redis.clients.jedis.Jedis;

import java.nio.charset.Charset;
import java.util.Date;

public class ExampleRedisOutput {
    private static Jedis jedis;

    public static void main(String[] args) {
        DirectPubsubOptions options = PipelineOptionsFactory.create().as(DirectPubsubOptions.class);
        options.setPubsubRootUrl("http://localhost:8085");
        options.setTargetParallelism(1);

        jedis = new Jedis("localhost");

        Pipeline pipeline = Pipeline.create(options);
        pipeline.apply(PubsubIO.readMessagesWithAttributes().fromSubscription("projects/project1/subscriptions/subscription1").withTimestampAttribute("ts_value"))
                .apply(Window.<PubsubMessage>into(FixedWindows.of(Duration.standardMinutes(5)))
                        .triggering(Repeatedly.forever(AfterFirst.of(
                                AfterPane.elementCountAtLeast(200),
                                AfterProcessingTime.pastFirstElementInPane().plusDelayOf(Duration.standardSeconds(3)))))
                        .withAllowedLateness(Duration.standardSeconds(3))
                        .discardingFiredPanes())
                .apply(ParDo.of(new KVOfServiceTypeOccurence()))
                .apply(Count.perKey())
                .apply(ParDo.of(new FormatOutput()))
                .apply(ParDo.of(new RedisWriter()));

        pipeline.run().waitUntilFinish();
    }

    public static class KVOfServiceTypeOccurence extends DoFn<PubsubMessage, KV<String, Long>> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            PubsubMessage msg = c.element();
            JsonObject data = Json.parse(new String(msg.getPayload(), Charset.forName("UTF-8"))).asObject();
            String serviceType = data.getString("service_type", "");
            if (serviceType.equals("SERVICE_1") || serviceType.equals("SERVICE_2")) {
                c.output(KV.of(serviceType, 1L));
            }
        }
    }

    public static class FormatOutput extends DoFn<KV<String, Long>, KV<String, String>> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            KV<String, Long> elem = c.element();
            String key = c.element().getKey();
            String val = String.valueOf(c.element().getValue());
            c.output(KV.of(key, val));
        }
    }

    public static class RedisWriter extends DoFn<KV<String, String>, KV<String, String>> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            KV<String,String> elem = c.element();
            jedis.set(elem.getKey(), elem.getValue());
            c.output(KV.of(elem.getKey(), elem.getValue()));
        }
    }
}
