import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import options.DirectPubsubOptions;
import org.apache.beam.sdk.Pipeline;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubMessage;
import org.apache.beam.sdk.options.PipelineOptionsFactory;
import org.apache.beam.sdk.transforms.DoFn;
import org.apache.beam.sdk.transforms.ParDo;
import org.apache.beam.sdk.transforms.windowing.FixedWindows;
import org.apache.beam.sdk.transforms.windowing.Window;
import org.joda.time.Duration;
import org.json.JSONObject;

import java.nio.charset.Charset;

public class ExampleJsonParsing {
    public static void main(String[] args) {
        DirectPubsubOptions options = PipelineOptionsFactory.create().as(DirectPubsubOptions.class);
        options.setTargetParallelism(1);

        Pipeline pipeline = Pipeline.create(options);
        pipeline.apply(PubsubIO.readMessagesWithAttributes().fromSubscription("projects/PROJECT/subscriptions/SUBSCRIPTION").withTimestampAttribute("TIMESTAMP_ATTRIBUTE"))
                .apply(ParDo.of(new AddTimestampFn()))
                .apply(Window.into(FixedWindows.of(Duration.standardSeconds(10))));

        pipeline.run().waitUntilFinish();
    }

    public static class AddTimestampFn extends DoFn<PubsubMessage, PubsubMessage> {
        @ProcessElement
        public void processElement(ProcessContext c) {
            PubsubMessage message = c.element();
            String jsonString = new String(c.element().getPayload(), Charset.forName("UTF-8"));
            JsonObject booking = Json.parse(jsonString).asObject();
            c.output(c.element());
        }
    }
}
