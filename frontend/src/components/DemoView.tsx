import { useRef } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useFrameCapture } from '../hooks/useFrameCapture'

export function DemoView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { isReady, toggleFacing } = useCamera(videoRef)
  const { result, fps } = useFrameCapture(videoRef, { enabled: isReady })

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* オーバーレイ: 検出結果 */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: 8,
        fontSize: 14, lineHeight: 1.6,
        backdropFilter: 'blur(8px)',
      }}>
        <div>Status: {isReady ? 'Active' : 'Initializing...'}</div>
        <div>FPS: {fps}</div>
        <div>Faces: {result?.faces.length ?? 0}</div>
        <div>Score: {result?.overall_score.toFixed(2) ?? '-'}</div>
      </div>
      {/* 顔のバウンディングボックス */}
      {result?.faces.map((face, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${face.x * 100}%`,
            top: `${face.y * 100}%`,
            width: `${face.width * 100}%`,
            height: `${face.height * 100}%`,
            border: `2px solid ${face.eye_open_score > 0.5 ? '#4ade80' : '#f87171'}`,
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        >
          <span style={{
            position: 'absolute', top: -22, left: 0,
            fontSize: 12, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4,
            backdropFilter: 'blur(4px)',
          }}>
            {(face.eye_open_score * 100).toFixed(0)}%
          </span>
        </div>
      ))}
      <div style={{ position: 'absolute', bottom: 32, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <button onClick={toggleFacing} disabled={!isReady} style={{
          borderRadius: '50%',
          width: 44,
          height: 44,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
          border: 'none',
          color: '#fff',
          fontSize: 18,
          backdropFilter: 'blur(8px)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5"/>
            <path d="M8 21H3v-5"/>
            <path d="M21 3l-7 7"/>
            <path d="M3 21l7-7"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
