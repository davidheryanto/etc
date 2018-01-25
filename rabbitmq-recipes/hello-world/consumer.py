import pika

parameters = pika.URLParameters('amqp://dheryanto:password@10.254.0.2:5672/%2F')
connection = pika.BlockingConnection(parameters)
channel = connection.channel()
channel.queue_declare('hello')


def callback(ch, method, properties, body):
    print(" [x] Received %r" % body)


channel.basic_consume(callback,
                      queue='hello',
                      no_ack=True)

print(' [*] Waiting for messages. To exit press CTRL+C')
channel.start_consuming()