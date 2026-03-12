import { useState } from 'react'
import { CameraView } from './components/CameraView'
import { DemoView } from './components/DemoView'

type View = 'camera' | 'demo'

function App() {
  const [view, setView] = useState<View>('camera')

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
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
