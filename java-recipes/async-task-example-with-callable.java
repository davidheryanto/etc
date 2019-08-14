import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

// Reference:
// https://www.baeldung.com/java-runnable-callable

public class AsyncTaskExample {
  public static void main(String[] args) {
    ExecutorService executorService = Executors.newSingleThreadExecutor();
    Future<Integer> done =
        executorService.submit(
            () -> {
              System.out.println("Sleeping for 3 seconds");
              try {
                Thread.sleep(3000);
              } catch (InterruptedException e) {
                e.printStackTrace();
              }
              // 50% chance of the callable returning an exception
              if (Math.random() > 0.5) {
                throw new Exception("Test raising exception");
              }
              System.out.println("Done");
              return 1;
            });
    System.out.println("Waiting for callable to finish ...");
    try {
      int result = done.get();
      System.out.println("Result of callable is " + result);
    } catch (Exception e) {
      e.printStackTrace();
    } finally {
      System.out.println("Shutting down executorService");
      executorService.shutdown();
    }
  }
}
