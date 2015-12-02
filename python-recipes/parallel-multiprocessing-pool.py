#!/usr/bin/python
# -*- coding: utf-8 -*-
# https://docs.python.org/2/library/multiprocessing.html

# Single arg in f()

from multiprocessing import Pool


def f(x):
    return x * x


if __name__ == '__main__':
    p = Pool(5)
    print p.map(f, [1, 2, 3])


# Multiple args in f()

def f(args):
    (x, y, z) = args
    return x * y * z


if __name__ == '__main__':
    p = Pool(5)
    args = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
    print p.map(f, args)

			