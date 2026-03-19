import { useRef, useState, useCallback } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useFrameCapture } from '../hooks/useFrameCapture'

const TIMER_OPTIONS = [0, 3, 5, 10] as const

type Phase = 'idle' | 'countdown' | 'capturing'

/** 撮影判定時間を算出する（将来的に人数ベースの多項式に置き換え） */
function getCaptureWindowSeconds(_faceCount: number): number {
  return 3
}

export function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { isReady, toggleFacing } = useCamera(videoRef)
  const [phase, setPhase] = useState<Phase>('idle')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [timerSeconds, setTimerSeconds] = useState<number>(5)
  const [captureRemaining, setCaptureRemaining] = useState<number | null>(null)

  const isActive = isReady && phase === 'capturing'
  const { result, startTracking, stopTracking } = useFrameCapture(videoRef, {
    enabled: isActive,
  })

  const startCaptureWindow = useCallback(() => {
    const captureSec = getCaptureWindowSeconds(0)
    setPhase('capturing')
    setCaptureRemaining(captureSec)
    startTracking()

    let remaining = captureSec
    const interval = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(interval)
        const bestImage = stopTracking()
        if (bestImage) setCapturedImage(bestImage)
        setCaptureRemaining(null)
        setPhase('idle')
      } else {
        setCaptureRemaining(remaining)
      }
    }, 1000)
  }, [startTracking, stopTracking])

  const handleShutter = useCallback(() => {
    if (phase !== 'idle') return
    setCapturedImage(null)

    if (timerSeconds === 0) {
      startCaptureWindow()
      return
    }

    setPhase('countdown')
    setCountdown(timerSeconds)
    let remaining = timerSeconds
    const interval = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(interval)
        setCountdown(null)
        startCaptureWindow()
      } else {
        setCountdown(remaining)
      }
    }, 1000)
  }, [phase, timerSeconds, startCaptureWindow])

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
      {/* カウントダウン表示 */}
      {phase === 'countdown' && countdown !== null && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 80, fontWeight: 'bold', opacity: 0.8,
        }}>
          {countdown}
        </div>
      )}
      {/* 撮影判定中の表示 */}
      {phase === 'capturing' && (
        <>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 24, fontWeight: 'bold', opacity: 0.9,
            background: 'rgba(255,0,0,0.6)', color: '#fff',
            padding: '8px 20px', borderRadius: 8,
          }}>
            {captureRemaining}
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
      {/* タイマー設定 */}
      {phase === 'idle' && (
        <div style={{
          position: 'absolute', top: 8, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', gap: 4,
        }}>
          {TIMER_OPTIONS.map(sec => (
            <button
              key={sec}
              onClick={() => setTimerSeconds(sec)}
              style={{
                padding: '4px 12px',
                border: 'none',
                borderRadius: 4,
                fontSize: 14,
                background: timerSeconds === sec ? '#fff' : 'rgba(255,255,255,0.3)',
                color: timerSeconds === sec ? '#000' : '#fff',
                cursor: 'pointer',
              }}
            >
              {sec}s
            </button>
          ))}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 32, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 16, alignItems: 'center',
      }}>
        <button onClick={toggleFacing} disabled={!isReady}>Flip</button>
        <button
          onClick={handleShutter}
          disabled={!isReady || phase !== 'idle'}
          style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff', border: 'none' }}
        />
      </div>
    </div>
  )
}
