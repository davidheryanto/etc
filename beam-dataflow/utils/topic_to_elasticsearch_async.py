import asyncio
import json

from elasticsearch_async import AsyncElasticsearch
from google.cloud import pubsub

loop = asyncio.get_event_loop()
es = AsyncElasticsearch()


async def insert(msg):
    global es, loop
    data = json.loads(msg.data.decode('utf-8'))
    await es.index(index='myindex', doc_type='pubsub', body=data)
    msg.ack()


def callback(msg):
    loop.run_until_complete(insert(msg()))


topic = 'projects/PROJECT/topics/TOPIC'
subscription_name = 'projects/PROJECT/subscriptions/SUBSCRIPTION'

subscriber = pubsub.SubscriberClient()
subscription = subscriber.subscribe(subscription_name)
future = subscription.open(callback)
future.result()
