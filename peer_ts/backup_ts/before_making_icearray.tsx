/** Mesh 구조 카메라연결시엔 올바르게 동작, Stream 연결 시 안될 때 있음*/
/*  반드시 해당 코드로 수정할 것!!!!!!*/
import React, { use, useCallback, useEffect, useRef, useState } from 'react';
// import logo from './logo.svg';
import './App.css';
import io from 'socket.io-client';
import Video from './component/remoteVideo';


export interface WebRTCUser {
    id: string;
    socket: SocketIOClient.Socket;
    stream: MediaStream;
}
type BitrateLevel = 'min' | 'medium' | 'max';
const BitrateConfig: Record<BitrateLevel, number> = {
    min: 50000,   // 50 kbps
    medium: 1000000, // 1 Mbps
    max: 2000000,  // 2 Mbps
};
const displayMediaOptions = {
    video: {
        displaySurface: "monitor", // browser 브라우저 탭 우선적으로 선택
    },
    audio: {
        suppressLocalAudioPlayback: false, // 로컬 오디오 재생 억제 여부
    },
    preferCurrentTab: false, // 현재 탭을 우선적으로 선택
    selfBrowserSurface: "exclude", // 브라우저 자체 화면 제외
    systemAudio: "include", // 시스템 오디오 포함
    surfaceSwitching: "include", // 화면 전환 허용
    monitorTypeSurfaces: "include", // 모니터 유형 화면 포함
};

// 소켓 인스턴스를 컴포넌트 외부에서 한 번만 생성하여 재렌더링 시 재생성을 방지합니다.
//https://192.168.0.6:8000
export const SIGNALING_SERVER_URL = `https://192.168.0.3:8000`

