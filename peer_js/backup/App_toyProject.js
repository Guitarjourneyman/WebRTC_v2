import React, { useEffect, useRef, useState, useCallback } from "react";
/* App_toyproject 서버와 연결 잘 되고, peer 연결시 한 방향으로 카메라 전송 잘됨
    1:1 연결만 가능
*/
export default function App() {
    let peerConnection;
    let relayTargetId;
    let [remoteStream] = [];
    let remoteDescriptionSet = false;
    const pendingCandidates = [];
    // 1.
    // Initialize signaling channel and handle incoming messages
    const signalingChannel = new WebSocket('wss://192.168.0.7:8000');

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
        peerConnection = createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        remoteDescriptionSet = true;
        // 버퍼된 후보 처리
        pendingCandidates.forEach(async candidate => {
          try {
            await peerConnection.addIceCandidate(candidate);
          } catch (e) {
            console.error('[Peer] Failed to add buffered ICE candidate:', e);
          }
        });
        pendingCandidates.length = 0; // 버퍼 비우기
        // Connect MediaStream before creating sdp
        // Prepare local stream and add it to the peer connection
        // 두번째 이후 피어 
        if(remoteStream){
          remoteStream.getTracks().forEach(track => peerConnection.addTrack(track, remoteStream));
          console.log('get remoteStream');
        }
        // 첫번째 피어
        else{
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
          console.log('get localStream');
        }
        

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
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
        remoteDescriptionSet = true;
        console.log('[Peer] Received answer.');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        
      }

      // Received ICE candidate → Add to connection
      // else if (type =='new-ice-candidate') {
      //   console.log('[Peer] Received ICE candidate.');
      //   try {
      //     await peerConnection.addIceCandidate(data);
      //   } catch (e) {
      //     console.error('Failed to add ICE candidate:', e);
      //   }
      // }
      else if (type =='new-ice-candidate') {
          console.log('[Peer] Received ICE candidate.');
          if (peerConnection) {
            if (remoteDescriptionSet) {
              try {
                await peerConnection.addIceCandidate(data);
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
    peerConnection = createPeerConnection();

    console.log('relayTargetId in OfferCall',relayTargetId);
    // For checking Logs
    // Connect MediaStream before creating sdp
    // Prepare local stream and add it to the peer connection
    // const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: false });
    // stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    // [Important!!] even if it does not send, it must add Transceiver. 
    // Unless mentioned, It cannot find any candidates
    peerConnection.addTransceiver('video', { direction: 'recvonly' });
    peerConnection.addTransceiver('audio', { direction: 'recvonly' });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
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

      // 6.
      // receiver
      // Add remote tracks to the local video element
      pc.addEventListener('track', event => {
        [remoteStream] = event.streams; // possible to come multiple streams so it is an array. i.e [s1,s2]
        document.getElementById('remoteVideo').srcObject = remoteStream; // attach remoterStream to videotag
        console.log('[Peer] Remote stream attached.');
      });


      return pc;
    }
    return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2>WebRTC Peer (React)</h2>

      <div style={{ marginBottom: 12 }}>
        <button onClick={joinCall}>Start Call (Offer)</button>
      </div>

      {
        <video
        id="remoteVideo"
        autoPlay
        playsInline
        style={{ width: 480, height: 240, background: "#030303ff" }}
      />}

      <div style={{ marginTop: 16 }}>
        
        <pre style={{ background: "#f6f6f6", padding: 12, maxHeight: 240, overflow: "auto" }}>
        </pre>
      </div>
    </div>
  );
}
