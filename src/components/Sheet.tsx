import { useEffect, useRef } from 'react'
import { CloseIcon } from './icons'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  /** When true, abandoning the sheet with unsaved field edits asks for confirmation. */
  confirmOnDirty?: boolean
}

/**
 * Native <dialog>: bottom sheet on phones, centered panel on desktop.
 * Escapes all stacking contexts; focus and Esc handled by the platform.
 */
export function Sheet({ open, title, onClose, children, confirmOnDirty = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  // True once the user edits any field; reset each time the sheet opens.
  const dirtyRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      dirtyRef.current = false
      el.showModal()
      // land focus on the first field, not the Close button — first Enter
      // should never dismiss the sheet the user just opened
      const first = el.querySelector<HTMLElement>(
        '.sheet-inner input:not([type="hidden"]), .sheet-inner select, .sheet-inner [data-autofocus]',
      )
      first?.focus()
    }
    if (!open && el.open) el.close()
  }, [open])

  // Abandon paths (Esc, backdrop, ✕) confirm when there are unsaved edits.
  // Submit success closes programmatically and bypasses this guard.
  const requestClose = () => {
    if (confirmOnDirty && dirtyRef.current && !window.confirm('Discard your changes?')) return
    onClose()
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      onCancel={(e) => {
        e.preventDefault() // route Esc through the dirty guard
        requestClose()
      }}
      onClose={onClose}
      onInput={() => {
        dirtyRef.current = true
      }}
      onClick={(e) => {
        // click on the backdrop closes; clicks inside don't
        if (e.target === ref.current) requestClose()
      }}
      aria-label={title}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={requestClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
