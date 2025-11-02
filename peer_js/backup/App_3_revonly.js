import React, { useEffect, useRef, useState, useCallback } from "react";
import Timer from "./component/Timer";
// useRef : 상태가 변경되어도 렌더링이 일어나지 않음 
// useState : 상태가 변경될 때마다 컴포넌트 => 렌더링이 일어남  
// useEffect : 렌더링이 발생할 때마다 실행됨.
let letCount = 1;
/* 서버와 연결은 되나 offer 전송 시 피어 연결이 안됨 
    처음 연결 안될 시 8000포트 이동 후 3000포트 재접속 시 연결됨
*/
export default function App() {
    
    const pcRef = useRef(null);
    let relayTargetId;
    let [remoteStream] = [];
    // 추후 업데이트
    const remoteStreamRef = useRef(null);
    let remoteDescriptionSet = false;
    const pendingCandidates = [];
    // 1.
    // Initialize signaling channel and handle incoming messages
    const signalingChannel = new WebSocket('wss://192.168.0.6:8000');

    signalingChannel.addEventListener('open', () => {
      console.log('[Peer] Entered Signaling channel.');
      //signalingChannel.send(JSON.stringify('Hello from Peer'));
      signalingChannel.send(JSON.stringify({
         type: 'join'
        }));
    });

    signalingChannel.addEventListener('message', async event => {

      
      // Check if event.data is a Blob; convert to string if needed
      const raw = event.data instanceof Blob ? await event.data.text() : event.data;
      const parsed = JSON.parse(raw);

      const { type, id: senderId, data: data } = parsed;


      console.log('[Peer] Received message:', data,'type',type,'from Peer:', senderId);

      if (type == 'newPeer') {
        console.log('[Peer] I am a previous peer!');
        console.log('[Peer] new Peer : ',data);
        relayTargetId = data;
        return;
      }
      if (type == 'join') {
        //console.log('[Peer] new Peer joined', data,'from Peer:', senderId);
        if (data){
          console.log('[Peer] I am a new peer!');
          console.log('[Peer] previous peer: ', data);
          relayTargetId = data;

          //makeCall();
          return;
        }
        else{
          console.log('[Peer] No previous peer');
          return;
        }
      }

      // Received an offer → Create and send an answer
      else if (type == 'offer') {
        console.log('[Peer] Received offer.');
        
        pcRef.current = createPeerConnection();
        const pc = pcRef.current;
        

        await pc.setRemoteDescription(new RTCSessionDescription(data));
        remoteDescriptionSet = true;
        // 버퍼된 후보 처리
        pendingCandidates.forEach(async candidate => {
          try {
            await pc.addIceCandidate(candidate);
          } catch (e) {
            console.error('[Peer] Failed to add buffered ICE candidate:', e);
          }
        });
        pendingCandidates.length = 0; // 버퍼 비우기
        // Connect MediaStream before creating sdp
        // Prepare local stream and add it to the peer connection
        // 두번째 이후 피어 
        // if(remoteStream){
        //   remoteStream.getTracks().forEach(track => pc.addTrack(track, remoteStream));
        //   console.log('get remoteStream');
        // }
        if(remoteStreamRef.current?.srcObject instanceof MediaStream){
          console.log('remoteStreamRef', remoteStreamRef.current);
          remoteStreamRef.current.srcObject.getTracks().forEach(track => pc.addTrack(track, remoteStreamRef.current.srcObject));
          console.log('get remoteStream');
        }
        // 첫번째 피어
        else{
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
          console.log('get localStream');
          //  pc.addTransceiver('video', { direction: 'recvonly' });
          //  pc.addTransceiver('audio', { direction: 'recvonly' });
        }
        

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalingChannel.send(JSON.stringify({
          type: 'answer',
          targetId: relayTargetId,
          data: answer
        }));
        console.log('[Peer] Sent answer.');

        remoteDescriptionSet = false;
      }

      // Received an answer → Set remote description
      else if (type == 'answer') {
        const pc = pcRef.current;
        remoteDescriptionSet = true;
        console.log('[Peer] Received answer.');
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        
      }


      else if (type =='new-ice-candidate') {
          const pc = pcRef.current;
          console.log('[Peer] Received ICE candidate.');
          if (pc) {
            if (remoteDescriptionSet) {
              try {
                console.log('addIceCandidate');
                await pc.addIceCandidate(data);
              } catch (e) {
                console.error('[Peer] Failed to add ICE candidate:', e);
              }
            } else {
              console.warn('[Peer] Remote description not set yet. Buffering candidate.');
              pendingCandidates.push(data);
            }
          }
        }

    });

    // 2.
    // Create an offer and send it through the signaling server
    async function joinCall() {
    console.log('[Peer] Creating offer...');
    
    pcRef.current = createPeerConnection();
    const pc = pcRef.current;

    console.log('relayTargetId in OfferCall',relayTargetId);
    // For checking Logs
    // Connect MediaStream before creating sdp
    // Prepare local stream and add it to the peer connection
    // const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: false });
    // stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    // [Important!!] even if it does not send, it must add Transceiver. 
    // Unless mentioned, It cannot find any candidates
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signalingChannel.send(JSON.stringify({
      type: 'offer',
      targetId: relayTargetId,
      data: offer 
    }));
    console.log('[Peer] Sent offer.');

    // peerConnection.getTransceivers().forEach(transceiver => {
    //     console.log('transceiver mid:', transceiver.mid);
    //     console.log('media kind:', transceiver.receiver.track.kind);
    //     });
    }


    // 3.
    // Create and configure RTCPeerConnection instance
    function createPeerConnection() {
      const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
      const pc = new RTCPeerConnection(configuration);
      
      // 4.
      // Listen for local ICE candidates on the RTCPeerConnection
      pc.addEventListener('icecandidate', event => {
        if (event.candidate) {
          console.log('[Peer] Sending ICE candidate...',event.candidate);
          signalingChannel.send(JSON.stringify({ 
            type:'new-ice-candidate',
            targetId: relayTargetId,
            data: event.candidate }));
        }
      });

      // 5.
      // Listen for connection state changes
      pc.addEventListener('connectionstatechange', () => {
        console.log('[Peer] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          console.log('Peers connected.');
        }
      });
      
      
      pc.addEventListener('negotiationneeded', async () => {
        try {
          // const offer = await pc.createOffer();
          // await pc.setLocalDescription(offer);
          // signalingChannel.send(JSON.stringify({
          //   type: 'offer',
          //   targetId: relayTargetId,
          //   data: offer
          // }));
          console.log('[Peer] Sent renegotiation offer.');
        } catch (e) {
          console.error('Negotiation error:', e);
        }
      });

      // 6.
      // receiver
      // Add remote tracks to the local video element
      pc.addEventListener('track', event => {
        // [remoteStream] = event.streams; // possible to come multiple streams so it is an array. i.e [s1,s2]
        // document.getElementById('remoteVideo').srcObject = remoteStream; // attach remoterStream to videotag
        // console.log('[Peer] Remote stream attached.');

        [remoteStream] = event.streams;
        remoteStreamRef.current.srcObject = remoteStream// attach remoterStream to videotag
        // remoteStreamRef.current = remoteStream;
        console.log('[Peer] Remote stream attached.');
        
      });

    

      return pc;
    }


    // Function to get user media and add to peer connection
    const sendMyVideo = async () => {
      if (!pcRef.current) {
        alert('Peer connection not established yet!');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));
        
        console.log('[Peer] Local video stream sent.');
      } catch (e) {
        console.error('Failed to get local media:', e);
      }
    };
    return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2>WebRTC Peer (React)</h2>

      <div style={{ marginBottom: 12 }}>
        <button onClick={joinCall}>Start Call (Offer)</button>
        <button onClick={sendMyVideo} style={{ marginLeft: 8 }}>Send My Video</button>
      </div>

      {
        <video
        // id="remoteVideo"
        ref={remoteStreamRef}
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
