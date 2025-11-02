import React, { use, useCallback, useEffect, useRef, useState } from 'react';
// import logo from './logo.svg';
import './App.css';
import io from 'socket.io-client';
// import Video from './component/remoteVideo';


export interface WebRTCUser{
    id: string;
    socket: SocketIOClient.Socket;
    stream: MediaStream;
}


// 소켓 인스턴스를 컴포넌트 외부에서 한 번만 생성하여 재렌더링 시 재생성을 방지합니다.
const socket = io('http://192.168.0.3:8000', { autoConnect: false });
function App() {
    console.log('Rendering... ');
    
    // Record<<K,T> : TS utility type
    const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
    const pcRef = useRef<RTCPeerConnection>(null);
    const localStreamRef = useRef<MediaStream>(null);
    // user 상태 관리
    const [users, setUsers] = useState<WebRTCUser[]>([]);

    const pcConfig : RTCConfiguration = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    
    // useCallback을 사용하여 createPeerConnection 함수를 메모이제이션
    const getLocalStream = useCallback( async () => {
        try {
            console.log('getLocalStream...');
            // localStreamRef로 컴포넌트 전체에서 사용
            localStreamRef.current = (await navigator.mediaDevices.getUserMedia({ video: true, audio: true }));
            const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
                if (localVideo) {
                     localVideo.srcObject = localStreamRef.current;
                }
             const room = 'testRoom'; // Example room name    
        
        socket.on('connect', () => {
                console.log('[Peer] Connected to signaling server');
                socket.emit('join', room);
            });

        socket.on('existing-peers',  (peers: Record<string, any>) => {
                console.log('[Peer] Existing peers in room:', peers);
                peers.forEach(async (peerid: string) => {
                    console.log('[Peer] createPeerConnection:', peerid);
                    const pc =  createPeerConnection(peerid);
                    // Store the peer connection in the ref
                    pcsRef.current[peerid] = pc;
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('signal', { to: peerid, data: offer });
                    console.log(`[Peer] Sent Offfer `);
                });
        });
        socket.on('signal', async ({from, data}: {from: string, data: any}) => {
            
            console.log(`[Peer] Received signal from ${from}:`, data);

            if (data.type === 'offer') {
                // answerer
                console.log(`[Peer] Received offer from ${from}`);
                // localStreamRef.current = (await navigator.mediaDevices.getUserMedia({ video: true, audio: true }));
                pcsRef.current[from] = createPeerConnection(from);
                const pc = pcsRef.current[from];
                await pc.setRemoteDescription(new RTCSessionDescription(data));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('signal', { to: from, data: answer });
                console.log(`[Peer] Sent Answer to ${from}`);
            }
            else if(data.type === 'answer') {
                const pc = pcsRef.current[from];
                // offerer
                if (!pc) {
                    console.error('RTCPeerConnection is not initialized.');
                return;
                }
                console.log('[Peer] Received answer.');
                await pc.setRemoteDescription(new RTCSessionDescription(data));
                
            }
            else if(data.type === 'candidate') {
                const pc = pcsRef.current[from];
                if(pc) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
                
            }

            socket.on('disconnect', (peerId: string) => {
                console.log(`[Peer] Peer ${peerId} disconnected`);
                if (pcsRef.current[peerId]) {
                    pcsRef.current[peerId].close();
                    delete pcsRef.current[peerId];
                    // user 상태에서 해당 유저 제거
                    setUsers(prev => prev.filter(u => u.id !== peerId))
                }
            });
        });
        // 수동으로 연결 시작
        socket.connect();
        }
        catch (error) {
            console.error('Error accessing media devices.', error);
        }},[]);


    // 비디오 컴포넌트 이외는 한 번만 렌더링
    useEffect(() =>  
        {
        console.log('useEffect...');
        // socket eventListener 설정 모두 getLocalStream 내부로 이동 : LocalStream과 race condition 방지
        getLocalStream();
       
        }, []);

    // useCallback을 사용하여 createPeerConnection 함수를 메모이제이션
    const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
            console.log(`[Peer] Creating peer connection for ${peerId}`);
            const pc = new RTCPeerConnection(pcConfig);

            if (localStreamRef.current !== null) {
                console.log('[Peer] Add local stream to peer connection');
                localStreamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, localStreamRef.current!);
                });
            } else {    
                console.error('Local media stream is null');
            }

            pc.onicecandidate = event => {
                console.log('[Peer] ICE candidate event:', event);
                if (event.candidate) {
                    console.log('[Peer] Sending ICE candidate...', event.candidate);
                    socket.emit('signal', { to: peerId, data: { type: 'candidate', candidate: event.candidate } });
                }
            };
            
            pc.onconnectionstatechange = () => {
                console.log(`[${peerId}] state:`, pc.connectionState);
            };

            pc.ontrack = event => {
                // setUsers(prevUsers => [...prevUsers, { id: peerId, socket: socket, stream: event.streams[0] }]);
                // setUsers 처리.
                // 1.prev.some(u => u.id === peerId) → 이미 같은 id가 있으면 true
                // 2.true면 map으로 순회하면서 해당 id의 특성 업데이트 및 추가 객체를 반환
                // 3.false면 기존 배열에 새 객체 추가
                // ...user : user의 나머지 속성들을 복사
                setUsers(prev =>
                    prev.some(user => user.id === peerId)
                        ? prev.map(user => user.id === peerId ? { ...user, id: peerId, socket: socket, stream: event.streams[0] } : user)
                        : [...prev, { id: peerId, socket, stream: event.streams[0] }]
                    );

            };

            return pc;
        }, []); // 의존성 배열이 비어있으므로 이 함수는 컴포넌트가 처음 렌더링될 때 한 번만 생성됩니다.
    
 
//         return (
//     <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
//       <h2>WebRTC Peer (React)</h2>

//       <div style={{ marginBottom: 12 }}>
        
//       </div>

//       {
//         <video
//         id="localVideo"
//         autoPlay
//         playsInline
//         style={{ width: 480, height: 240, background: "#000" }}
//       />}
//       {
//         users.map((user) => (
//   				// index is used as a key for each Video component instance
// 				// 고유 값 user.id와 같은 값이 권장됨
// 				<div key={user.id}>
// 			{/* interface VideoProps {
//                 peerId: string; // 학생 ID
//                 stream: MediaStream; // WebRTC 미디어 스트림 객체
//                 }							 */}
//     		<Video peerId={user.id}
// 				   stream={user.stream} 
// 				   />
//                    </div>
//       ))}
        
//       <div style={{ marginTop: 16 }}>
        
//         <pre style={{ background: "#f6f6f6", padding: 12, maxHeight: 240, overflow: "auto" }}>
//         </pre>
//       </div>
//     </div>
//   );
    }



    

export default App;
