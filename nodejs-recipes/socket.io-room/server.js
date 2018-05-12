var io;

var server = require('http').createServer((req, res) => {

    // now, it's easy to send a message to just the clients in a given room
    room = "abc123";
    io.sockets.in(room).emit('message', 'what is going on, party people? ' + new Date());

    // this message will NOT go to the client defined above
    io.sockets.in('foobar').emit('message', 'anyone in this room yet?');

    res.end();
});

io = require('socket.io')(server);

// handle incoming connections from clients
io.sockets.on('connection', function(socket) {
    // once a client has connected, we expect to get a ping from them saying what room they want to join
    socket.on('room', function(room) {
        socket.join(room);
    });
});

console.log('Server listening on port 3001')
console.log('Open http://localhost:3002 then look at the developer console')
console.log('Do a GET http://localhost:3001 to send a message to the client in the browser')
server.listen(3001)