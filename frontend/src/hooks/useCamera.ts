import { useEffect, useState, useCallback, RefObject } from 'react'

type Facing = 'user' | 'environment'

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [facing, setFacing] = useState<Facing>('environment')
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null

    async function start() {
      setIsReady(false)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setIsReady(true)
        }
      } catch (err) {
        console.error('Camera access failed:', err)
      }
    }

    start()

    return () => {
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [facing, videoRef])

  const toggleFacing = useCallback(() => {
    setFacing(prev => (prev === 'user' ? 'environment' : 'user'))
  }, [])

  return { isReady, facing, toggleFacing }
}
