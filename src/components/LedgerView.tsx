import { useMemo, useState } from 'react'
import type { FxMap } from '../lib/compute'
import { buildLedger, type LedgerCategory, type LedgerItem } from '../lib/ledger'
import type { CashFlow, Mortgage, MortgagePayment, Trade } from '../lib/types'
import { money, signedMoney } from '../lib/format'
import { ViewHero } from './ViewHero'

interface Props {
  trades: Trade[]
  mortgagePayments: MortgagePayment[]
  mortgages: Mortgage[]
  cashFlows: CashFlow[]
  fx: FxMap
}

type Filter = 'All' | LedgerCategory

const FILTERS: Filter[] = ['All', 'Trades', 'Mortgage', 'Cash']
const PAGE = 50

/** The full, chronological log of every money event — each row reversible. */
export function LedgerView({ trades, mortgagePayments, mortgages, cashFlows, fx }: Props) {
  const [filter, setFilter] = useState<Filter>('All')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const items = useMemo(
    () => buildLedger({ trades, mortgagePayments, mortgages, cashFlows }, fx),
    [trades, mortgagePayments, mortgages, cashFlows, fx],
  )

  const q = query.trim().toLowerCase()
  const matched = useMemo(
    () =>
      items.filter(
        (i) =>
          (filter === 'All' || i.category === filter) &&
          (q === '' || `${i.title} ${i.detail}`.toLowerCase().includes(q)),
      ),
    [items, filter, q],
  )
  const shown = matched.slice(0, limit)

  // Reset paging whenever the filter or query narrows the set.
  const resetPaging = () => setLimit(PAGE)

  const year = new Date().getFullYear()
  const ytdRealized = useMemo(() => {
    const jan1 = `${year}-01-01`
    return items.reduce((sum, i) => (i.realizedHkd !== null && i.date >= jan1 ? sum + i.realizedHkd : sum), 0)
  }, [items, year])

  return (
    <section aria-label="Transaction log">
      <ViewHero
        label={`Realized in ${year}`}
        value={ytdRealized}
        signed
        sub={`${items.length} transaction${items.length === 1 ? '' : 's'} logged`}
      />
      <div className="ledger-head">
        <h2>Activity</h2>
        <div className="ledger-toggles" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`toggle${filter === f ? ' toggle-on' : ''}`}
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f)
                resetPaging()
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {items.length > 8 && (
        <input
          className="input log-search"
          type="search"
          placeholder="Search transactions…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            resetPaging()
          }}
          aria-label="Search transactions"
        />
      )}

      {shown.length === 0 ? (
        <p className="ledger-empty">
          {items.length === 0
            ? 'No transactions yet. Buys, sells, mortgage payments and cash moves appear here.'
            : q
              ? `No transactions match “${query.trim()}”.`
              : `No ${filter.toLowerCase()} transactions.`}
        </p>
      ) : (
        <>
          <ul className="log-list">
            {shown.map((it) => (
              <LogRow key={it.id} item={it} />
            ))}
          </ul>
          {matched.length > limit && (
            <button className="btn-ghost log-more" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, matched.length - limit)} more · {matched.length - limit} older
            </button>
          )}
        </>
      )}
    </section>
  )
}

function LogRow({ item }: { item: LedgerItem }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dateStr = new Date(`${item.date}T12:00:00`).toLocaleDateString('en-HK', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <li className="log-row">
      <span className={`log-dot log-dot-${item.kind}`} aria-hidden="true" />
      <div className="log-what">
        <span className="log-title">{item.title}</span>
        <span className="log-meta">
          {dateStr} · {item.detail}
        </span>
        {error && <span className="activity-error">{error}</span>}
      </div>
      <div className="log-amounts">
        <span className="num log-amount">{signedMoney(item.amount, item.currency)}</span>
        {item.realizedHkd !== null && (
          <span className={`num log-realized ${item.realizedHkd > 0 ? 'gain' : item.realizedHkd < 0 ? 'loss' : ''}`}>
            {signedMoney(item.realizedHkd)}
          </span>
        )}
      </div>
      <button
        className={`activity-undo${confirming ? ' confirming' : ''}`}
        disabled={busy}
        aria-live="polite"
        aria-label={`Undo: ${item.title}`}
        onClick={async () => {
          if (!confirming) {
            setConfirming(true)
            return
          }
          setBusy(true)
          setError(null)
          try {
            await item.undo()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Undo failed')
          } finally {
            setBusy(false)
            setConfirming(false)
          }
        }}
        onBlur={() => setConfirming(false)}
      >
        {confirming ? 'Confirm' : 'Undo'}
      </button>
    </li>
  )
}

/** A compact recent-activity teaser for the dashboard (top N, no controls). */
export function RecentActivity({ trades, mortgagePayments, mortgages, cashFlows, fx, onSeeAll }: Props & { onSeeAll: () => void }) {
  const items = useMemo(
    () => buildLedger({ trades, mortgagePayments, mortgages, cashFlows }, fx).slice(0, 5),
    [trades, mortgagePayments, mortgages, cashFlows, fx],
  )
  if (items.length === 0) return null
  return (
    <section className="home" aria-label="Recent activity">
      <div className="ledger-head">
        <h2>Activity</h2>
        <button className="toggle" onClick={onSeeAll}>
          See all
        </button>
      </div>
      <ul className="log-list">
        {items.map((it) => (
          <li key={it.id} className="log-row log-row-compact">
            <span className={`log-dot log-dot-${it.kind}`} aria-hidden="true" />
            <div className="log-what">
              <span className="log-title">{it.title}</span>
              <span className="log-meta">{new Date(`${it.date}T12:00:00`).toLocaleDateString('en-HK', { month: 'short', day: 'numeric' })}</span>
            </div>
            <span className={`num log-amount ${it.realizedHkd && it.realizedHkd !== 0 ? (it.realizedHkd > 0 ? 'gain' : 'loss') : ''}`}>
              {it.realizedHkd !== null ? signedMoney(it.realizedHkd) : money(item_abs(it.amount), it.currency)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function item_abs(v: number): number {
  return Math.abs(v)
}
