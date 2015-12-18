#!/usr/bin/python
# -*- coding: utf-8 -*-
# https://docs.python.org/2/library/multiprocessing.html

# Single arg in f()

from multiprocessing import Pool
from itertools import izip_longest

def grouper(iterable, n, fillvalue=None):
    """Collect data into fixed-length chunks or blocks"""
    # grouper('ABCDEFG', 3, 'x') --> ABC DEF Gxx
    args = [iter(iterable)] * n
    return izip_longest(fillvalue=fillvalue, *args)

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

			