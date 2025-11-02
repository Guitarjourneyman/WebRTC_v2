
// server.js 

// Node.js 내장 모듈 http 가져옴. HTTP 서버를 만들기 위해 사용됨. 
// const http = require('http');
// // Express 프레임워크를 사용하여 HTTP 서버를 쉽게 만들기 위해 express 모듈을 가져옴.
// // Express는 Node.js에서 웹 애플리케이션을 구축하기 위한 프레임
// const express = require('express');
// // WebSocket 프로토콜을 사용하여 실시간 양방향 통신을 가능하게 하는 ws 모듈을 가져옴.
// // WebSocket은 클라이언트와 서버 간의 지속적인 연결을 유지하여 실시간 데이터 전송을 가능하게 함.
// const WebSocket = require('ws');
// // path 모듈을 가져와 파일 경로를 다루기 쉽게 함.
// // path 모듈은 파일 경로를 조작하고, 경로를 정규
// const path = require('path');
// // 현재 디렉토리(__dirname)를 사용하여 정적 파일을 제공하기 위한 Express 애플리케이션을 생성함.
// // __dirname은 현재 모듈의 디렉토리 이름을 나타냄 
// const app = express();
// app.use(express.static(__dirname));

// const httpServer = http.createServer(app);
// const server = new WebSocket.Server({ server: httpServer });

// httpServer.listen(8000, () => console.log('HTTP/WS on :8000'));

const fs = require('fs');
const https = require('https');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();

// HTTPS 인증서
const options = {
    key: fs.readFileSync('C:\\Windows\\System32\\key.pem'), // <kau> added to resolve https issues
    cert: fs.readFileSync('C:\\Windows\\System32\\cert.pem')
};

// HTTPS 서버 생성
const httpsServer = https.createServer(options,app);

// 정적 파일 (index.html 등)
app.use(express.static(__dirname));

// WebSocket 서버 붙이기
const server = new WebSocket.Server({ server: httpsServer });

httpsServer.listen(8000, () => {
  console.log(' HTTPS server running');
});

/* 외부 접속시 https://192.168.0.3:8000 when opening html */ 
// const WebSocket = require('ws');
// const server = new WebSocket.Server({ port: 8000 , host: '0.0.0.0'});

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
        if (type === 'join' && peers.size > 0) {
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
