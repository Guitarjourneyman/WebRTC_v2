
// 6.
// Ready for Local stream to the remote peers
const iceConfig = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]}

const localStream = await getUserMedia({video: true, audio: true});
const peerConnection = new RTCPeerConnection(iceConfig);
localStream.getTracks().forEach(track =>{
    peerConnection.addTrack(track, localStream);
});

// 7.
// Add remote tracks to the local
const remoteVideo = document.querySelector('#remoteVideo');

peerConnection.addEventListener('track', async (event)=>{
    const [remoteStream] = event.streams;
    remoteVideo.srcObject = remoteStream;
})