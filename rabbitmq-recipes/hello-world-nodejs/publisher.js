var q = 'tasks';

var open = require('amqplib').connect('amqp://user:password@172.18.0.2');

// Publisher
open.then(function(conn) {
    return conn.createChannel();
}).then(function(ch) {
    return ch.assertQueue(q).then(function(ok) {
        return ch.sendToQueue(q, new Buffer('something to do'));
    });
}).catch(console.warn);