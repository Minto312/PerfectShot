import type { UpdateStatus } from '../hooks/useUpdater'

const BRAND_YELLOW = '#F5C400'

interface Props {
  status: UpdateStatus
  onUpdate: () => void
  onDismiss: () => void
}

export function UpdateNotification({ status, onUpdate, onDismiss }: Props) {
  if (status.state === 'idle' || status.state === 'checking') return null

  const isError = status.state === 'error'
  const bgColor = isError ? '#dc2626' : '#1A1A1A'

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: bgColor,
        color: '#fff',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 14,
        borderBottom: isError ? 'none' : `2px solid ${BRAND_YELLOW}`,
      }}
    >
      <div style={{ flex: 1 }}>
        {status.state === 'available' && (
          <span>v{status.version} が利用可能です</span>
        )}
        {status.state === 'downloading' && (
          <div>
            <span>ダウンロード中...</span>
            {status.total > 0 && (
              <div
                style={{
                  marginTop: 4,
                  height: 4,
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 2,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round((status.progress / status.total) * 100)}%`,
                    background: BRAND_YELLOW,
                    borderRadius: 2,
                    transition: 'width 0.2s',
                  }}
                />
              </div>
            )}
          </div>
        )}
        {status.state === 'installing' && <span>インストール中...</span>}
        {status.state === 'error' && <span>{status.message}</span>}
      </div>

      {status.state === 'available' && (
        <button
          onClick={onUpdate}
          style={{
            background: BRAND_YELLOW,
            color: '#111',
            border: 'none',
            borderRadius: 6,
            padding: '4px 12px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 13,
          }}
        >
          アップデート
        </button>
      )}

      {(status.state === 'available' || status.state === 'error') && (
        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            color: '#888',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 4px',
          }}
        >
          x
        </button>
      )}
    </div>
  )
}
