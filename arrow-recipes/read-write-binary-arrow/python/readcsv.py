from pyarrow import csv
import pyarrow as pa

if __name__ == "__main__":
    table = csv.read_csv("bikeshare.csv")
    print(table.to_pandas())
    batches = table.to_batches()
    with open("bikeshare.arrow", "wb") as sink:
        for batch in batches:
            writer = pa.RecordBatchFileWriter(sink, batch.schema)
            writer.write_batch(batch)
            writer.close()
