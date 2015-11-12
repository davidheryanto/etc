from __future__ import print_function

import os
import csv
import random
import time
from multiprocessing import Process, Value, Lock, Manager, Pool
from joblib import Parallel, delayed


# http://eli.thegreenplace.net/2012/01/04/shared-counter-with-pythons-multiprocessing

class Counter(object):
    def __init__(self, manager, initval=0):
        self.val = manager.Value('i', initval)
        self.lock = manager.Lock()

    def increment(self):
        with self.lock:
            self.val.value += 1

    def value(self):
        with self.lock:
            return self.val.value


def find_path(start, end, result, counter, total):
    for _ in range(50):
        time.sleep(random.random() / 10.0)
        counter.increment()
    result[i] = counter.value()


def get_nodes():
    nodes = []
    with open('C:/data/entity_resolution/redmart/output.tsv', 'rb') as fi:
        reader = csv.DictReader(fi)
        for row in reader:
            nodes.append(row['RegNum'])
    return nodes


def f(args):
    counter = args[1]
    print('Proc {} starts'.format(os.getpid()))
    for _ in range(50):
        time.sleep(random.random() / 10.0)
        counter.increment()
    print('Proc {} ends'.format(os.getpid()))


def g(counter):
    print('Proc {} starts'.format(os.getpid()))
    for _ in range(50):
        time.sleep(random.random() / 10.0)
        counter.increment()
    print('Proc {} ends'.format(os.getpid()))


def main():
    manager = Manager()
    result = manager.dict()
    counter = Counter(manager, 0)
    # nodes = get_nodes()
    # node_pairs = ((n1, n2) for n1 in nodes for n2 in nodes)
    # node_pairs_count = len(node_pairs)

    # pool = Pool(processes=4)
    # pool.map(f, ((_, counter) for _ in range(10)))
    # print('Count: {}'.format(counter.value()))
    # print(result)
    # print()

    Parallel(n_jobs=4)(delayed(g)(counter) for _ in range(10))
    print('Count: {}'.format(counter.value()))


if __name__ == '__main__':
    main()
