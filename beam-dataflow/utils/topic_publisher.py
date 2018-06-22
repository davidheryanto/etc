import datetime
import json
import os
import time

from google.cloud import pubsub

os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8085'

msg_per_second = 20
msg_count = 0
datapath = '/data/pubsub/topic.json'

publisher = pubsub.PublisherClient()
topic_path = publisher.topic_path('project1', 'topic1')

f = open(datapath)

while True:
    for i in range(msg_per_second):
        line = f.readline().strip()

        if not line:
            f = open(datapath)
            line = f.readline().strip()

        data = json.loads(line)['_source']
        bytedata = json.dumps(data).encode('utf-8')
        publisher.publish(topic_path, data=bytedata, ts_value=datetime.datetime.now().isoformat())
        msg_count += 1

    curtime = datetime.datetime.now().strftime('%H:%M:%S')
    print(f'[{curtime}] Published {msg_count} messages')
    time.sleep(1)

