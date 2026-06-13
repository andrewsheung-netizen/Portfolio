import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, eraseAll, exportAll, getSetting, importAll, setSetting, type ExportBundle } from '../lib/db'
import { captureSnapshot } from '../lib/prices'
import { age } from '../lib/format'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  onClose: () => void
  isEmpty: boolean
}

interface PendingImport {
  bundle: ExportBundle
  fileName: string
}

function bundleCounts(b: ExportBundle): Array<[string, number]> {
  return [
    ['equities', b.equities.length],
    ['options', b.options.length],
    ['crypto', b.cryptos.length],
    ['cash', b.cash.length],
    ['properties', b.properties.length],
    ['trades', (b.trades ?? []).length],
    ['snapshots', b.snapshots.length],
  ].filter(([, n]) => (n as number) > 0) as Array<[string, number]>
}

async function downloadCurrentData(prefix: string): Promise<void> {
  const bundle = await exportAll()
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function SettingsSheet({ open, onClose, isEmpty }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importOk, setImportOk] = useState(false)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [busy, setBusy] = useState(false)
  const [erasing, setErasing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const fxRates = useLiveQuery(() => db.fxRates.toArray(), [])

  useEffect(() => {
    if (open) {
      setImportError(null)
      setImportOk(false)
      setPending(null)
      setErasing(false)
      void getSetting('fmpApiKey').then((v) => setApiKey(v ?? ''))
    }
  }, [open])

  const saveKey = async () => {
    await setSetting('fmpApiKey', apiKey.trim())
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 1600)
  }

  /** Stage 1: read and validate the file; nothing is touched yet. */
  const stageImport = async (file: File) => {
    setImportError(null)
    setImportOk(false)
    try {
      const bundle = JSON.parse(await file.text()) as ExportBundle
      if (bundle.app !== 'portfolio' || (bundle.schema !== 1 && bundle.schema !== 2)) {
        throw new Error('Not a Portfolio backup file')
      }
      setPending({ bundle, fileName: file.name })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that file')
    }
  }

  /** Stage 2: safety-export current data, then replace. */
  const confirmImport = async () => {
    if (!pending || busy) return
    setBusy(true)
    setImportError(null)
    try {
      if (!isEmpty) await downloadCurrentData('portfolio-before-import')
      await importAll(pending.bundle)
      await captureSnapshot()
      setPending(null)
      setImportOk(true)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const confirmErase = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (!isEmpty) await downloadCurrentData('portfolio-before-erase')
      await eraseAll()
      setErasing(false)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title="Settings" onClose={onClose}>
      <div className="settings">
        <section className="settings-section">
          <h3>Live prices</h3>
          <p className="settings-note">
            Equities, crypto and FX refresh from Financial Modeling Prep. The key is stored only on this
            device. Option marks stay manual in this version.
          </p>
          <div className="settings-row">
            <input
              className="input num"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="FMP API key"
              autoComplete="off"
              aria-label="FMP API key"
            />
            <button className="btn-primary" onClick={() => void saveKey()} aria-live="polite">
              {keySaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </section>

        {fxRates && fxRates.length > 0 && (
          <section className="settings-section">
            <h3>FX rates</h3>
            <p className="settings-note">Used to convert holdings to HKD. Edit if a live rate is missing or stale.</p>
            <ul className="fx-list">
              {fxRates.map((r) => (
                <li key={r.pair} className="fx-row">
                  <span className="num fx-pair">{r.pair.slice(0, 3)}→{r.pair.slice(3)}</span>
                  <input
                    className="input num fx-input"
                    type="number"
                    step="any"
                    min="0"
                    defaultValue={r.rate}
                    aria-label={`${r.pair} rate`}
                    onBlur={async (e) => {
                      const v = Number(e.target.value)
                      if (Number.isFinite(v) && v > 0 && v !== r.rate) {
                        await db.fxRates.put({ pair: r.pair, rate: v, updatedAt: Date.now(), source: 'manual' })
                        await captureSnapshot()
                      }
                    }}
                  />
                  <span className="fx-meta">
                    {r.source === 'live' ? 'live' : 'manual'} · {age(r.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="settings-section">
          <h3>Backup</h3>
          <p className="settings-note">
            Everything lives in this browser. Export a JSON backup regularly; importing replaces all current
            data, so a safety export downloads automatically first.
          </p>
          <div className="settings-row">
            <button className="btn-ghost" onClick={() => void downloadCurrentData('portfolio-backup')} disabled={isEmpty || busy}>
              Export JSON
            </button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
              Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="sr-only"
              aria-label="Import backup file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void stageImport(f)
                e.target.value = ''
              }}
            />
          </div>

          {pending && (
            <div className="import-confirm" role="alertdialog" aria-label="Confirm import">
              <p className="import-confirm-title">
                Replace everything with <span className="num">{pending.fileName}</span>?
              </p>
              <p className="import-confirm-meta num">
                exported {new Date(pending.bundle.exportedAt).toLocaleString('en-HK', { dateStyle: 'medium', timeStyle: 'short' })}
                {' · '}
                {bundleCounts(pending.bundle)
                  .map(([k, n]) => `${n} ${k}`)
                  .join(' · ') || 'empty backup'}
              </p>
              <p className="settings-note">
                {isEmpty
                  ? 'Nothing is stored yet, so nothing will be lost.'
                  : 'Your current data downloads as a safety export first.'}
              </p>
              <div className="settings-row">
                <button className="btn-ghost" onClick={() => setPending(null)} disabled={busy}>
                  Cancel
                </button>
                <button className="btn-danger confirming" onClick={() => void confirmImport()} disabled={busy}>
                  {busy ? 'Replacing…' : 'Replace all data'}
                </button>
              </div>
            </div>
          )}

          <p aria-live="polite">
            {importError && <span className="settings-error">Import failed: {importError}</span>}
            {importOk && <span className="settings-ok">Backup imported.</span>}
          </p>
        </section>

        <section className="settings-section">
          <h3>Erase</h3>
          <p className="settings-note">
            Deletes every position, account, trade, snapshot and setting stored in this browser.
            {isEmpty ? '' : ' A safety export downloads first.'}
          </p>
          <div className="settings-row">
            <button
              className={`btn-danger${erasing ? ' confirming' : ''}`}
              onClick={() => {
                if (erasing) void confirmErase()
                else setErasing(true)
              }}
              onBlur={() => setErasing(false)}
              disabled={busy}
              aria-live="polite"
            >
              {erasing ? (busy ? 'Erasing…' : 'Confirm erase everything') : 'Erase all data'}
            </button>
          </div>
        </section>
      </div>
    </Sheet>
  )
}
