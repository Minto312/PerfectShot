import { useState } from 'react'
import { CameraView } from './components/CameraView'
import { DemoView } from './components/DemoView'
import { UpdateNotification } from './components/UpdateNotification'
import { useUpdater } from './hooks/useUpdater'

type View = 'camera' | 'demo'

function App() {
  const [view, setView] = useState<View>('camera')
  const { status, dismissed, downloadAndInstall, dismiss } = useUpdater()

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {!dismissed && (
        <UpdateNotification status={status} onUpdate={downloadAndInstall} onDismiss={dismiss} />
      )}
      <nav style={{ display: 'flex', gap: 8, padding: 8, background: '#111' }}>
        <button onClick={() => setView('camera')} disabled={view === 'camera'}>
          Camera
        </button>
        <button onClick={() => setView('demo')} disabled={view === 'demo'}>
          Demo
        </button>
      </nav>
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'camera' ? <CameraView /> : <DemoView />}
      </main>
    </div>
  )
}

export default App
