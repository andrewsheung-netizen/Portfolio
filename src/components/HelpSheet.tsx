import { Sheet } from './Sheet'

interface Props {
  open: boolean
  onClose: () => void
}

const SHORTCUTS: [string, string][] = [
  ['A', 'Add a position, cash flow, or property'],
  ['R', 'Refresh live prices'],
  ['S', 'Open settings'],
  ['T', 'Toggle light / dark mode'],
  ['?', 'Show this help'],
  ['Esc', 'Close any open sheet'],
]

const TIPS: string[] = [
  'Dashboard answers “what am I worth and what moved today”. Activity is the full transaction log; Summary totals each category over a date range.',
  'Buying lets you fund from a cash balance or a fresh injection — net worth only rises on new capital, not on moving cash into holdings.',
  'Every transaction (buy, sell, option close, mortgage payment, cash move) is reversible from the Activity tab.',
  'Tap any figure’s HKD/Native or P&L/Day toggle in Holdings to switch what the columns show.',
  'Everything lives in this browser — export a JSON backup from Settings regularly.',
]

/** Keyboard shortcuts and a short orientation to the app's surfaces. */
export function HelpSheet({ open, onClose }: Props) {
  return (
    <Sheet open={open} title="Help & shortcuts" onClose={onClose}>
      <div className="help">
        <section className="help-section">
          <h3>Keyboard</h3>
          <dl className="help-keys">
            {SHORTCUTS.map(([k, desc]) => (
              <div key={k} className="help-key-row">
                <dt>
                  <kbd className="kbd">{k}</kbd>
                </dt>
                <dd>{desc}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="help-section">
          <h3>Good to know</h3>
          <ul className="help-tips">
            {TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
