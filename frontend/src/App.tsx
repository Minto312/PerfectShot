import { useState } from 'react'
import { CameraView } from './components/CameraView'
import { DemoView } from './components/DemoView'
import { UpdateNotification } from './components/UpdateNotification'
import { useUpdater } from './hooks/useUpdater'

type View = 'camera' | 'demo'

const BRAND_YELLOW = '#F5C400'

function App() {
  const [view, setView] = useState<View>('camera')
  const { status, dismissed, downloadAndInstall, dismiss } = useUpdater()

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {!dismissed && (
        <UpdateNotification status={status} onUpdate={downloadAndInstall} onDismiss={dismiss} />
      )}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        background: '#111',
        borderBottom: `1px solid rgba(245, 196, 0, 0.15)`,
      }}>
        <img src="/logo.png" alt="はい、チーズ！" style={{ width: 28, height: 28 }} />
        <span style={{
          fontWeight: 700,
          fontSize: 15,
          color: BRAND_YELLOW,
          marginRight: 8,
        }}>
          はい、チーズ！
        </span>
        {(['camera', 'demo'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            disabled={view === v}
            style={{
              padding: '4px 14px',
              fontSize: 13,
              background: view === v ? BRAND_YELLOW : '#1A1A1A',
              color: view === v ? '#111' : '#ccc',
              border: view === v ? 'none' : '1px solid #333',
              fontWeight: view === v ? 700 : 400,
            }}
          >
            {v === 'camera' ? 'Camera' : 'Demo'}
          </button>
        ))}
      </nav>
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'camera' ? <CameraView /> : <DemoView />}
      </main>
    </div>
  )
}

export default App
