import type { Flag } from '../lib/compute'
import type { RefreshResult } from '../lib/prices'
import { shortDate } from '../lib/format'
import type { EditTarget } from './forms'

interface Props {
  flags: Flag[]
  refresh: RefreshResult | null
  onOpenSettings: () => void
  onEdit: (t: EditTarget) => void
  onRetry: () => void
}

/**
 * Only renders when something needs attention. Silence is a feature:
 * when nothing is wrong, this strip does not exist. Every chip that names
 * a position carries the action to open it.
 */
export function ActionStrip({ flags, refresh, onOpenSettings, onEdit, onRetry }: Props) {
  const items: { key: string; tone: 'warn' | 'loss' | 'muted'; text: string; action?: () => void; actionLabel?: string }[] = []

  for (const f of flags) {
    if (f.kind === 'expiry') {
      const o = f.option
      const label = `${o.underlying} ${o.strike}${o.right === 'call' ? 'C' : 'P'}`
      items.push({
        key: `exp-${o.id}`,
        tone: f.dte < 0 ? 'loss' : 'warn',
        text:
          f.dte < 0
            ? `${label} expired ${shortDate(o.expiry)}`
            : `${label} expires in ${f.dte}d`,
        action: () => onEdit({ kind: 'option', row: o }),
        actionLabel: 'Open',
      })
    } else if (f.kind === 'stale-property') {
      items.push({
        key: `stale-${f.property.id}`,
        tone: 'warn',
        text: `${f.property.label} valued ${Math.round(f.days / 30.44)} mo ago`,
        action: () => onEdit({ kind: 'property', row: f.property }),
        actionLabel: 'Update value',
      })
    } else {
      items.push({
        key: 'unpriced',
        tone: 'warn',
        text: `${f.count} position${f.count > 1 ? 's' : ''} missing a price or FX rate`,
        action: onOpenSettings,
        actionLabel: 'Fix in settings',
      })
    }
  }

  if (refresh && refresh.failed.length > 0) {
    items.push({
      key: 'fetch-failed',
      tone: 'muted',
      text: `Couldn't refresh: ${refresh.failed.join(', ')} — showing last known values`,
      action: onRetry,
      actionLabel: 'Retry',
    })
  }
  if (refresh && refresh.noKey) {
    // No key configured: one quiet line until live prices are set up
    items.push({
      key: 'no-key',
      tone: 'muted',
      text: 'Live equity prices are off — add a quotes proxy or FMP key in Settings',
      action: onOpenSettings,
      actionLabel: 'Settings',
    })
  }

  if (items.length === 0) return null

  return (
    <section className="strip" aria-label="Needs attention">
      <ul className="strip-list">
        {items.map((it) => (
          <li key={it.key} className={`strip-item strip-${it.tone}`}>
            <span className="strip-dot" aria-hidden="true" />
            <span>{it.text}</span>
            {it.action && (
              <button className="strip-action" onClick={it.action}>
                {it.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
