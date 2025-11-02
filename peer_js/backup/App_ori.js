import React, { useEffect, useRef, useState, useCallback } from "react";

// Signaling server URL (override with .env: REACT_APP_SIGNALING_URL)
const SIGNALING_URL =
  /*process.env.REACT_APP_SIGNALING_URL ||*/ "ws://192.168.0.6:8000";

export default function App() {
  // DOM refs
  const remoteVideoRef = useRef(null);

  // Runtime refs (persist across renders)
  const pcRef = useRef(null);
  const signalingChannelRef = useRef(null);
  const relayTargetIdRef = useRef(null);
  const remoteDescReadyRef = useRef(false);
  const pendingCandidatesRef = useRef([]);
  const [remoteVideo, setRemoteVideo] = useState(false);
  const startedRef = useRef(false); // guard against double init

  // UI state
  const [connState, setConnState] = useState("unconnected");
  const [serverState, setSignalingState] = useState("disconnected");

  // Create and wire a fresh RTCPeerConnection
  const createPeerConnection = useCallback(() => {
    // Close existing PC if any
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    // Send local ICE candidates to signaling
    pc.addEventListener("icecandidate", (evt) => {
      if (evt.candidate && signalingChannelRef.current) {
        console.log("[Peer] send ICE ->", evt.candidate.candidate);
        signalingChannelRef.current.send(
          JSON.stringify({
            type: "new-ice-candidate",
            targetId: relayTargetIdRef.current,
            data: evt.candidate,
          })
        );
      }
    });

    // Track connection state
    pc.addEventListener("connectionstatechange", () => {
      setConnState(pc.connectionState);
      console.log("[Peer] state:", pc.connectionState);
    });

    // Attach remote media to <video>
    pc.addEventListener("track", (evt) => {
      const [remoteStream] = evt.streams;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        setRemoteVideo(evt.streams[0]);
      }
      console.log("[Peer] remote stream attached");
    },[]);

    return pc;
  },[signalingChannelRef]);

  // Init WebSocket signaling once
  useEffect(() => {
     if (startedRef.current) return;
    startedRef.current = true;

    const signalingChannel = new WebSocket(SIGNALING_URL);
    signalingChannelRef.current = signalingChannel;

    signalingChannel.addEventListener("open", () => {
      setSignalingState("connected");
      console.log("[Peer] connected");
      signalingChannel.send(JSON.stringify({ type: "join" }));
    });

    signalingChannel.addEventListener("close", () => {
      setSignalingState("disconnected");
      console.log("[Peer] close");
    });

    signalingChannel.addEventListener("message", async (event) => {
      // Normalize payload (Blob or string)
      const raw = event.data instanceof Blob ? await event.data.text() : event.data;
      let msg;
      try { msg = JSON.parse(raw); } catch { console.log("[Peer] bad JSON"); return; }

      const { type, id: senderId, data } = msg;
      
      if (type == 'newPeer') {
        console.log('[Peer] I am a previous peer!');
        console.log('[Peer] new Peer : ',data);
        relayTargetIdRef.current = data;
        return;
      }
      if (type == 'join') {
        //console.log('[Peer] new Peer joined', data,'from Peer:', senderId);
        if (data){
          console.log('[Peer] I am a new peer!');
          console.log('[Peer] previous peer: ', data);
          if (data) relayTargetIdRef.current = data;
          return;
        }
      }

      if (type === "offer") {
        // Incoming offer -> create PC, set remote, answer
        const pc = createPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        remoteDescReadyRef.current = true;

        // Flush buffered ICE
        for (const c of pendingCandidatesRef.current) {
          try { await pc.addIceCandidate(c); } catch (e) { console.error(e); }
        }
        pendingCandidatesRef.current = [];

        // addTrack
        try {
          // Second or later than second peer 
          if (remoteVideoRef.current?.srcObject instanceof MediaStream) {
            const remoteStream = remoteVideoRef.current.srcObject;
            remoteStream.getTracks().forEach(track => pc.addTrack(track, remoteStream));
            console.log('use remote stream');
          } 
          // First peer
          else {
            const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            console.log('use local stream');
          }
        }
        catch {
          console.error("Stream error!");
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        signalingChannel.send(JSON.stringify({
          type: "answer",
          targetId: relayTargetIdRef.current,
          data: answer,
        }));
        console.log("[Peer] answer sent");
        return;
      }

      if (type === "answer") {
        // Received an answer → Set remote description
        const pc = pcRef.current ?? createPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        remoteDescReadyRef.current = true;
        return;
      }

      if (type === "new-ice-candidate") {
        // Add ICE now or buffer until remote description ready
        const pc = pcRef.current;
        if (!pc) return;
        if (remoteDescReadyRef.current) {
          try { await pcRef.current.addIceCandidate(data); } catch (e) { console.error(e); }
        } else {
          pendingCandidatesRef.current.push(data);
          console.log("[Peer] buffer ICE (RD not ready)");
        }
        return;
      }
    });

  return () => {
    if (signalingChannelRef.current === signalingChannel) {
      // WebSocket이 열려있는 상태 (OPEN) 일 때만 닫도록 처리
      if (signalingChannel.readyState === WebSocket.OPEN) { 
          console.log("[WebSocket] closing connection...");
          signalingChannel.close(); 
        }
      }
  
        // PeerConnection이 열려있는 상태일 때만 닫도록 처리
        if (pcRef.current) {
          console.log("[PeerConnection] closing connection...");
          pcRef.current.close();
        }
      };
  },[]);

  // Create and send an offer
  const joinCall = useCallback(async () => {
    console.log("[Peer] create offer");
    const pc = createPeerConnection();

    // Explicit recvonly (adjust if you want to send local tracks)
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    signalingChannelRef.current?.send(JSON.stringify({
      type: "offer",
      targetId: relayTargetIdRef.current,
      data: offer,
    }));
    console.log("[Peer] offer sent");
  }, [createPeerConnection]);

  

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2>WebRTC Peer (React)</h2>

      <div style={{ marginBottom: 12 }}>
        <button onClick={joinCall}>Start Call (Offer)</button>
      </div>

      {
        <video
        ref = {remoteVideoRef}
        autoPlay
        playsInline
        style={{ width: 480, height: 240, background: "#000" }}
      />}

      <div style={{ marginTop: 16 }}>
        <div>
          WS: <b>{serverState}</b> &nbsp;|&nbsp; Peer: <b>{connState}</b>
        </div>
        <pre style={{ background: "#f6f6f6", padding: 12, maxHeight: 240, overflow: "auto" }}>
        </pre>
      </div>
    </div>
  );
}
