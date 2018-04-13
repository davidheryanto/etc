package org.apache.beam.examples;

import org.apache.beam.runners.direct.DirectOptions;
import org.apache.beam.sdk.Pipeline;
import org.apache.beam.sdk.io.TextIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubIO;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubOptions;
import org.apache.beam.sdk.options.PipelineOptionsFactory;
import org.apache.beam.sdk.transforms.windowing.FixedWindows;
import org.apache.beam.sdk.transforms.windowing.Window;
import org.joda.time.Duration;

public class FirstSample {
    public static void main(String[] args) {
        MyOptions options = PipelineOptionsFactory.create().as(MyOptions.class);
        options.setPubsubRootUrl("http://localhost:8085");
        options.setTargetParallelism(1);

        Pipeline pipeline = Pipeline.create(options);
        pipeline.apply(PubsubIO.readStrings().fromSubscription("projects/project1/subscriptions/subscription1"))
                .apply(Window.into(FixedWindows.of(Duration.standardMinutes(2))))
                .apply(TextIO.write().withWindowedWrites().withNumShards(1).to("results/pubsub"));

        pipeline.run().waitUntilFinish();
    }

    interface MyOptions extends PubsubOptions, DirectOptions {
    }
}
