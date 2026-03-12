import { useRef, useState, useCallback } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useFrameCapture } from '../hooks/useFrameCapture'

export function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { isReady, toggleFacing } = useCamera(videoRef)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)

  const isActive = isReady && countdown !== null
  const { result, startTracking, stopTracking } = useFrameCapture(videoRef, {
    enabled: isActive,
  })

  const handleShutter = useCallback(() => {
    if (countdown !== null) return
    setCapturedImage(null)
    startTracking()
    setCountdown(5)

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          // カウント終了: ベストフレームを取得
          const bestImage = stopTracking()
          if (bestImage) {
            setCapturedImage(bestImage)
          }
          return null
        }
        return prev - 1
      })
    }, 1000)
  }, [countdown, startTracking, stopTracking])

  const handleSave = useCallback(() => {
    if (!capturedImage) return
    const link = document.createElement('a')
    link.href = capturedImage
    link.download = `perfectshot_${Date.now()}.jpg`
    link.click()
  }, [capturedImage])

  const handleDiscard = useCallback(() => {
    setCapturedImage(null)
  }, [])

  // 撮影結果プレビュー
  if (capturedImage) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <img
          src={capturedImage}
          alt="Captured"
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
        />
        <div style={{
          position: 'absolute', bottom: 32, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', gap: 16,
        }}>
          <button onClick={handleDiscard}>Retake</button>
          <button onClick={handleSave} style={{ background: '#0a0', color: '#fff' }}>Save</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* スコア表示（カウントダウン中） */}
      {countdown !== null && (
        <>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 80, fontWeight: 'bold', opacity: 0.8,
          }}>
            {countdown}
          </div>
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: 4,
            fontSize: 14,
          }}>
            Score: {result?.overall_score.toFixed(2) ?? '-'}
          </div>
        </>
      )}
      <div style={{
        position: 'absolute', bottom: 32, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 16,
      }}>
        <button onClick={toggleFacing} disabled={!isReady}>Flip</button>
        <button
          onClick={handleShutter}
          disabled={!isReady || countdown !== null}
          style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff', border: 'none' }}
        />
      </div>
    </div>
  )
}
