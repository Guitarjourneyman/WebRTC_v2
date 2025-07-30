const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8000 });

const clients = new Map();

server.on('connection', socket => {
    const id = Math.random().toString(36).substr(2, 9); // generate random ID
    clients.set(id, socket);
    console.log(`[Server] Client connected: ${id}`);

    socket.on('message', message => {
        console.log(`[Server] Received message from ${id}: ${message}`);

        // Forward message to all other clients
        for (let [otherId, clientSocket] of clients.entries()) {
            if (otherId !== id && clientSocket.readyState === WebSocket.OPEN) {
                clientSocket.send(message);
            }
        }
    });

    socket.on('close', () => {
        console.log(`[Server] Client disconnected: ${id}`);
        clients.delete(id);
    });
});
