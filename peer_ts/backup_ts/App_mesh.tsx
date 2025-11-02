import React, { useRef, useState } from 'react';
// import logo from './logo.svg';
import './App.css';
import io from 'socket.io-client';
function App() {
    console.log('Rendering... ');
    // Record<<K,T> : TS utility type
    const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
    const pcRef = useRef<RTCPeerConnection>(null);
    const localStreamRef = useRef<MediaStream >(null);
    const socket = io('https://192.168.0.7:8000');

    const pcConfig : RTCConfiguration = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    
    async function init () {
        let room = 'testRoom'; // Example room name
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

        socket.on('signal', async ({from, data}) => {
            

            if (data.type === 'offer') {
                // answerer
                console.log(`[Peer] Received offer from ${from}`);
                localStreamRef.current = (await navigator.mediaDevices.getUserMedia({ video: true, audio: true }));
                pcsRef.current[from] = createPeerConnection(from);
                const pc = pcsRef.current[from];
                await pc.setRemoteDescription(new RTCSessionDescription(data));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('signal', { to: from, data: answer });
                console.log(`[Peer] Sent Answer to ${from}`);
            }
            else if(data.type === 'answer') {
                let pc = pcsRef[from].current;
                // offerer
                if(pc) {
                    const pc = pcsRef.current[from];
                // offerer
                if (!pc) {
                    console.error('RTCPeerConnection is not initialized.');
                return;
                }
                console.log('[Peer] Received answer.');
                await pc.setRemoteDescription(new RTCSessionDescription(data));
                }
            }
            else if(data.type === 'candidate') {
                let pc = pcsRef[from].current;
                if(pc) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            }

            socket.on('disconnect', (peerId: string) => {
                console.log(`[Peer] Peer ${peerId} disconnected`);
                if (pcsRef.current[peerId]) {
                    pcsRef.current[peerId].close();
                    delete pcsRef.current[peerId];
                }
            });
        });

        
            
        function createPeerConnection(peerId: string) {
            console.log(`[Peer] Creating peer connection for ${peerId}`, localStreamRef.current);
            const pc = new RTCPeerConnection(pcConfig);
           
            if (localStreamRef.current) {
                console.log('[Peer] Add local stream to peer connection');
                localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current!);
                });
            }
            else{
                console.error('Local media stream already exists.');
                
            }

            pc.onicecandidate = event => {
                console.log('[Peer] ICE candidate event:', event);
                if (event.candidate) {
                    console.log('[Peer] Sending ICE candidate...',event.candidate);
                    socket.emit('signal', { to: peerId, data: { type: 'candidate', candidate: event.candidate } });
                }
            };
            // 연결 상태 디버깅
            pc.onconnectionstatechange = () => {
                console.log(`[${peerId}] state:`, pc.connectionState);
            };

            pc.ontrack = event => {
                console.log(`[${peerId}] Received remote track`, event.streams);
                const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;
                if (remoteVideo) {
                    remoteVideo.srcObject = event.streams[0];
                }
                
            };

            
            return pc;
        }

        init ();
    }


        return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2>WebRTC Peer (React)</h2>

      <div style={{ marginBottom: 12 }}>
        
      </div>

      {
        <video
        id="remoteVideo"
        autoPlay
        playsInline
        style={{ width: 480, height: 240, background: "#000" }}
      />}

      <div style={{ marginTop: 16 }}>
        
        <pre style={{ background: "#f6f6f6", padding: 12, maxHeight: 240, overflow: "auto" }}>
        </pre>
      </div>
    </div>
  );
}
// function App() {
//   return (
//     <div className="App">
//       <header className="App-header">
//         <img src={logo} className="App-logo" alt="logo" />
//         <p>
//           Edit <code>src/App.tsx</code> and save to reload.
//         </p>
//         <a
//           className="App-link"
//           href="https://reactjs.org"
//           target="_blank"
//           rel="noopener noreferrer"
//         >
//           Learn React
//         </a>
//       </header>
//     </div>
//   );
// }

export default App;
