import java.io.FileInputStream;
import java.io.IOException;
import org.apache.arrow.memory.RootAllocator;
import org.apache.arrow.vector.BigIntVector;
import org.apache.arrow.vector.VectorSchemaRoot;
import org.apache.arrow.vector.ipc.ArrowFileReader;
import org.apache.arrow.vector.ipc.SeekableReadChannel;
import org.apache.arrow.vector.ipc.message.ArrowBlock;
import org.apache.arrow.vector.types.pojo.Schema;

// References:
// https://github.com/animeshtrivedi/blog/blob/master/post/2017-12-26-arrow.md
// https://github.com/animeshtrivedi/ArrowExample/blob/master/src/main/java/com/github/animeshtrivedi/arrowexample/ArrowRead.java

public class Main {

  public static void main(String[] args) throws IOException {
    System.setProperty("io.netty.tryReflectionSetAccessible", "true");

    RootAllocator rootAllocator = new RootAllocator();
    FileInputStream fileInputStream = new FileInputStream("../python/bikeshare.arrow");
    SeekableReadChannel seekableReadChannel = new SeekableReadChannel(fileInputStream.getChannel());
    ArrowFileReader arrowFileReader = new ArrowFileReader(seekableReadChannel, rootAllocator);
    VectorSchemaRoot root = arrowFileReader.getVectorSchemaRoot(); // get root
    Schema schema = root.getSchema(); // get schema
    System.out.println(schema);

    for (ArrowBlock arrowBlock : arrowFileReader.getRecordBlocks()) {
      arrowFileReader.loadRecordBatch(arrowBlock);
      BigIntVector bigIntVector = (BigIntVector) root.getFieldVectors().get(0);

      int nullValCount = 0;
      int valCount = 0;

      for (int i = 0; i < bigIntVector.getValueCount(); i++) {
        if (bigIntVector.isNull(i)) {
          nullValCount += 1;
        } else {
          valCount += 1;
          System.out.print(bigIntVector.get(i));
        }
      }

      System.out.println();
      System.out.println("nullValCount: " + nullValCount);
      System.out.println("valCount: " + valCount);
    }
  }
}
