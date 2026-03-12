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
        background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: 4,
        fontSize: 14, lineHeight: 1.6,
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
            border: `2px solid ${face.eye_open_score > 0.5 ? '#0f0' : '#f00'}`,
            borderRadius: 4,
            pointerEvents: 'none',
          }}
        >
          <span style={{
            position: 'absolute', top: -20, left: 0,
            fontSize: 12, background: 'rgba(0,0,0,0.6)', padding: '1px 4px', borderRadius: 2,
          }}>
            {(face.eye_open_score * 100).toFixed(0)}%
          </span>
        </div>
      ))}
      <div style={{ position: 'absolute', bottom: 32, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <button onClick={toggleFacing} disabled={!isReady}>Flip</button>
      </div>
    </div>
  )
}
