import { money, signedMoney, signedPercent } from '../lib/format'
import { UpArrow, DownArrow } from './icons'

interface Props {
  label: string
  /** the headline value in HKD */
  value: number
  /** when true, the value is signed and coloured by direction (gain/loss) */
  signed?: boolean
  /** optional percentage shown beside a signed value */
  pct?: number | null
  /** small context line under the number */
  sub?: string
}

/**
 * The instrument-panel anchor for a view: a display-scale mono figure over a
 * small label, mirroring the dashboard's net-worth treatment so Activity and
 * Summary carry the same presence instead of opening flat.
 */
export function ViewHero({ label, value, signed = false, pct = null, sub }: Props) {
  const dir = !signed || Math.abs(value) < 1 ? 'flat' : value > 0 ? 'gain' : 'loss'
  return (
    <section className="view-hero" aria-label={label}>
      <h2 className="view-hero-label">{label}</h2>
      <p className={`view-hero-value num ${dir === 'gain' ? 'gain' : dir === 'loss' ? 'loss' : ''}`}>
        {signed ? (
          <>
            {dir === 'gain' ? <UpArrow size={20} /> : dir === 'loss' ? <DownArrow size={20} /> : null}
            {dir === 'flat' ? money(value) : signedMoney(value)}
            {pct !== null && pct !== undefined && dir !== 'flat' && (
              <span className="view-hero-pct"> ({signedPercent(pct)})</span>
            )}
          </>
        ) : (
          money(value)
        )}
      </p>
      {sub && <p className="view-hero-sub">{sub}</p>}
    </section>
  )
}
