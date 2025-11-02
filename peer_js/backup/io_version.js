import React, { useEffect, useRef, useState } from "react";
// 1. socket.io-client 라이브러리 import.
import io from 'socket.io-client';

export default function App() {
    // 2. peers Map 객체를 ref로 관리. peerId를 key로 RTCPeerConnection 객체를 저장해 다중 피어 연결 관리.
    const peers = useRef(new Map());
    const localStreamRef = useRef(null); // 로컬 스트림 저장용 ref
    const socketRef = useRef(null); // 소켓 인스턴스 저장용 ref
    const [remoteStreams, setRemoteStreams] = useState([]); // 원격 스트림 배열 상태 관리 및 비디오 렌더링

    useEffect(() => {
        // 3. socket.io 서버 연결. 자체 서명 SSL 인증서 사용 시 옵션 필요.
        socketRef.current = io('https://192.168.0.6:8000', {
        });
        const socket = socketRef.current;

        // 4. 연결 완료 후 'join' 이벤트와 방 이름('my-room') 전송.
        socket.on('connect', () => {
            console.log('[Socket.IO] 서버 연결됨.');
            socket.emit('join', 'my-room');
        });

        // 5. 서버로부터 고유 ID 수신.
        socket.on('my-id', (id) => {
            console.log(`[Socket.IO] 내 ID 수신: ${id}`);
        });

        // 6. 방에 존재하는 기존 피어 목록 수신.
        socket.on('existing-peers', (existingPeers) => {
            console.log('[Socket.IO] 기존 참가자 목록:', existingPeers);
            // 각 기존 피어에게 offer 전송하여 연결 요청.
            existingPeers.forEach(peerId => {
                createOffer(peerId);
            });
        });

        // 7. 새로운 피어 접속 알림 수신.
        socket.on('new-peer', (peerId) => {
            console.log(`[Socket.IO] 새로운 피어 접속: ${peerId}`);
            // 새로운 피어가 offer를 보내므로, 수신 대기.
        });

        // 8. 다른 피어로부터 Peer offer 수신.
        socket.on('offer', async ({ from, data }) => {
            console.log(`[Socket.IO] ${from}로부터 Offer 수신함.`);
            const pc = createPeerConnection(from);
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // 생성한 answer를 offer 송신자에게 전송.
            socket.emit('answer', { to: from, data: answer });
            console.log(`[Socket.IO] ${from}에게 Answer 전송함.`);
        });

        // 9. 전송했던 offer에 대한 answer 수신.
        socket.on('answer', async ({ from, data }) => {
            console.log(`[Socket.IO] ${from}로부터 Answer 수신함.`);
            const pc = peers.current.get(from);
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(data));
            }
        });

        // 10. ICE candidate 정보 수신.
        socket.on('candidate', async ({ from, data }) => {
            console.log(`[Socket.IO] ${from}로부터 Candidate 수신함.`);
            const pc = peers.current.get(from);
            if (pc && data) {
                await pc.addIceCandidate(new RTCIceCandidate(data));
            }
        });

        // 11. 피어 연결 종료 시 처리.
        socket.on('peer-disconnected', (peerId) => {
            console.log(`[Socket.IO] ${peerId} 연결 종료됨.`);
            peers.current.get(peerId)?.close();
            peers.current.delete(peerId);
            setRemoteStreams(prevStreams => prevStreams.filter(stream => stream.id !== peerId));
        });

        // 컴포넌트 언마운트 시 소켓 연결 종료.
        return () => {
            socket.disconnect();
        };
    }, []);

    // 특정 피어에게 offer 생성 및 전송 함수.
    const createOffer = async (peerId) => {
        const pc = createPeerConnection(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socketRef.current.emit('offer', { to: peerId, data: offer });
        console.log(`[Peer] ${peerId}에게 Offer 전송함.`);
    };

    // 12. RTCPeerConnection 객체 생성 및 이벤트 리스너 설정 함수.
    const createPeerConnection = (peerId) => {
        const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        const pc = new RTCPeerConnection(configuration);

        // 생성된 RTCPeerConnection 객체를 peers Map에 저장.
        peers.current.set(peerId, pc);

        // ICE candidate 생성 시 상대 피어에게 전송.
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current.emit('candidate', {
                    to: peerId,
                    data: event.candidate
                });
            }
        };
        
        // 연결 상태 변경 감지.
        pc.onconnectionstatechange = () => {
            console.log(`[Peer] ${peerId} 연결 상태: ${pc.connectionState}`);
        };

        // 상대 스트림 수신 시 비디오 태그에 연결.
        pc.ontrack = (event) => {
            console.log(`[Peer] ${peerId}로부터 스트림 수신함.`);
            setRemoteStreams(prevStreams => {
                // 중복 스트림 추가 방지.
                if (prevStreams.some(stream => stream.id === peerId)) {
                    return prevStreams;
                }
                return [...prevStreams, { id: peerId, stream: event.streams[0] }];
            });
        };

        // 로컬 스트림 존재 시, 새로운 피어 연결에 트랙 추가.
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });
        }
        
        return pc;
    };

    // 13. 'Send My Video' 버튼 클릭 이벤트. 로컬 미디어 스트림을 모든 피어에게 전송.
    const sendMyVideo = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream; // 로컬 스트림 저장
            console.log('[Peer] 로컬 비디오 스트림 가져옴.');

            // 현재 연결된 모든 피어에게 로컬 스트림 트랙 추가.
            for (const pc of peers.current.values()) {
                stream.getTracks().forEach(track => {
                    pc.addTrack(track, stream);
                });
            }
        } catch (e) {
            console.error('[Peer] 로컬 미디어 스트림 가져오기 실패:', e);
        }
    };

    return (
        <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
            <h2>Peer with Socket.IO (React)</h2>
            <div style={{ marginBottom: 12 }}>
                <button onClick={sendMyVideo}>Send My Video</button>
            </div>
            {/* 14. remoteStreams 상태 배열 순회, 각 원격 비디오 렌더링. */}
            <div id="video-grid">
                {remoteStreams.map(({ id, stream }) => (
                    <video
                        key={id}
                        autoPlay
                        playsInline
                        ref={video => {
                            if (video) video.srcObject = stream;
                        }}
                        style={{ width: 480, height: 240, background: "#030303ff", margin: 4 }}
                    />
                ))}
            </div>
        </div>
    );
}