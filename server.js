const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8000 });

const peers = new Map();
let lastPeerId = null;

server.on('connection', socket => {
    const id = Math.random().toString(36).substr(2, 9); // generate random ID
    peers.set(id, socket);
    console.log('current lastPeerId: ', lastPeerId);
    
    // To the previous peer
    if(lastPeerId && peers.has(lastPeerId)){
        const previousSocket = peers.get(lastPeerId);
        previousSocket.send(JSON.stringify({
                type: 'newPeer',
                id,
                data: id
            }));
        console.log(`[Server] new peer Id(${id}) to ${lastPeerId}`);
    }
   
   
   
    socket.on('message', raw => {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            console.error(`[Server] Invalid JSON:`, data);
            return;
        }
        const {type, targetId, data} = parsed;
            console.log(`[Server] Received message from ${id}: ${parsed.data}`);
        // To the new peer
        if (type === 'join') {
            console.log(`[Server] New peer connected: ${id}`);
            socket.send(JSON.stringify({
            type: 'join',
            id,
            data: lastPeerId
        }));

        // update lastPeerId 
        lastPeerId = id;
    }
        else{
            const targetSocket = peers.get(targetId);
            if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                targetSocket.send(JSON.stringify({
                    type,
                    id,       // senderId
                    data
                }));
                console.log(`[Server] Forwarded ${type} from ${id} → ${targetId}`);
                } 
            else {
                console.warn(`[Server] targetId ${targetId} not found or not open.`);
                }
            }
        });


    socket.on('close', () => {
        console.log(`[Server] Client disconnected: ${id}`);
        peers.delete(id);
        if (lastPeerId === id) {
            lastPeerId = null;
            if (peers.size > 0) {
                lastPeerId = Array.from(peers.keys()).at(-1);
                console.log(`[Server] Updated lastPeerId to: ${lastPeerId}`);
            }
        }
    });
});
