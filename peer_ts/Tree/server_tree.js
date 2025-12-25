
// server.js 


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
const httpsServer = https.createServer(options, app);

// 정적 파일 (index.html 등)
app.use(express.static(__dirname));

// WebSocket 서버 붙이기
// const server = new WebSocket.Server({ server: httpsServer });
httpsServer.listen(8000, '0.0.0.0', () => {
    console.log(' HTTPS server running');
});

let socketio = require('socket.io');
let io = socketio.listen(httpsServer)

const rooms = new Map();
// 각 방의 lisOfBroadcasts 의 allpeers의 합
const peers = new Map();
// broadcaster 관리용 객체(맵) (key: roomid, value: { broadcasters: {}, allpeers: {}} )
var listOfBroadcasts = {};
const AVAILABLE_BROADCASTING_NUMBER = 1; // 각 중계자가 감당할 수 있는 최대 시청자 수


io.on('connection', socket => {
    const id = Math.random().toString(36).substr(2, 9); // generate random ID
    // 기존의  id-socket 맵핑을 새로운 Peer 객체로 변경
    // peers.set(id, socket);
    console.log(`[Server] New connection: ${id}`);
    /* 수정: join-mesh 로 변경 */
    socket.on('join', room => {
        if (!rooms.has(room)) {
            console.log(`[Server] Room ${room} does not exist, creating new room.`);
            rooms.set(room, new Set());
        }
        socket.join(room);

        // 본인 id 전송 0906
        // socket.emit('my-id', id);

        // 기존 참가자 목록 전송  (나 자신 제외)
        // const existingPeers = [...peers.keys()].filter(peerId => peerId !== id);
        // console.log(`[Server] Existing peers in room ${room}:`, existingPeers);
        // socket.emit('existing-peers', existingPeers);

        // 모두에게 new peer 이벤트 전송 (나 자신 제외)
        // socket.to(room).emit('new-peer', id);
        // console.log(`[Server] Peer ${id} joined room ${room}`);

        // 디버깅 로그
        console.log(`[room:${room}] join ->`, id);
        // room에 참가한 소켓에 room 정보 저장, data는 기본적으로 {}, 원하는 key 추가가능
        if (!socket.data) socket.data = {};
        socket.data.room = room;

    });

    socket.on('join-reconnection', room => {
        if (!rooms.has(room)) {
            console.log(`[Server] Room ${room} does not exist, creating new room.`);
            rooms.set(room, new Set());
        }
        else {
            console.log(`[Server] Room ${room} exists, joining room.`);
            socket.join(room);
        }


        // Peer type parentid 업데이트
        let peer = peers.get(id);

        var newBroadcaster = getFirstAvailableBroadcaster(peer);
        if (newBroadcaster) {
            if (listOfBroadcasts[peer.roomid].broadcasters[newBroadcaster.peerid].numberOfViewers === 0) {
                // 처음으로 중계자가 된 경우 설정
                console.log('Setting newBroadcaster ', id,'==',peer.peerid, 'as true');
                peer.isBroadcaster = true;
                listOfBroadcasts[peer.roomid].activeBroadcasters[peer.peerid] = peer;
            }
            // 자식 개수 
            listOfBroadcasts[peer.roomid].broadcasters[newBroadcaster.peerid].numberOfViewers++;
            // 자식 노드로 추가
            listOfBroadcasts[peer.roomid].broadcasters[newBroadcaster.peerid].childrenids.push(peer.peerid);
            peer.parentid = newBroadcaster.peerid;
            peer.treeLevel = newBroadcaster.treeLevel + 1; // 부모보다 한 단계 아래 레벨 설정

            if (listOfBroadcasts[peer.roomid].broadcasters[newBroadcaster.peerid].numberOfViewers >= AVAILABLE_BROADCASTING_NUMBER) {
                listOfBroadcasts[peer.roomid].broadcasters[newBroadcaster.peerid].isFull = true;
            }
        }
        // 방송자 목록과 전체 참가자 목록에 Peer 추가
        listOfBroadcasts[peer.roomid].broadcasters[peer.peerid] = peer;
        listOfBroadcasts[peer.roomid].allpeers[peer.peerid] = peer;
        // peers 맵에 Peer 업데이트
        peers.set(id, peer);

        /* Subtree level 재설정 */
        updateSubtreeLevels(peer.roomid, peer.peerid);

        // 자식에게 new parent 이벤트 전송 : 자신의 부모(중계자) ID 전달
        console.log('id: ', id, 'new Parent id:', peer.parentid);
        if (id != peer.parentid) socket.emit('new-parent', peer.parentid);

        // 디버깅 로그
        console.log(`[room:${room}] Tree size`, peers.size);
        // room에 참가한 소켓에 room 정보 저장, data는 기본적으로 {}, 원하는 key 추가가능
        if (!socket.data) socket.data = {};
        socket.data.room = room;

    });
    socket.on('join-broadcast', room => {
        if (!rooms.has(room)) {
            console.log(`[Server] Room ${room} does not exist, creating new room.`);
            rooms.set(room, new Set());
        }
        socket.join(room);

        // Peer type 생성
        /**
         * @type {{peerid: string, socket: any, roomid: string, parentid: string | null, childrenids: string[], 
         * isBroadcaster: boolean, isFull: boolean, numberOfViewers: number, active: boolean, session: any}}
         */
        const peer = {
            peerid: id,
            socket: socket,
            roomid: room,
            parentid: null, // 부모 노드
            childrenids: [],  // 자신을 부모로 삼는 자식 peerid 목록
            isBroadcaster: false,
            isFull: false,
            numberOfViewers: 0,
            treeLevel: -1,  // 트리 레벨, root는 0, 그 다음 자식은 1, 그 다음은 2 ...
            active: true,
            session: null

        };
        if (!listOfBroadcasts[peer.roomid]) {
            listOfBroadcasts[peer.roomid] = {
                broadcasters: {},  /* 추가로 자식을 받을 수 있는 이 방의 중계자들 */
                activeBroadcasters: {}, /* 현재 활성화된 중계자들 ifBroadcaster true인 (Peer > 0) */
                allpeers: {},  /* 이 방의 전체 참가자들 (중계자 포함)*/
                // typeOfStreams: peer.typeOfStreams // object-booleans: audio, video, screen
            };
        }
        // 본인 id 전송 0906
        socket.emit('my-id', id);

        var firstBroadcaster = getFirstAvailableBroadcaster(peer);
        if (firstBroadcaster) {
            if (listOfBroadcasts[peer.roomid].broadcasters[firstBroadcaster.peerid].numberOfViewers === 0) {
                // 처음으로 중계자가 된 경우 설정
                console.log('Setting firstBroadcaster', id, 'as true');
                peer.isBroadcaster = true;
                listOfBroadcasts[peer.roomid].activeBroadcasters[peer.peerid] = peer;
            }
            // 자식 개수 
            listOfBroadcasts[peer.roomid].broadcasters[firstBroadcaster.peerid].numberOfViewers++;
            // 자식 노드로 추가
            listOfBroadcasts[peer.roomid].broadcasters[firstBroadcaster.peerid].childrenids.push(peer.peerid);
            peer.parentid = firstBroadcaster.peerid;
            peer.treeLevel = firstBroadcaster.treeLevel + 1; // 부모보다 한 단계 아래 레벨 설정
            // if(firstBroadcaster.treeLevel === 999) peer.treeLevel = 1; // 루트 노드의 자식은 레벨 0
            // else 

            if (listOfBroadcasts[peer.roomid].broadcasters[firstBroadcaster.peerid].numberOfViewers >= AVAILABLE_BROADCASTING_NUMBER) {
                listOfBroadcasts[peer.roomid].broadcasters[firstBroadcaster.peerid].isFull = true;
            }
        } else {
            console.log('No available broadcaster found, setting as root broadcaster.');
            // Root broadcaster 설정
            peer.isBroadcaster = true;
            peer.treeLevel = 0; // 루트 노드 레벨 설정
            listOfBroadcasts[peer.roomid].activeBroadcasters[peer.peerid] = peer;
            peer.parentid = id; // 자신이 중계자가 됨
            socket.emit('root-broadcaster');
        }
        // 방송자 목록과 전체 참가자 목록에 Peer 추가
        listOfBroadcasts[peer.roomid].broadcasters[peer.peerid] = peer;
        listOfBroadcasts[peer.roomid].allpeers[peer.peerid] = peer;
        // peers 맵에 Peer 저장
        peers.set(id, peer);
        // 자식에게 new parent 이벤트 전송 : 자신의 부모(중계자) ID 전달
        console.log('id: ', id, 'Parent id:', peer.parentid);
        if (id != peer.parentid) socket.emit('new-parent', peer.parentid);



        // 디버깅 로그
        console.log(`[room:${room}] Tree size`, peers.size);
        // room에 참가한 소켓에 room 정보 저장, data는 기본적으로 {}, 원하는 key 추가가능
        if (!socket.data) socket.data = {};
        socket.data.room = room;

    });
    
    function getFirstAvailableBroadcaster(peer) {
        var broadcasters = listOfBroadcasts[peer.roomid].broadcasters;
        var firstResult;

        for (var broadcasterId in broadcasters) {
            var broadcaster = broadcasters[broadcasterId];
            console.log(`[Server] Evaluating broadcaster: ${broadcaster.peerid} at level ${broadcaster.treeLevel}, isFull: ${broadcaster.isFull}`);
            // 1. 후보군 조건 확인 (꽉 차지 않음 && peer보다 상위 레벨)
            if (!broadcaster.isFull) {
                console.log(`[Server] Checking broadcaster: ${broadcaster.peerid} at level ${broadcaster.treeLevel}`);
                if (broadcaster.treeLevel < peer.treeLevel || peer.treeLevel === -1) {
                    // 2. 가장 낮은 treeLevel 선택 로직
                    // 아직 선택된 게 없거나(null), 현재 broadcaster의 레벨이 기존 선택된 것보다 더 낮다면(더 상위라면) 교체
                    if (!firstResult || broadcaster.treeLevel < firstResult.treeLevel) {
                        firstResult = broadcaster;
                        console.log(`[Server] Available broadcaster found: ${broadcaster.peerid} at level ${broadcaster.treeLevel}`);
                    }
                }

            }
            // 3. 조건에 맞지 않는 Broadcaster(꽉 참 등)는 제외
            else {
                delete listOfBroadcasts[peer.roomid].broadcasters[broadcasterId];
            }
        }

        return firstResult;
    }

    function updateSubtreeLevels(roomid, peerId) {
        /* - BFS(너비우선탐색)으로 root에서 아래로 내려가며,
*   child.treeLevel = parent.treeLevel + 1 을 적용한다.
*
* @param {string} roomid       - 방 ID (listOfBroadcasts의 key)
* @param {string} peerId   - "레벨을 기준으로 삼을" 서브트리의 루트 peerid
*/      
        // broadcast && targetpeer 존재 확인
        const broadcast = listOfBroadcasts[roomid];
        if (!broadcast) return;

        const targetPeer = broadcast.allpeers[peerId];
        if (!targetPeer) return;

        const q = [peerId];
        const visited = new Set([peerId]);

        while (q.length) {
            const pid = q.shift(); // 현재 부모로 취급할 노드 peerid를 큐에서 꺼냄
            const parent = broadcast.allpeers[pid]; // pid에 해당하는 peer 객체(부모)를 가져온다.
            if (!parent) continue;

            const parentLevel = parent.treeLevel;
            const children = parent.childrenids || [];

            for (const childId of children) {
                if (visited.has(childId)) continue;

                const child = broadcast.allpeers[childId];
                if (!child) continue;

                // (선택) 트리 일관성 체크: parent.childrenids 안에 있는데 실제 parentid가 다르면 건너뜀
                if (child.parentid !== parent.peerid) continue;

                child.treeLevel = parentLevel + 1;
                console.log(`[Server] Updated treeLevel of peer ${child.peerid} to ${child.treeLevel} (parent: ${parent.peerid} at level ${parentLevel})`);
                // 방문 처리 및 다음 BFS 대상으로 큐에 넣기
                visited.add(childId);
                q.push(childId);
            }
        }
    }

    socket.on('offer', ({ to, data }) => {
        const targetSocket = peers.get(to).socket;
        targetSocket.emit('offer', { from: id, data });
        // console.log(`[Server] Offer from ${id} to ${to}`);
    });
    //<kau> Send an answer to the peer sent an offer
    socket.on('answer', ({ to, data }) => {
        /// peers 객체에서 to에 해당하는 소켓을 찾음
        const targetSocket = peers.get(to).socket;
        targetSocket.emit('answer', { from: id, data });
        // console.log(`[Server] Answer from ${id} to ${to}`);
    });
    //<kau> After a peer received signal info by offer and answer, it sends the its candidate info to the another peer
    socket.on('candidate', ({ to, data }) => {
        const targetSocket = peers.get(to).socket;
        targetSocket.emit('candidate', { from: id, data });
        // console.log(`[Server] Candidate from ${id} to ${to}`);
    })
    // 1029 새로 추가
    socket.on('candidateArray', ({ to, data }) => {
        const targetSocket = peers.get(to).socket;
        targetSocket.emit('candidateArray', { from: id, data });
        console.log(`[Server] Candidate from ${id} to ${to}`);
    })

    socket.on('disconnect', () => {
        console.log(`[Server] Peer ${id} disconnected.`);
        const room = socket.data.room;
        if (!room || !rooms.has(room)) return;

        const peer = peers.get(id);  // id -> peer 객체
        if (!peer) return;

        const broadcast = listOfBroadcasts[peer.roomid];
        if (!broadcast) return;
        console.log('[Server] Handling disconnection of peer ', peer.peerid);
        // 1) 부모의 numberOfViewers 감소
        if (peer.parentid && peer.parentid !== peer.peerid) {
            const parent = broadcast.allpeers[peer.parentid];
            if (parent) {
                parent.numberOfViewers = Math.max(0, parent.numberOfViewers - 1);
                // 만약 꽉 차서 isFull 이었는데, 다시 자리가 생겼다면 풀어주기
                if (parent.numberOfViewers < AVAILABLE_BROADCASTING_NUMBER) {
                    console.log('[Sever] Setting parent ', parent.peerid, ' as not full');
                    parent.isFull = false;
                    console.log('[Server] Previous broadcasters ', broadcast.broadcasters);
                    listOfBroadcasts[peer.roomid].broadcasters[parent.peerid] = parent;

                }
                // parent.childrenids 에서 이 peerid 제거
                parent.childrenids = parent.childrenids.filter(childId => childId !== peer.peerid);
            }
        }

        // 2) 이 피어를 broadcasters/activeBroadcasters/allpeers에서 제거
        delete broadcast.broadcasters[peer.peerid];
        delete broadcast.activeBroadcasters[peer.peerid];
        delete broadcast.allpeers[peer.peerid];

        console.log('[Server] Removed peer from broadcasters and allpeers:', broadcast.allpeers);
        // 3) rooms / peers 맵 정리
        const roomSet = rooms.get(room);
        roomSet && roomSet.delete(id);
        peers.delete(id);

        console.log(`[Server] Peer ${id} disconnected from room ${room}`);
        console.log('[Server] Updated broadcasters ', broadcast.broadcasters);
        // 4) 자식 서브트리 처리 
        // (아래에서 별도 함수로 처리 할지 클라이언트 쪽에서 Disconnected 되었을 때 처리 하는 과정으로 넘어가도록 할 지)
        // handleChildrenOnDisconnect(peer, broadcast);
    });

});



