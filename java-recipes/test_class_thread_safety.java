// https://codurance.com/2015/12/13/testing-multithreaded-code-in-java/
// https://github.com/npryce/goos-code-examples/tree/master/testing-multithreaded-code/src/book/example/threading/races

class Counter {
    private int count = 0;

    int getCount() {
      return count;
    }

    void increment() {
      count += 1;
    }
  }

class SafeCounter {
  private AtomicInteger count = new AtomicInteger();

  int getCount() {
    return count.get();
  }

  void increment() {
   count.incrementAndGet();
  }
}

@Test
public void deleteme() throws InterruptedException {
  int iterationCount = 20_000;
  int threadCount = 8;
  SafeCounter counter = new SafeCounter();
  
  // Swap with "non-safe" counter to see expected != actual 
  // Counter counter = new Counter();

  CountDownLatch finished = new CountDownLatch(threadCount);
  ExecutorService executor = Executors.newCachedThreadPool();

  for (int i = 0; i < threadCount; i++) {
    executor.execute(
        () -> {
          try {
            for (int i1 = 0; i1 < iterationCount; i1++) {
              counter.increment();
            }
          } finally {
            finished.countDown();
          }
        });
  }
  finished.await();

  int expected = iterationCount * threadCount;
  int actual = counter.getCount();
  System.out.printf("expected:%d, actual:%d", expected, actual);
}