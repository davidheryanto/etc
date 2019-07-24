import gzip
from multiprocessing import Process
from kafka import KafkaProducer

total_line_count = 7016125
process_count = 6
partition_size = 7016125 // 6


def produce_from_file(file_path, partition_index):
    lower_limit = partition_index * partition_size
    upper_limit = (
        (partition_index + 1) * partition_size
        if partition_index != (process_count - 1)
        else total_line_count
    )

    producer = KafkaProducer(bootstrap_servers="localhost:9092")
    with gzip.open(file_path) as gzip_file:
        for line_index, line in enumerate(gzip_file):
            if lower_limit <= line_index < upper_limit:
                producer.send(topic="test1", value=line)
    producer.flush()


processes = []
for process_index in range(process_count):
    process = Process(
            target=produce_from_file,
            args=(
                "/data/new_york_taxi_trips/new_york_taxi_trips_fhv_2016-000000000000.csv.gz",
                process_index,
            ),
        )
    process.start()
    processes.append(process)

for p in processes:
    p.join()
