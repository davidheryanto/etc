import pika

parameters = pika.URLParameters('amqp://dheryanto:password@10.254.0.2:5672/%2F')
connection = pika.BlockingConnection(parameters)
channel = connection.channel()
channel.queue_declare('hello')

channel.basic_publish(exchange='',
                      routing_key='hello',
                      body='Hello World')
print('[x] Sent Hello World')
connection.close()
