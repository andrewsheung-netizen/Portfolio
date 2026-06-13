import { useEffect, useState, useSyncExternalStore } from 'react'
import { clearUndo, getUndo, subscribeUndo } from '../lib/undo'

const LIFETIME = 7000

/** Bottom toast offering to reverse the most recent delete. Auto-dismisses. */
export function UndoToast() {
  const entry = useSyncExternalStore(subscribeUndo, getUndo, getUndo)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!entry) return
    const t = setTimeout(() => clearUndo(), LIFETIME)
    return () => clearTimeout(t)
  }, [entry])

  if (!entry) return null

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-label">{entry.label}</span>
      <button
        className="toast-undo"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await entry.undo()
          } finally {
            setBusy(false)
            clearUndo()
          }
        }}
      >
        {busy ? 'Undoing…' : 'Undo'}
      </button>
    </div>
  )
}