// const socket = io(`https://192.168.0.8:8000`, { autoConnect: false });
const pcConfig: RTCConfiguration = {
    iceServers: [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302',
                'stun:23.21.150.121:3478',

            ]
        },
    ]
};
const config = {};
// const pcConfig : RTCConfiguration = {"iceServers":[]};
function App() {
    console.log('Rendering... ');
    let changeCount = 0;

    // Record<<K,T> : TS utility type
    const socketRef = useRef<SocketIOClient.Socket | null>(null);
    const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
    const pendingCandRef = useRef<Record<string, RTCIceCandidate[]>>({});

    // const pcRef = useRef<RTCPeerConnection>(null);
    const localStreamRef = useRef<MediaStream>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const myidRef = useRef<string>('');
    const localStreamSortRef = useRef<string>('userMedia');
    // user 상태 관리
    const [users, setUsers] = useState<WebRTCUser[]>([]);
    const [myid, setMyid] = useState<string>('');

    // 변수
    const iceCandidateGathered = [];
    const iceCandidateBuffer = [];
    
    const setVideoBitrate = useCallback(async (peerId: string, bitrate: number) => {
        const pc = pcsRef.current[peerId];
        if (!pc) {
            console.error(`[Peer] PeerConnection for ${peerId} not found.`);
            return;
        }

        const senders = pc.getSenders();
        const videoSender = senders.find(sender => sender.track?.kind === 'video');

        if (videoSender) {
            try {
                const parameters = videoSender.getParameters();
                console.log(`[Peer] ${peerId} senderParameters1 : `, parameters);
                if (!parameters.encodings || parameters.encodings.length === 0) {
                    parameters.encodings = [{}];
                    console.log('[Peer] ${peerId} senderParameters2 : ', parameters);
                }
                // 비트레이트 설정
                parameters.encodings[0].maxBitrate = bitrate;

                await videoSender.setParameters(parameters);
                console.log(`[Peer] Video bitrate for ${peerId} set to ${bitrate / 1000}kbps.`);
            } catch (e) {
                console.error(`[Peer] Failed to set video bitrate for ${peerId}:`, e);
            }
        } else {
            console.warn(`[Peer] No video sender found for ${peerId}.`);
        }
    }, []);



    // useCallback을 사용하여 getLocalStream 함수를 메모이제이션
    const getLocalStream = useCallback(async () => {
        try {
            console.log('getLocalStream....');
            // 추후 localStreamRef로 로컬 비디오 컴포넌트에서 사용

            localStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
                video: {

                    width: { ideal: 480, max: 640 },
                    height: { ideal: 320, max: 480 },
                    frameRate: { ideal: 30, max: 30 },
                },
                audio: true
            });

            // localStreamRef.current = (await navigator.mediaDevices.getUserMedia({ video: true, audio: true }));

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStreamRef.current;
            }



            // useEffect로 이동하면, localStream과 Sync 문제 발생
            // 수동으로 연결 시작
            socketRef.current?.connect();
        }
        catch (error) {
            console.error('Error accessing media devices.', error);
        }
    }, []);

    /* 스트림 교체 함수 */
    const changeStream = useCallback(async () => {



        if (localStreamSortRef.current === 'userMedia') {
            console.log(`[Peer] Current stream is not a display source. Changing stream...`);
            localStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                    frameRate: { ideal: 30, max: 30 },
                },
                audio: true
            });

            // localStreamRef.current = (await navigator.mediaDevices.getUserMedia({ video: true, audio: true }));

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStreamRef.current;
            }
            // 모든 피어에 대해 트랙을 교체
            // Object.values() : pcsRef.current 객체의 값들(즉, RTCPeerConnection 인스턴스들)을 배열로 반환
            Object.values(pcsRef.current).forEach(pc => {
                // pc에서 내보내는 트랙들을 가져옴
                const senders = pc.getSenders();
                localStreamRef.current!.getTracks().forEach(track => {
                    // localStreamRef의 각 트랙에 대해, 동일한 종류(kind)의 트랙을 보내는 송신자(sender)를 찾음
                    const sender = senders.find(s => s.track?.kind === track.kind);
                    if (sender) {
                        sender.replaceTrack(track);
                    }
                });
            });
        } else {
            console.log(`[Peer] Current stream is already a display source. Skipping changeStream.`);
        }

        localStreamSortRef.current = 'displayMedia';

    }, []);


    // 비디오 컴포넌트 이외는 한 번만 렌더링
    useEffect(() => {
        socketRef.current = io.connect(SIGNALING_SERVER_URL, { autoConnect: false });
        console.log('useEffect...');
        getLocalStream();

        const room = 'testRoom'; // Example room name    

        socketRef.current.on('connect', () => {
            console.log('[Peer] Connected to signaling server');
            socketRef.current?.emit('join', room);
        });
        socketRef.current.on('my-id', (id: string) => {
            console.log('[Peer] My ID:', id);
            myidRef.current = id;
            setMyid(id);
            console.log('My ID set to state:', myidRef.current);
        });
        socketRef.current.on('existing-peers', (peers: Record<string, any>) => {
            console.log('[Peer] Existing peers in room:', peers);
            peers.forEach(async (peerid: string) => {
                console.log('[Peer] createPeerConnection:', peerid);
                const pc = createPeerConnection(peerid, 'both');
                // Store the peer connection in the ref
                pcsRef.current[peerid] = pc;

                // 보내기 전 Bit rate 설정
                // setVideoBitrate(peerid, BitrateConfig.min)

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socketRef.current?.emit('offer', { to: peerid, data: offer });
                console.log(`[Peer] Sent Offer `);
            });
        });
        // socketRef.current.on('signal', async ({from, data}: {from: string, data: any}) => {

        //     console.log(`[Peer] Received signal from ${from}:`, data);

        //     if (data.type === 'offer') {
        //         // answerer
        //         console.log(`[Peer] Received offer from ${from}`);
        //         // localStreamRef.current = (await navigator.mediaDevices.getUserMedia({ video: true, audio: true }));
        //         pcsRef.current[from] = createPeerConnection(from);
        //         const pc = pcsRef.current[from];
        //         await pc.setRemoteDescription(new RTCSessionDescription(data));
        //         // Queue 비우기
        //         const queue = pendingCandRef.current[from]
        //         for(const cand of queue){
        //             try{
        //                 await pc.addIceCandidate(new RTCIceCandidate(cand));
        //             }catch(e){
        //                 console.warn('[Peer] addIcecandidate failed',e );
        //             }

        //         }
        //         pendingCandRef.current[from] = [];
        //         // Queue 비우기
        //         const answer = await pc.createAnswer();
        //         await pc.setLocalDescription(answer);
        //         socket.emit('signal', { to: from, data: answer });
        //         console.log(`[Peer] Sent Answer to ${from}`);
        //     }
        //     else if(data.type === 'answer') {
        //         const pc = pcsRef.current[from];
        //         // offerer
        //         if (!pc) {
        //             console.error('RTCPeerConnection is not initialized.');
        //         return;
        //         }
        //         console.log('[Peer] Received answer.');
        //         await pc.setRemoteDescription(new RTCSessionDescription(data));

        //     }
        //     else if(data.type === 'candidate') {
        //         const pc = pcsRef.current[from];
        //         if(pc) {
        //             console.log('[Peer] ICE candidate event:',data.candidate);
        //             if(!pc.remoteDescription){
        //                 console.log("[Peer] pc's remoteDescription is Null");
        //                 (pendingCandRef.current[from] ??= []).push(data.candidate)
        //                 return;
        //             }
        //             else{
        //             console.log("[Peer] remoteDescription detected ICECandidate is added");
        //             await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        //         }

        //         }

        //     }

        //     socket.on('disconnect', (peerId: string) => {
        //         console.log(`[Peer] Peer ${peerId} disconnected`);
        //         if (pcsRef.current[peerId]) {
        //             pcsRef.current[peerId].close();
        //             delete pcsRef.current[peerId];
        //             // user 상태에서 해당 유저 제거
        //             setUsers(prev => prev.filter(u => u.id !== peerId))
        //         }
        //     });
        // });
        socketRef.current.on('offer', async ({ from, data }: { from: string, data: any }) => {
            console.log(`[Peer] Received offer from ${from}`);

            pcsRef.current[from] = createPeerConnection(from, 'both');
            const pc = pcsRef.current[from];
            // 보내기 전 Bit rate 설정
            // setVideoBitrate(from, BitrateConfig.min)

            await pc.setRemoteDescription(new RTCSessionDescription(data));

            // Queue 비우기: offer를 받은 후 대기 중이던 ICE 후보들을 처리
            const queue = pendingCandRef.current[from];
            console.log("[Peer] Pending queue: ", queue);
            if (queue) {
                console.log("[Peer] pending candidates...");
                for (const cand of queue) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(cand));
                    } catch (e) {
                        console.warn('[Peer] addIcecandidate failed', e);
                    }
                }
            }

            pendingCandRef.current[from] = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socketRef.current?.emit('answer', { to: from, data: answer });
            console.log(`[Peer] Sent Answer to ${from}`);
        });

        socketRef.current.on('answer', async ({ from, data }: { from: string, data: any }) => {
            const pc = pcsRef.current[from];
            if (!pc) {
                console.error('RTCPeerConnection is not initialized.');
                return;
            }
            console.log('[Peer] Received answer.');
            await pc.setRemoteDescription(new RTCSessionDescription(data));
        });

        socketRef.current.on('candidate', async ({ from, data }: { from: string, data: any }) => {
            const pc = pcsRef.current[from];
            if (pc) {
                console.log('[Peer/Test] ICE candidate event:', data.candidate);
                const rd = pc.remoteDescription
                if (!rd) {
                    console.log("[Peer/Test] pc's remoteDescription is Null");
                    // (pendingCandRef.current[from] ??= []).push(data.candidate);
                    // return;
                } else {
                    console.log("[Peer/Test] remoteDescription detected. ICECandidate is added");
                    // await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        socketRef.current.on('disconnect', (peerId: string) => {
            console.log(`[Peer] Peer ${peerId} disconnected.`);
            if (pcsRef.current[peerId]) {
                pcsRef.current[peerId].close();
                delete pcsRef.current[peerId];
                setUsers(prev => prev.filter(u => u.id !== peerId));
            }
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            Object.keys(pcsRef.current).forEach((key) => {
                pcsRef.current[key].close();
                delete pcsRef.current[key];
            });
        };

    }, []);

    // useCallback을 사용하여 createPeerConnection 함수를 메모이제이션
    // peerId - parameter, RTCPeerConnection - return type
    const createPeerConnection = useCallback((peerId: string, type: string): RTCPeerConnection => {


        console.log(`[Peer] createPeerConnection ${peerId}`);
        const pc = new RTCPeerConnection(pcConfig);
        // const pc = new RTCPeerConnection(config);
        if (type === 'recvonly') {
            console.log(`[Peer] Setting up recvonly connection `);
            pc.addTransceiver('video', { direction: 'recvonly' });
            pc.addTransceiver('audio', { direction: 'recvonly' });
        }
        else {
            if (localStreamRef.current !== null) {
                console.log('[Peer] Add local stream to peer connection');
                localStreamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, localStreamRef.current!);
                });
            } else {
                console.error('Local media stream is null');
            }

        }


        pc.onicecandidate = event => {
            // console.log('[Peer] ICE candidate event:', event);
            if (event.candidate) {
                console.log('[Peer] Sending ICE candidate...', event.candidate);
                socketRef.current?.emit('candidate', { to: peerId, data: { type: 'candidate', candidate: event.candidate } });
            }
        };

        pc.onicecandidateerror = (e) => {
            const err = e as RTCPeerConnectionIceErrorEvent;
            console.warn('ICE error', err.errorCode, err.errorText, err.url);
        };


        pc.onconnectionstatechange = async () => {
            console.log(`[${peerId}] state:`, pc.connectionState);

            if (pc.connectionState === 'failed') {
                // 재연결 시도(pc.restartIce();?하드리셋 or 소프트 리셋)
                console.log(`[${peerId}] Connection failed. Attempting to restart ICE...`);
                try {
                    // console.log(`[${peerId}] Soft Resetting...`);
                    console.log(`[${peerId}] Hard Resetting...`);
                    // await softReset(peerId);
                    // candidate flush
                    pendingCandRef.current[peerId] = []
                    // await hardReset(peerId);
                }
                catch (e) {
                    // hardReset
                    console.error(e);
                }
            }
            else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
                console.log(`[${peerId}] Connection ${pc.connectionState}. Closing peer connection.`);
                pc.close();
                delete pcsRef.current[peerId];
                // candidate flush
                pendingCandRef.current[peerId] = []
            }
            else if (pc.connectionState === 'connected') {
                console.log(`[${peerId}] Connection established successfully.changeCount:${changeCount}`);
                if (changeCount === 0) {
                    // changeStream();
                    changeCount++;
                }
            }
        };

        pc.ontrack = event => {
            // setUsers(prevUsers => [...prevUsers, { id: peerId, socket: socket, stream: event.streams[0] }]);
            // setUsers 처리.
            // 1.prev.some(u => u.id === peerId) → 이미 같은 id가 있으면 true
            // 2.true면 map으로 순회하면서 해당 id의 특성 업데이트 및 추가 객체를 반환
            // 3.false면 기존 배열에 새 객체 추가
            // ...user : user의 나머지 속성들을 복사
            const stream = event.streams[0];
            const socket = socketRef.current;
            if (socket) {
                setUsers(prev =>
                    prev.some(user => user.id === peerId)
                        ? prev.map(user => user.id === peerId ? { ...user, stream: event.streams[0] } : user)
                        : [...prev, { id: peerId, socket: socket, stream: event.streams[0] }]
                );
            }
            console.log(`[Peer] Received remote stream  from ${peerId}`, stream?.getVideoTracks());
            console.log(`[Peer] RTCPeerConnection getStats`, pc.getStats());


        };




        return pc;
    }, [socketRef.current, myid]); // 의존성 배열이 비어있으므로 이 함수는 컴포넌트가 처음 렌더링될 때 한 번만 생성
    // callback 함수로 정의 0906추가    
    // const softReset = useCallback(async (peerid: string) => {
    //     const pc = pcsRef.current[peerid];
    //     if (!pc) {
    //         console.error('RTCPeerConnection is not initialized.');
    //         return;
    //     }
    //     // 추후에 로직 변경 필요
    //     console.log(`[Peer] Soft Resetting: myid:${myidRef.current} peerid:${peerid}`);
    //     if (myidRef.current >= peerid) {
    //         console.log(`[Peer] I'm the offerer`);
    //         // ICE candidate 재설정 및 재협상
    //         // Network changed, ICE failed, Opponent requests 등  
    //         const offer = await pc.createOffer({ iceRestart: true });
    //         await pc.setLocalDescription(offer);
    //         socket.emit('signal', { to: peerid, data: offer });
    //         console.log(`[Peer] Sent Offer with ICE restart`);
    //     }

    // }, [socket, myid]);

    // const hardReset = useCallback(async (peerid: string) => {
    //     console.log(`[Peer] Hard Resetting function called for peerid:${peerid}`);
    //     // 1. 기존 피어 연결 종료
    //     const pc = pcsRef.current[peerid];
    //     if (!pc) {
    //         console.error('[Peer][RESET] RTCPeerConnection is not initialized.');
    //         return;
    //     }
    //     else {
    //         console.log(`[Peer][RESET] Hard Resetting: myid:${myidRef.current} peerid:${peerid}`);
    //         pc.close();
    //         delete pcsRef.current[peerid];
    //     }
    //     // 2. setUsers에서 해당 유저 제거
    //     setUsers(prev => prev.filter(user => user.id !== peerid))
    //     console.log(`[Peer][RESET] Closed old connection and created new one for ${peerid}`);

    //     // 3. 새로운 피어 연결 생성
    //     const newPc = createPeerConnection(peerid);
    //     pcsRef.current[peerid] = newPc;

    //     // 4. 새로운 연결에 대해 offer/answer 교환
    //     if (myidRef.current >= peerid) {
    //         console.log(`[Peer][RESET] I'm the offerer`);
    //         const offer = await newPc.createOffer();
    //         await newPc.setLocalDescription(offer);
    //         socket.emit('offer', { to: peerid, data: offer });
    //         console.log(`[Peer][RESET] Sent Offer`);
    //     }

    // }, [socket, myid, setUsers]);


    return (
        <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
            <h2>WebRTC Peer (React)</h2>

            <div style={{ display: 'flex', width: 480, height: 240 }}>
                <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    style={{ width: '100%', height: '100%', background: "#000" }}
                />

                {/* 2. 비디오 위에 표시할 라벨 */}
                <div
                    style={{
                        position: 'absolute', // 부모 div를 기준으로 위치를 정함
                        top: '10px',          // 위에서 10px 떨어짐
                        left: '10px',         // 왼쪽에서 10px 떨어짐
                        color: 'white',       // 글자색
                        backgroundColor: 'rgba(0, 0, 0, 0.5)', // 반투명 배경
                        padding: '5px 10px',  // 안쪽 여백
                        borderRadius: '5px',  // 모서리 둥글게
                        fontSize: '14px'
                    }}
                >
                    {myid}
                </div>
                <button onClick={() => (changeStream())}>Change Stream</button>
            </div>




            {
                users.map((user) => (
                    <div key={user.id}>
                        <Video peerId={user.id} stream={user.stream} />
                        <div style={{ marginTop: '5px' }}>
                            <button onClick={() => setVideoBitrate(user.id, BitrateConfig.min)}>Min</button>
                            <button onClick={() => setVideoBitrate(user.id, BitrateConfig.medium)}>Medium</button>
                            <button onClick={() => setVideoBitrate(user.id, BitrateConfig.max)}>Max</button>
                        </div>
                    </div>
                ))}

            <div style={{ marginTop: 16 }}>

                <pre style={{ background: "#f6f6f6", padding: 12, maxHeight: 240, overflow: "auto" }}>
                </pre>
            </div>
        </div>

    );
}





export default App;
