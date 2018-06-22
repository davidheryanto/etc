import datetime
import os
import time

from google.cloud import pubsub

os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8085'

msg_per_second = 5

publisher = pubsub.PublisherClient()
topic_path = publisher.topic_path('project1', 'topic1')

msg_no = 1

while True:
    for _ in range(msg_per_second):
        curtime = datetime.datetime.now().strftime('%H:%M:%S')
        data = f'[{curtime} Message No {msg_no}]'
        data = data.encode('utf-8')
        publisher.publish(topic_path, data=data)
        msg_no += 1
    print(f'[{curtime}] Published {msg_no - 1} messages')
    time.sleep(1)
