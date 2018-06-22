import org.apache.beam.sdk.Pipeline;
import org.apache.beam.sdk.testing.PAssert;
import org.apache.beam.sdk.testing.TestPipeline;
import org.apache.beam.sdk.transforms.Combine;
import org.apache.beam.sdk.transforms.Create;
import org.apache.beam.sdk.transforms.DoFn;
import org.apache.beam.sdk.transforms.ParDo;
import org.apache.beam.sdk.values.KV;
import org.apache.beam.sdk.values.PCollection;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.JUnit4;

import java.io.Serializable;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.util.Arrays;
import java.util.List;

public class AverageFnTest {
    public AverageFnTest(){}

    @Rule
    public final transient TestPipeline p = TestPipeline.create();
    private DecimalFormat df = new DecimalFormat("#.##");

    @Before
    public void setUp() throws Exception {
        df.setRoundingMode(RoundingMode.HALF_UP);
    }

    @After
    public void tearDown() throws Exception {
    }

    @Test
    public void run() {
        List<KV<String, Double>> in = Arrays.asList(
                KV.of("a", 1.2),
                KV.of("a", 2.8),
                KV.of("b", 1.1),
                KV.of("b", 3.1),
                KV.of("c", -1.9)
        );
        List<KV<String, Double>> out = Arrays.asList(
                KV.of("a", 2.0),
                KV.of("b", 2.1),
                KV.of("c", -1.9)
        );

        PCollection<KV<String, Double>> pIn = p.apply(Create.of(in));
        PCollection<KV<String, Double>> pOut = pIn.apply(Combine.perKey(new AverageFn()));
        PAssert.that(pOut).containsInAnyOrder(out);
        p.run();
    }
}