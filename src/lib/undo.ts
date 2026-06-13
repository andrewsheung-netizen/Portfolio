/**
 * A single-slot undo store for reversible deletes. A delete pushes a labelled
 * undo thunk; a toast surfaces it for a few seconds. Deliberately not the Trade
 * ledger — deletes aren't realized events and must not touch realized P&L.
 */
export interface UndoEntry {
  id: number
  label: string
  undo: () => Promise<void>
}

let current: UndoEntry | null = null
let seq = 0
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function pushUndo(label: string, undo: () => Promise<void>): void {
  current = { id: ++seq, label, undo }
  emit()
}

export function clearUndo(): void {
  current = null
  emit()
}

export function getUndo(): UndoEntry | null {
  return current
}

export function subscribeUndo(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
