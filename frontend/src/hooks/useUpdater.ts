import { useState, useEffect, useCallback } from 'react'

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; progress: number; total: number }
  | { state: 'installing' }
  | { state: 'error'; message: string }

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const isMobile = /android|iphone|ipad/i.test(navigator.userAgent)

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingUpdate, setPendingUpdate] = useState<any>(null)

  useEffect(() => {
    if (isMobile || !isTauri) return

    let cancelled = false

    async function checkForUpdate() {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        setStatus({ state: 'checking' })
        const update = await check()
        if (cancelled) return

        if (update) {
          setPendingUpdate(update)
          setStatus({ state: 'available', version: update.version })
        } else {
          setStatus({ state: 'idle' })
        }
      } catch (e) {
        if (cancelled) return
        setStatus({ state: 'error', message: String(e) })
      }
    }

    checkForUpdate()
    return () => { cancelled = true }
  }, [])

  const downloadAndInstall = useCallback(async () => {
    if (!pendingUpdate) return
    if (status.state === 'downloading' || status.state === 'installing') return

    try {
      let totalBytes = 0
      let downloadedBytes = 0

      await pendingUpdate.downloadAndInstall((event: { event: string; data: { contentLength?: number; chunkLength: number } }) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? 0
          setStatus({ state: 'downloading', progress: 0, total: totalBytes })
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          setStatus({ state: 'downloading', progress: downloadedBytes, total: totalBytes })
        } else if (event.event === 'Finished') {
          setStatus({ state: 'installing' })
        }
      })

      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (e) {
      setStatus({ state: 'error', message: String(e) })
    }
  }, [pendingUpdate, status.state])

  const dismiss = useCallback(() => setDismissed(true), [])

  return { status, dismissed, downloadAndInstall, dismiss }
}
