import sys
import time

"""
Refer to https://redis.io/topics/mass-insert
============================================================
The input data is in this format:
key1  val1_a,val1_b,val1_c
key2  val2_a,val2_b

Usage
============================================================
python main.py "path/to/input.csv" | redis-cli --pipe

What this does is: 
- Convert the csv to strings of redis protocol and write the result stream to stdout
- Simultaneously, pipe the stdout to "redis-cli --pipe"

This let us do insertion without writing to temporary files (instead 
pipe it directly to redis-cli). Hence, the whole operation is faster.
"""


def main():
    input_path = sys.argv[1]
    start_time = time.monotonic()

    with open(input_path) as input_file:
        buffer_size = 128
        protocol = ''
        for i, line in enumerate(input_file):
            key, value = line.split('\t')
            values = value.strip().split(',')
            protocol += f'*{2+len(values)}\r\n${5}\r\nRPUSH\r\n${len(key)}\r\n{key}\r\n'
            protocol += ''.join([f'${len(v)}\r\n{v}\r\n' for v in values])
            if i > 0 and i % buffer_size == 0:
                print(protocol, end='')
                protocol = ''
        print(protocol, end='')

if __name__ == '__main__':
    # Takes one argument: the path to csv file
    main()
