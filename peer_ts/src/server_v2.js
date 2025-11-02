
// server.js v2 : candidatArray


const fs = require('fs');
const https = require('https');
const express = require('express');
// const WebSocket = require('ws');
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
// const server = new WebSocket.Server({ server: httpsServer });
httpsServer.listen(8000, '0.0.0.0',() => {
  console.log(' HTTPS server running');
});
// httpsServer.listen(8000,() => {
//   console.log(' HTTPS server running');
// });

/* 외부 접속시 https://192.168.0.3:8000 when opening html */ 
// const WebSocket = require('ws');
// const server = new WebSocket.Server({ port: 8000 , host: '0.0.0.0'});

let socketio = require('socket.io');
let io =  socketio.listen(httpsServer)

const rooms = new Map();
const peers = new Map();

io.on('connection', socket => {
    const id = Math.random().toString(36).substr(2, 9); // generate random ID
    peers.set(id, socket);
    
    
    socket.on('join', room => {
        if (!rooms.has(room)) {
            console.log(`[Server] Room ${room} does not exist, creating new room.`);
            rooms.set(room, new Set());
        }
        socket.join(room);
       
        // 본인 id 전송 0906
        socket.emit('my-id', id);

       // 기존 참가자 목록 전송  (나 자신 제외)
       const existingPeers = [...peers.keys()].filter(peerId => peerId !== id);
       console.log(`[Server] Existing peers in room ${room}:`, existingPeers);
       socket.emit('existing-peers', existingPeers);
       
       // 모두에게 new peer 이벤트 전송 (나 자신 제외)
         socket.to(room).emit('new-peer', id);
        // console.log(`[Server] Peer ${id} joined room ${room}`);
        
         // 디버깅 로그
        console.log(`[room:${room}] join ->`, id);
        // room에 참가한 소켓에 room 정보 저장, data는 기본적으로 {}, 원하는 key 추가가능
        if (!socket.data) socket.data = {};
        socket.data.room = room;

    });
    
 
   socket.on('offer', ({to,data}) => {
        const targetSocket = peers.get(to);
        targetSocket.emit('offer', {from: id, data});
        console.log(`[Server] Offer from ${id} to ${to}`);
    });
    //<kau> Send an answer to the user sent an offer
    socket.on('answer', ({to,data}) => {
        /// peers 객체에서 to에 해당하는 소켓을 찾음
        const targetSocket = peers.get(to);
        targetSocket.emit('answer', {from: id, data});
        console.log(`[Server] Answer from ${id} to ${to}`);
    });
    //<kau> After a user received signal info by offer and answer, it sends the its candidate info to the another peer
    socket.on('candidate', ({to,data}) => {
        const targetSocket = peers.get(to);
        targetSocket.emit('candidate', {from: id, data});
        console.log(`[Server] Candidate from ${id} to ${to}`);
    })

    socket.on('disconnect', () => {
        const room = socket.data.room;
        if (room && rooms.has(room)) {
            const peer = rooms.get(room);
            peer.delete(id);
            socket.to(room).emit('peer-disconnected', id);
            console.log(`[Server] Peer ${id} disconnected from room ${room}`);
        }
    });
});
