var q = 'tasks';

var open = require('amqplib').connect('amqp://user:password@172.18.0.2');

// Consumer
open.then(function(conn) {
    return conn.createChannel();
}).then(function(ch) {
    return ch.assertQueue(q).then(function(ok) {
        return ch.consume(q, function(msg) {
            if (msg !== null) {
                console.log(msg.content.toString());
                ch.ack(msg);
            }
        });
    });
}).catch(console.warn);

console.log('Hello')
setTimeout(() => console.log('After 5 seconds'), 5000)