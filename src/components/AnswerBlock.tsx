import { useMemo } from 'react'
import type { DayMover, Totals } from '../lib/compute'
import type { Snapshot } from '../lib/types'
import { money, signedMoney, signedPercent, sinceLabel, todayISO } from '../lib/format'
import { useAnimatedNumber } from './useAnimatedNumber'
import { Sparkline } from './Sparkline'
import { UpArrow, DownArrow } from './icons'

interface Props {
  totals: Totals
  snapshots: Snapshot[]
  movers: DayMover[]
}

export function AnswerBlock({ totals, snapshots, movers }: Props) {
  const animated = useAnimatedNumber(totals.netWorth)

  /** Most recent snapshot strictly before today — the honest comparison point. */
  const prior = useMemo(() => {
    const today = todayISO()
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].date < today) return snapshots[i]
    }
    return null
  }, [snapshots])

  const move = prior ? totals.netWorth - prior.netWorth : null
  const movePct = prior && prior.netWorth !== 0 ? ((totals.netWorth - prior.netWorth) / Math.abs(prior.netWorth)) * 100 : null
  // Sub-dollar moves round to zero in the display; treat them as flat.
  const isFlat = move !== null && Math.abs(move) < 1
  const direction = move === null || isFlat ? 'flat' : move > 0 ? 'gain' : 'loss'

  // Silence-is-a-feature: only surface movers that actually moved.
  const meaningfulMovers = useMemo(() => movers.filter((m) => Math.abs(m.change) >= 1), [movers])

  const series = useMemo(() => snapshots.slice(-90).map((s) => s.netWorth), [snapshots])

  return (
    <section className="answer" aria-label="Net worth">
      <h1 className="answer-label">Net worth</h1>
      <p className="answer-value num" aria-label={`Net worth ${money(totals.netWorth)}`}>
        {money(animated)}
      </p>
      <p className="answer-move">
        {move === null || movePct === null ? (
          <span className="answer-move-since">First day — change appears tomorrow</span>
        ) : isFlat ? (
          <span className="answer-move-since">Flat since {sinceLabel(prior!.date)}</span>
        ) : (
          <span className={`num ${direction === 'gain' ? 'gain' : 'loss'}`}>
            {direction === 'gain' ? <UpArrow /> : <DownArrow />}
            {signedMoney(move)} <span className="answer-move-pct">({signedPercent(movePct)})</span>
            <span className="answer-move-since"> since {sinceLabel(prior!.date)}</span>
          </span>
        )}
      </p>
      {meaningfulMovers.length > 0 && (
        <p className="answer-movers" aria-label="Top movers today">
          {meaningfulMovers.slice(0, 3).map((m, i) => (
            <span key={m.key} className="answer-mover">
              {i > 0 && <span className="answer-mover-sep" aria-hidden="true">·</span>}
              <span className="answer-mover-name">{m.label}</span>{' '}
              <span className={`num ${m.change > 0 ? 'gain' : m.change < 0 ? 'loss' : ''}`}>
                {signedMoney(m.change)}
              </span>
            </span>
          ))}
        </p>
      )}
      {series.length >= 2 && (
        <div className="answer-spark">
          <Sparkline values={series} />
        </div>
      )}
    </section>
  )
}
