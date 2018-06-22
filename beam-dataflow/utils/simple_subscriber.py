from google.cloud import pubsub
import time

subscriber = pubsub.SubscriberClient()
subscription_path = subscriber.subscription_path(
    'project1', 'subscription1')

def callback(message):
    print('Received message: {}'.format(message))
    print('Publish time: {}'.format(message.publish_time))
    message.ack()

subscriber.subscribe(subscription_path, callback=callback)

# The subscriber is non-blocking, so we must keep the main thread from
# exiting to allow it to process messages in the background.
print('Listening for messages on {}'.format(subscription_path))
while True:
    time.sleep(60)