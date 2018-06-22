import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonObject;
import com.google.cloud.bigtable.beam.CloudBigtableIO;
import com.google.cloud.bigtable.beam.CloudBigtableTableConfiguration;
import options.DirectPubsubOptions;
import org.apache.beam.sdk.Pipeline;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubMessage;
import org.apache.beam.sdk.options.PipelineOptionsFactory;
import org.apache.beam.sdk.transforms.Count;
import org.apache.beam.sdk.transforms.DoFn;
import org.apache.beam.sdk.transforms.Mean;
import org.apache.beam.sdk.transforms.ParDo;
import org.apache.beam.sdk.transforms.windowing.FixedWindows;
import org.apache.beam.sdk.transforms.windowing.Window;
import org.apache.beam.sdk.values.KV;
import org.apache.beam.sdk.values.PCollection;
import org.apache.hadoop.hbase.client.Mutation;
import org.apache.hadoop.hbase.client.Put;
import org.apache.hadoop.hbase.util.Bytes;
import org.joda.time.Duration;

import java.nio.charset.Charset;
import java.util.Objects;

public class ExampleEndToEnd {
    public static void main(String[] args) {
        DirectPubsubOptions options = PipelineOptionsFactory.create().as(DirectPubsubOptions.class);
        options.setPubsubRootUrl("http://localhost:8085");
        options.setTargetParallelism(1);

        CloudBigtableTableConfiguration bigTableConfig = new CloudBigtableTableConfiguration.Builder()
                .withProjectId("project1").withInstanceId("instance1").withTableId("table1")
                .withConfiguration("google.bigtable.emulator.endpoint.host", "localhost:8086").build();

        Pipeline pipeline = Pipeline.create(options);
        PCollection<PubsubMessage> windowedMessages =
                pipeline.apply(PubsubIO.readMessagesWithAttributes().fromSubscription("projects/project1/subscriptions/subscription1").withTimestampAttribute("ts_value"))
                        .apply(Window.into(FixedWindows.of(Duration.standardSeconds(15))));

        windowedMessages.apply(ParDo.of(new KVOfServiceTypeOccurence()))
                .apply(Count.perKey())
                .apply(ParDo.of(new MutationTransform<>("cf1", "count")))
                .apply(CloudBigtableIO.writeToTable(bigTableConfig));

        windowedMessages.apply(ParDo.of(new KVOfServiceTypePrice()))
                .apply(Mean.perKey())
                .apply(ParDo.of(new MutationTransform<>("cf1", "mean")))
                .apply(CloudBigtableIO.writeToTable(bigTableConfig));

        pipeline.run().waitUntilFinish();
    }

    public static class MutationTransform<ValueType> extends DoFn<KV<String, ValueType>, Mutation> {
        private byte[] family;
        private byte[] qualifier;

        MutationTransform(String columnFamily, String qualifier) {
            this.family = Bytes.toBytes(columnFamily);
            this.qualifier = Bytes.toBytes(qualifier);
        }

        @ProcessElement
        public void processElement(ProcessContext c) {
            KV<String, ValueType> elem = c.element();
            byte[] key = Objects.requireNonNull(elem.getKey()).getBytes();
            byte[] val = String.valueOf(elem.getValue()).getBytes();
            c.output(new Put(key).addColumn(family, qualifier, val));
        }
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

    public static class KVOfServiceTypePrice extends DoFn<PubsubMessage, KV<String, Long>> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            PubsubMessage msg = c.element();
            JsonObject data = Json.parse(new String(msg.getPayload(), Charset.forName("UTF-8"))).asObject();
            String serviceType = data.getString("service_type", "");
            Long price = data.getLong("customer_price", 0L);
            c.output(KV.of(serviceType, price));
        }
    }
}
