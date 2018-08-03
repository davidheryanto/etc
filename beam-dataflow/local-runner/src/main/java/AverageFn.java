import org.apache.beam.sdk.coders.AvroCoder;
import org.apache.beam.sdk.coders.DefaultCoder;
import org.apache.beam.sdk.transforms.Combine;


public class AverageFn extends Combine.CombineFn<Double, AverageFn.Accum, Double> {
    // Apparently this coder annotation is necessary
    @DefaultCoder(AvroCoder.class)
    public static class Accum {
        double sum = 0;
        int count = 0;
    }

    @Override
    public Accum createAccumulator() {
        return new Accum();
    }

    @Override
    public Accum addInput(Accum accum, Double input) {
        accum.sum += input;
        accum.count++;
        return accum;
    }

    @Override
    public Accum mergeAccumulators(Iterable<Accum> accums) {
        Accum merged = createAccumulator();
        for (Accum accum : accums) {
            merged.sum += accum.sum;
            merged.count += accum.count;
        }
        return merged;
    }

    @Override
    public Double extractOutput(Accum accum) {
        return ((double) accum.sum) / accum.count;
    }
}