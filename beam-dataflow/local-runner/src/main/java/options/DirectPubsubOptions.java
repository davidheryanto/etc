package options;

import org.apache.beam.runners.direct.DirectOptions;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubOptions;
import org.apache.beam.sdk.options.PipelineOptions;

public interface DirectPubsubOptions extends PubsubOptions, DirectOptions {

}
