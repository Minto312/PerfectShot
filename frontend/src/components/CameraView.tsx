import { useRef, useState, useCallback } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useFrameCapture } from '../hooks/useFrameCapture'

const TIMER_OPTIONS = [0, 3, 5, 10] as const
const BRAND_YELLOW = '#F5C400'

type Phase = 'idle' | 'countdown' | 'capturing'

/** 全員が目を開けている瞬間を捉えるのに必要な撮影判定時間を算出する */
function getCaptureWindowSeconds(n: number, confidence = 0.99, safetyFactor = 2): number {
  if (n <= 0) return 3

  const BLINK_RATE = 10 / 60         // 瞬き/秒
  const BLINK_DURATION = 0.25        // 秒
  const EFFECTIVE_SAMPLE_RATE = 1 / BLINK_DURATION // 4/秒

  const pAllOpen = Math.pow(1 - BLINK_RATE * BLINK_DURATION, n)
  const k = Math.ceil(Math.log(1 - confidence) / Math.log(1 - pAllOpen))
  const T = safetyFactor * k / EFFECTIVE_SAMPLE_RATE

  return Math.max(3, Math.min(T, 15)) // 最低3秒、最大15秒
}

export function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { isReady, toggleFacing } = useCamera(videoRef)
  const [phase, setPhase] = useState<Phase>('idle')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [timerSeconds, setTimerSeconds] = useState<number>(5)
  const [captureRemaining, setCaptureRemaining] = useState<number | null>(null)

  const isActive = isReady && phase !== 'idle'
  const { result, startTracking, stopTracking } = useFrameCapture(videoRef, {
    enabled: isActive,
  })

  const startCaptureWindow = useCallback(() => {
    const faceCount = result?.faces.length ?? 0
    const captureSec = Math.ceil(getCaptureWindowSeconds(faceCount))
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
  }, [result, startTracking, stopTracking])

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
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#0D0D0D' }}
        />
        <div style={{
          position: 'absolute', bottom: 32, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', gap: 16,
        }}>
          <button onClick={handleDiscard}>Retake</button>
          <button onClick={handleSave} style={{
            background: BRAND_YELLOW,
            color: '#111',
            border: 'none',
            fontWeight: 700,
          }}>Save</button>
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
          fontSize: 80, fontWeight: 'bold', opacity: 0.9,
          color: BRAND_YELLOW,
          textShadow: '0 2px 12px rgba(0,0,0,0.7)',
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
            fontSize: 24, fontWeight: 'bold', opacity: 0.95,
            background: `${BRAND_YELLOW}dd`, color: '#111',
            padding: '8px 24px', borderRadius: 12,
            boxShadow: '0 2px 16px rgba(245,196,0,0.3)',
          }}>
            {captureRemaining}
          </div>
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: 8,
            fontSize: 14,
            backdropFilter: 'blur(8px)',
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
                borderRadius: 16,
                fontSize: 14,
                background: timerSeconds === sec ? BRAND_YELLOW : 'rgba(0,0,0,0.45)',
                color: timerSeconds === sec ? '#111' : '#fff',
                fontWeight: timerSeconds === sec ? 700 : 400,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
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
        <button
          onClick={handleShutter}
          disabled={!isReady || phase !== 'idle'}
          style={{
            width: 68,
            height: 68,
            borderRadius: '50%',
            background: '#fff',
            border: `3px solid ${BRAND_YELLOW}`,
            boxShadow: '0 2px 12px rgba(245,196,0,0.25)',
            padding: 0,
          }}
        />
      </div>
    </div>
  )
}
