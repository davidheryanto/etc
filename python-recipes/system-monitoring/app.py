import os
from datetime import datetime
import random
import time
import threading
from prometheus_client import (
    start_http_server,
    Gauge,
    Counter,
    PROCESS_COLLECTOR,
    PLATFORM_COLLECTOR,
)
import psutil
from prometheus_client.registry import REGISTRY

label_names = ["mylabel"]
label_values = ["myvalue"]


def collect_cpu_stats(interval_sec=5):
    g = Gauge("cpu_percent", "Percentage of CPU consumed", label_names)
    while True:
        g.labels(*label_values).set(psutil.cpu_percent(interval=0.1))
        time.sleep(interval_sec)


def collect_memory_stats(interval_sec=5):
    g = Gauge("memory_percent", "Percentage of memory consumed", label_names)
    while True:
        m = psutil.virtual_memory()
        g.labels(*label_values).set(m.used / m.total * 100.0)
        time.sleep(interval_sec)


if __name__ == "__main__":
    print("Starting metric exporter in the background...")

    # Skip sending python_* metrics
    REGISTRY.unregister(PROCESS_COLLECTOR)
    REGISTRY.unregister(PLATFORM_COLLECTOR)
    REGISTRY.unregister(
        REGISTRY._names_to_collectors["python_gc_objects_collected_total"]
    )

    # Run monitoring functions in the background
    threading.Thread(target=start_http_server, kwargs={"port": 8080}).start()
    threading.Thread(target=collect_cpu_stats).start()
    threading.Thread(target=collect_memory_stats).start()

    print("Program starting...")
    while True:
        time.sleep(random.randrange(1, 11))
        print(datetime.now(), "Running...")
