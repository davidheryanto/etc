from __future__ import print_function

import os
import random
import time
from multiprocessing import Process, Value, Lock


# http://eli.thegreenplace.net/2012/01/04/shared-counter-with-pythons-multiprocessing

class Counter(object):
    def __init__(self, initval=0):
        self.val = Value('i', initval)
        self.lock = Lock()

    def increment(self):
        with self.lock:
            self.val.value += 1

    def value(self):
        with self.lock:
            return self.val.value


def f(counter):
    print('Proc {} starts'.format(os.getpid()))
    for _ in range(50):
        time.sleep(random.random() / 10.0)
        counter.increment()
    print('Proc {} ends'.format(os.getpid()))


def main():
    counter = Counter(0)
    procs = [Process(target=f, args=(counter,)) for i in range(10)]
    for p in procs: p.start()
    for p in procs: p.join()
    print(counter.value())


if __name__ == '__main__':
    main()
