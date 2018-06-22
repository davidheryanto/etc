import json

from elasticsearch import Elasticsearch
from google.cloud import pubsub


def callback(msg):
    global es
    data = json.loads(msg.data.decode('utf-8'))
    es.index(index='myindex', doc_type='pubsub', body=data)
    msg.ack()

topic = 'projects/PROJECT/topics/TOPIC'
subscription_name = 'projects/PROJECT/subscriptions/SUBSCRIPTION'

es = Elasticsearch()
subscriber = pubsub.SubscriberClient()

subscription = subscriber.subscribe(subscription_name)
future = subscription.open(callback)
future.result()
