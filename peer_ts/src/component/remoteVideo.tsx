import React, { useEffect, useRef } from 'react';
import type { VideoLatencyStats } from '../App';

interface VideoProps {
  peerId: string;
  stream: MediaStream;
  latency?: VideoLatencyStats;
}

const Video: React.FC<VideoProps> = ({ peerId, stream, latency }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const formatLatency = (value: number | null | undefined) => (
    typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'N/A'
  );

  return (
    <div
      style={{
        position: 'relative',
        width: '640px',
        height: '480px',
        backgroundColor: '#2c2c2c',
        borderRadius: '8px',
        overflow: 'hidden',
        margin: '10px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '0.9rem',
        }}
      >
        Remote Stream
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          right: '8px',
          backgroundColor: 'rgba(0, 0, 0, 0.58)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '0.9rem',
          lineHeight: 1.35,
        }}
      >
        <div>{peerId}</div>
        <div>
          Enc {formatLatency(latency?.encodeMs)} / Dec {formatLatency(latency?.decodeMs)}
        </div>
      </div>
    </div>
  );
};

export default Video;
