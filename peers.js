// 1.
// Initialize signaling channel and handle incoming messages
const signalingChannel = new WebSocket('ws://localhost:8000');

signalingChannel.addEventListener('message', async event => {
    const message = JSON.parse(event.data); // Parse incoming JSON string

    // Received an offer → Create and send an answer
    if (message.offer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        signalingChannel.send(JSON.stringify({ answer }));
    }

    // Received an answer → Set remote description
    else if (message.answer) {
        const remoteDesc = new RTCSessionDescription(message.answer);
        await peerConnection.setRemoteDescription(remoteDesc);
    }

    // Received ICE candidate → Add to connection
    else if (message['new-ice-candidate']) {
        try {
            await peerConnection.addIceCandidate(message['new-ice-candidate']);
        } catch (e) {
            console.error('Error adding received ICE candidate', e);
        }
    }
});

// Send an asynchronous message to the remote client
signalingChannel.send(JSON.stringify('Hello'));

// 2.
// Create an offer and send it through the signaling server
async function makeCall() {
    const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };
    peerConnection = new RTCPeerConnection(configuration); // Declare globally to share across functions

    // 4.
    // Listen for local ICE candidates on the RTCPeerConnection
    peerConnection.addEventListener('icecandidate', event => {
        if (event.candidate) {
            signalingChannel.send(JSON.stringify({ 'new-ice-candidate': event.candidate }));
        }
    });

    // 5.
    // Listen for connection state changes
    peerConnection.addEventListener('connectionstatechange', () => {
        if (peerConnection.connectionState === 'connected') {
            // Peers are connected
            console.log('Peers connected!');
        }
    });

    // 6.
    // Prepare local stream and add it to the peer connection
    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    signalingChannel.send(JSON.stringify({ offer }));
}

// 7.
// Listen for remote tracks and attach them to the video element
const remoteVideo = document.querySelector('#remoteVideo');
if (remoteVideo) {
    peerConnection.addEventListener('track', async (event) => {
        const [remoteStream] = event.streams;
        remoteVideo.srcObject = remoteStream;
    });
}



// // 1.
// const signalingChannel = new SignalingChannel(remoteClientId);
// signalingChannel.addEventListener('message', message => {}
//     // New message from remote client received
// ); 

// // Send an asynchoronous message to the remote client
// signalingChannel.send('Hello');

// // 2.
// async function makeCall() {
//     peerConnection = new RTCPeerConnection(configuration);
//     signalingChannel.addEventListener('message', async message => {
//         if (message.answer){
//             const remoteDesc = new RTCSessionDescription(message.answer);
//             await peerConnection.setRemoteDescription(remoteDesc);
//         }
//     });
//     const offer = await peerConnection.createOffer();
//     await peerConnection.setLocalDescription(offer);
//     signalingChannel.send({'offer': offer});
// }

// // 3.
// peerConnection = new RTCPeerConnection(configuration);
// signalingChannel.addEventListener('message',async message => {
//     if(message.offer){
//         peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
//         const answer = await peerConnection.createAnswer();
//         await peerConnection.setLocalDescription(answer);
//         signalingChannel.send({'answer': answer});
//     }
// })

// // 4.
// // Listen for local ICE candidates on the local RTCPeerConnection
// peerConnection.addEventListener('icecandidate', event =>{
//     if(event.candidate)
//         signalingChannel.send({'new-ice-candidate': event.candidate});
// });

// // Listen for remote ICE candidates and add them to the local RTCPeerConnection
// signalingChannel.addEventListener('message', async message =>{
//     if(message.iceCandidate){
//         try{
//             await peerConnection.addIceCandidate(message.iceCandidate);
//         } catch(e){
//             console.error('Error adding received ice candidate', e);
//         }
//     }
// });

// // 5.
// // Listen for connectionstatechance on the local RTCPeerConnection
// peerConnection.addEventListener('connectionstatechange', event =>{
//     if(peerConnection.connectionState == 'connected'){
//         // Peers connected!
//         console.log('Peers connected! ');
//     }
// })

