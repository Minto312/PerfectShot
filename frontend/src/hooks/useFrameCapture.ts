import { useRef, useEffect, useCallback, useState, type RefObject } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface FaceDetection {
  x: number
  y: number
  width: number
  height: number
  eye_open_score: number
}

export interface DetectionResult {
  faces: FaceDetection[]
  overall_score: number
}

interface FrameCaptureOptions {
  enabled: boolean
  captureWidth?: number
}

export function useFrameCapture(
  videoRef: RefObject<HTMLVideoElement | null>,
  options: FrameCaptureOptions,
) {
  const { enabled, captureWidth = 320 } = options
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const [result, setResult] = useState<DetectionResult | null>(null)
  const [fps, setFps] = useState(0)
  const busyRef = useRef(false)
  const fpsCounterRef = useRef({ count: 0, lastTime: performance.now() })

  // ベストフレーム追跡
  const bestFrameRef = useRef<{ score: number; dataUrl: string } | null>(null)
  const trackingRef = useRef(false)

  const getCanvas = useCallback(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    return canvasRef.current
  }, [])

  /** 現在のビデオフレームをフル解像度でキャプチャ */
  const captureFullFrame = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.95)
  }, [videoRef])

  const captureAndDetect = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || busyRef.current) return

    const canvas = getCanvas()
    const aspect = video.videoHeight / video.videoWidth
    const w = captureWidth
    const h = Math.round(w * aspect)
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    ctx.drawImage(video, 0, 0, w, h)
    const imageData = ctx.getImageData(0, 0, w, h)

    busyRef.current = true
    try {
      const detection = await invoke<DetectionResult>('detect_eyes', {
        frameData: Array.from(imageData.data),
        width: w,
        height: h,
      })
      setResult(detection)

      // ベストフレーム追跡中なら、スコアが高い場合にフル解像度でキャプチャ
      if (trackingRef.current) {
        const best = bestFrameRef.current
        if (!best || detection.overall_score > best.score) {
          const dataUrl = captureFullFrame()
          if (dataUrl) {
            bestFrameRef.current = { score: detection.overall_score, dataUrl }
          }
        }
      }

      // FPS計測
      const counter = fpsCounterRef.current
      counter.count++
      const now = performance.now()
      if (now - counter.lastTime >= 1000) {
        setFps(counter.count)
        counter.count = 0
        counter.lastTime = now
      }
    } catch (err) {
      console.error('Detection failed:', err)
    } finally {
      busyRef.current = false
    }
  }, [videoRef, captureWidth, getCanvas, captureFullFrame])

  useEffect(() => {
    if (!enabled) {
      setResult(null)
      return
    }

    let running = true
    const loop_ = () => {
      if (!running) return
      captureAndDetect()
      rafRef.current = requestAnimationFrame(loop_)
    }
    rafRef.current = requestAnimationFrame(loop_)

    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, captureAndDetect])

  /** ベストフレーム追跡を開始 */
  const startTracking = useCallback(() => {
    bestFrameRef.current = null
    trackingRef.current = true
  }, [])

  /** ベストフレーム追跡を停止し、結果を返す */
  const stopTracking = useCallback((): string | null => {
    trackingRef.current = false
    const best = bestFrameRef.current
    bestFrameRef.current = null
    return best?.dataUrl ?? null
  }, [])

  return { result, fps, startTracking, stopTracking }
}
