import type { AssetClass } from '../lib/types'
import { ASSET_CLASS_LABEL } from '../lib/types'
import { money } from '../lib/format'

interface Props {
  byClass: Record<AssetClass, number>
  netWorth: number
}

const ORDER: AssetClass[] = ['equity', 'option', 'crypto', 'cash', 'home']

/**
 * One horizontal proportion bar + legend. Negative classes (e.g. net-short
 * options) are excluded from the bar geometry but stay in the legend.
 */
export function AllocationBand({ byClass, netWorth }: Props) {
  const positive = ORDER.filter((k) => byClass[k] > 0)
  const totalPositive = positive.reduce((s, k) => s + byClass[k], 0)
  const present = ORDER.filter((k) => byClass[k] !== 0)

  if (present.length === 0) return null

  return (
    <section className="alloc" aria-label="Allocation by asset class">
      <div className="alloc-bar" role="img" aria-label={barLabel(present, byClass, netWorth)}>
        {positive.map((k) => (
          <span
            key={k}
            className="alloc-seg"
            style={{
              width: `${(byClass[k] / totalPositive) * 100}%`,
              background: `var(--viz-${k})`,
            }}
          />
        ))}
      </div>
      <ul className="alloc-legend">
        {present.map((k) => (
          <li key={k} className="alloc-item">
            <span className="alloc-swatch" style={{ background: `var(--viz-${k})` }} aria-hidden="true" />
            <span className="alloc-name">{ASSET_CLASS_LABEL[k]}</span>
            <span className="alloc-figures num">
              {money(byClass[k])}
              <span className="alloc-pct">
                {' '}
                {netWorth !== 0 ? `${((byClass[k] / netWorth) * 100).toFixed(0)}%` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function barLabel(present: AssetClass[], byClass: Record<AssetClass, number>, netWorth: number): string {
  return present
    .map((k) => `${ASSET_CLASS_LABEL[k]} ${netWorth !== 0 ? ((byClass[k] / netWorth) * 100).toFixed(0) : 0}%`)
    .join(', ')
}
