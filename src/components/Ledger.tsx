import { useMemo, useState } from 'react'
import type { PortfolioData } from '../lib/compute'
import {
  cryptoKey,
  cryptoPnl,
  cryptoValue,
  equityKey,
  equityPnl,
  equityValue,
  optionDte,
  optionKey,
  optionPnl,
  optionValue,
  toBase,
} from '../lib/compute'
import type { Account, Currency } from '../lib/types'
import { age, money, price, quantity, shortDate, signedMoney } from '../lib/format'
import { usePulseKeys } from './usePulseKeys'
import type { EditTarget } from './forms'

interface Props {
  data: PortfolioData
  accounts: Account[]
  onEdit: (t: EditTarget) => void
  /** position key → day change in HKD; null until a prior snapshot with prices exists */
  dayByKey: Map<string, number> | null
}

/** Age note shown only once a value is genuinely stale (>24h); fresh values stay quiet. */
function staleNote(ts?: number): string | null {
  if (!ts) return null
  return Date.now() - ts > 86_400_000 ? age(ts) : null
}

type SortKey = 'name' | 'value' | 'pnl'

export function Ledger({ data, onEdit, dayByKey }: Props) {
  const [showNative, setShowNative] = useState(false)
  const [showDay, setShowDay] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'value', dir: -1 })
  const { fx } = data
  const hasDayData = dayByKey !== null && dayByKey.size > 0
  const dayMode = showDay && hasDayData

  // Generic sort by the chosen key; missing values sink to the bottom on desc.
  const NEG = Number.NEGATIVE_INFINITY
  function sortRows<T>(arr: T[], name: (t: T) => string, value: (t: T) => number, pnl: (t: T) => number): T[] {
    const d = sort.dir
    return [...arr].sort((a, b) => {
      if (sort.key === 'name') return name(a).localeCompare(name(b)) * d
      const av = sort.key === 'pnl' ? pnl(a) : value(a)
      const bv = sort.key === 'pnl' ? pnl(b) : value(b)
      if (av === bv) return name(a).localeCompare(name(b))
      return (av - bv) * d
    })
  }
  const hkd = (native: number | null, ccy: Currency): number => {
    if (native === null) return NEG
    return toBase(native, ccy, fx) ?? NEG
  }

  const equities = useMemo(
    () =>
      sortRows(
        data.equities,
        (p) => p.ticker,
        (p) => hkd(equityValue(p), p.currency),
        (p) => hkd(equityPnl(p), p.currency),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.equities, sort, fx],
  )
  const options = useMemo(
    () =>
      sortRows(
        data.options,
        (p) => `${p.underlying} ${p.strike}`,
        (p) => hkd(optionValue(p), p.currency),
        (p) => hkd(optionPnl(p), p.currency),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.options, sort, fx],
  )
  const cryptos = useMemo(
    () =>
      sortRows(
        data.cryptos,
        (p) => p.symbol,
        (p) => hkd(cryptoValue(p), 'USD'),
        (p) => hkd(cryptoPnl(p), 'USD'),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.cryptos, sort, fx],
  )
  const cashRows = useMemo(
    () =>
      sortRows(
        data.cash,
        (c) => c.label,
        (c) => hkd(c.amount, c.currency),
        (c) => hkd(c.amount, c.currency),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.cash, sort, fx],
  )

  const pulse = usePulseKeys(
    useMemo(
      () => [
        ...data.equities.map((p): [string, number | undefined] => [`eq-${p.id}`, p.price]),
        ...data.options.map((p): [string, number | undefined] => [`op-${p.id}`, p.mark]),
        ...data.cryptos.map((p): [string, number | undefined] => [`cr-${p.id}`, p.price]),
      ],
      [data.equities, data.options, data.cryptos],
    ),
  )

  const hasForeign = useMemo(() => {
    return (
      data.equities.some((p) => p.currency !== 'HKD') ||
      data.options.some((p) => p.currency !== 'HKD') ||
      data.cryptos.length > 0 ||
      data.cash.some((c) => c.currency !== 'HKD')
    )
  }, [data])

  const val = (native: number | null, ccy: Currency): { text: string; missing: boolean } => {
    if (native === null) return { text: '—', missing: true }
    if (showNative) return { text: money(native, ccy), missing: false }
    const base = toBase(native, ccy, fx)
    if (base === null) return { text: '—', missing: true }
    return { text: money(base), missing: false }
  }

  const subtotal = (values: Array<{ v: number | null; ccy: Currency }>): string => {
    let sum = 0
    for (const { v, ccy } of values) {
      if (v === null) continue
      const b = toBase(v, ccy, fx)
      if (b !== null) sum += b
    }
    return money(sum)
  }

  const sections: React.ReactNode[] = []

  if (equities.length > 0) {
    sections.push(
      <LedgerGroup
        key="eq"
        title="Equities"
        subtotal={subtotal(equities.map((p) => ({ v: equityValue(p), ccy: p.currency })))}
        head={
          <tr>
            <th scope="col">Position</th>
            <th scope="col" className="num-col">Qty</th>
            <th scope="col" className="num-col col-md">Price</th>
            <th scope="col" className="num-col">Value</th>
            <th scope="col" className="num-col col-md">{dayMode ? 'Day' : 'P&L'}</th>
          </tr>
        }
      >
        {equities.map((p) => {
          const pnl = equityPnl(p)
          const pnlBase = pnl === null ? null : toBase(pnl, p.currency, fx)
          const v = val(equityValue(p), p.currency)
          return (
            <tr
              key={p.id}
              className={pulse.has(`eq-${p.id}`) ? 'pulse' : undefined}
              onClick={() => onEdit({ kind: 'equity', row: p })}
            >
              <td>
                <button
                  className="pos-edit"
                  aria-label={`Edit ${p.ticker} position`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit({ kind: 'equity', row: p })
                  }}
                >
                  <span className="pos-ticker num">{p.ticker}</span>
                  <span className="pos-name">{p.name}</span>
                </button>
              </td>
              <td className="num num-col">{quantity(p.quantity)}</td>
              <td className="num num-col col-md">
                {p.price !== undefined ? (
                  <>
                    {price(p.price, p.currency)}
                    {p.priceSource === 'manual' && staleNote(p.priceUpdatedAt) && (
                      <span className="cell-note">{staleNote(p.priceUpdatedAt)}</span>
                    )}
                  </>
                ) : (
                  <span className="cell-missing">no price</span>
                )}
              </td>
              <td className={`num num-col${v.missing ? ' cell-missing' : ''}`}>{v.text}</td>
              <td className="num num-col col-md">
                {dayMode ? (
                  <DayCell value={dayByKey?.get(equityKey(p))} />
                ) : pnlBase !== null ? (
                  <PnlCell value={pnlBase} native={showNative ? pnl : null} ccy={p.currency} />
                ) : (
                  '—'
                )}
              </td>
            </tr>
          )
        })}
      </LedgerGroup>,
    )
  }

  if (options.length > 0) {
    sections.push(
      <LedgerGroup
        key="op"
        title="Options"
        subtotal={subtotal(options.map((p) => ({ v: optionValue(p), ccy: p.currency })))}
        head={
          <tr>
            <th scope="col">Contract</th>
            <th scope="col" className="num-col col-md">Mark</th>
            <th scope="col" className="num-col">Expiry</th>
            <th scope="col" className="num-col">Value</th>
            <th scope="col" className="num-col col-md">{dayMode ? 'Day' : 'P&L'}</th>
          </tr>
        }
      >
        {options.map((p) => {
          const dte = optionDte(p)
          const pnl = optionPnl(p)
          const pnlBase = pnl === null ? null : toBase(pnl, p.currency, fx)
          const v = val(optionValue(p), p.currency)
          return (
            <tr
              key={p.id}
              className={pulse.has(`op-${p.id}`) ? 'pulse' : undefined}
              onClick={() => onEdit({ kind: 'option', row: p })}
            >
              <td>
                <button
                  className="pos-edit"
                  aria-label={`Edit ${p.underlying} ${p.strike} ${p.right} option`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit({ kind: 'option', row: p })
                  }}
                >
                  <span className="pos-ticker num">
                    {p.underlying} {p.strike}
                    {p.right === 'call' ? 'C' : 'P'}
                  </span>
                  <span className="pos-name">
                    {p.side === 'short' ? 'short ' : ''}
                    {p.contracts}× · {shortDate(p.expiry)}
                  </span>
                </button>
              </td>
              <td className="num num-col col-md">
                {p.mark !== undefined ? (
                  <>
                    {price(p.mark, p.currency)}
                    {staleNote(p.markUpdatedAt) && <span className="cell-note">{staleNote(p.markUpdatedAt)}</span>}
                  </>
                ) : (
                  <span className="cell-missing">no mark</span>
                )}
              </td>
              <td className="num num-col">
                <span className={dte < 0 ? 'loss' : dte <= 14 ? 'dte-warn' : undefined}>
                  {dte < 0 ? 'expired' : `${dte}d`}
                </span>
              </td>
              <td className={`num num-col${v.missing ? ' cell-missing' : ''}`}>{v.text}</td>
              <td className="num num-col col-md">
                {dayMode ? (
                  <DayCell value={dayByKey?.get(optionKey(p))} />
                ) : pnlBase !== null ? (
                  <PnlCell value={pnlBase} native={showNative ? pnl : null} ccy={p.currency} />
                ) : (
                  '—'
                )}
              </td>
            </tr>
          )
        })}
      </LedgerGroup>,
    )
  }

  if (cryptos.length > 0) {
    sections.push(
      <LedgerGroup
        key="cr"
        title="Crypto"
        subtotal={subtotal(cryptos.map((p) => ({ v: cryptoValue(p), ccy: 'USD' as Currency })))}
        head={
          <tr>
            <th scope="col">Asset</th>
            <th scope="col" className="num-col">Qty</th>
            <th scope="col" className="num-col col-md">Price</th>
            <th scope="col" className="num-col">Value</th>
            <th scope="col" className="num-col col-md">{dayMode ? 'Day' : 'P&L'}</th>
          </tr>
        }
      >
        {cryptos.map((p) => {
          const pnl = cryptoPnl(p)
          const pnlBase = pnl === null ? null : toBase(pnl, 'USD', fx)
          const v = val(cryptoValue(p), 'USD')
          return (
            <tr
              key={p.id}
              className={pulse.has(`cr-${p.id}`) ? 'pulse' : undefined}
              onClick={() => onEdit({ kind: 'crypto', row: p })}
            >
              <td>
                <button
                  className="pos-edit"
                  aria-label={`Edit ${p.symbol} position`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit({ kind: 'crypto', row: p })
                  }}
                >
                  <span className="pos-ticker num">{p.symbol}</span>
                  <span className="pos-name">{p.name}</span>
                </button>
              </td>
              <td className="num num-col">{quantity(p.quantity)}</td>
              <td className="num num-col col-md">
                {p.price !== undefined ? price(p.price, 'USD') : <span className="cell-missing">no price</span>}
              </td>
              <td className={`num num-col${v.missing ? ' cell-missing' : ''}`}>{v.text}</td>
              <td className="num num-col col-md">
                {dayMode ? (
                  <DayCell value={dayByKey?.get(cryptoKey(p))} />
                ) : pnlBase !== null ? (
                  <PnlCell value={pnlBase} native={showNative ? pnl : null} ccy="USD" />
                ) : (
                  '—'
                )}
              </td>
            </tr>
          )
        })}
      </LedgerGroup>,
    )
  }

  if (cashRows.length > 0) {
    sections.push(
      <LedgerGroup
        key="ca"
        title="Cash"
        subtotal={subtotal(cashRows.map((c) => ({ v: c.amount, ccy: c.currency })))}
        head={
          <tr>
            <th scope="col">Account</th>
            <th scope="col" className="num-col col-md">Updated</th>
            <th scope="col" className="num-col">Amount</th>
            <th scope="col" className="num-col">Value</th>
          </tr>
        }
      >
        {cashRows.map((c) => {
          const v = val(c.amount, c.currency)
          return (
            <tr key={c.id} onClick={() => onEdit({ kind: 'cash', row: c })}>
              <td>
                <button
                  className="pos-edit"
                  aria-label={`Edit ${c.label} cash balance`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit({ kind: 'cash', row: c })
                  }}
                >
                  <span className="pos-ticker">{c.label}</span>
                  <span className="pos-name">{c.currency}</span>
                </button>
              </td>
              <td className="num num-col col-md">
                <span className="cell-note">{age(c.updatedAt)}</span>
              </td>
              <td className="num num-col">{money(c.amount, c.currency)}</td>
              <td className={`num num-col${v.missing ? ' cell-missing' : ''}`}>{v.text}</td>
            </tr>
          )
        })}
      </LedgerGroup>,
    )
  }

  if (sections.length === 0) return null

  return (
    <section className="ledger" aria-label="Holdings">
      <div className="ledger-head">
        <h2>Holdings</h2>
        <div className="ledger-toggles">
          <span className="sort-label">Sort</span>
          {(['value', 'pnl', 'name'] as SortKey[]).map((k) => {
            const active = sort.key === k
            return (
              <button
                key={k}
                className={`toggle${active ? ' toggle-on' : ''}`}
                aria-pressed={active}
                title={`Sort holdings by ${k === 'pnl' ? 'P&L' : k}`}
                onClick={() =>
                  setSort((s) =>
                    s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: k === 'name' ? 1 : -1 },
                  )
                }
              >
                {k === 'pnl' ? 'P&L' : k === 'name' ? 'Name' : 'Value'}
                {active && <span className="sort-arrow" aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span>}
              </button>
            )
          })}
          {(hasDayData || hasForeign) && <span className="sort-label sort-label-gap">Show</span>}
          {hasDayData && (
            <button
              className="toggle"
              onClick={() => setShowDay((s) => !s)}
              aria-pressed={showDay}
              title="Switch the last column between lifetime P&L and today's change"
            >
              {dayMode ? 'Day' : 'Total P&L'}
            </button>
          )}
          {hasForeign && (
            <button
              className="toggle"
              onClick={() => setShowNative((s) => !s)}
              aria-pressed={showNative}
              title="Switch between HKD and native currency values"
            >
              {showNative ? 'Native' : 'HKD'}
            </button>
          )}
        </div>
      </div>
      {sections}
    </section>
  )
}

function LedgerGroup({
  title,
  subtotal,
  head,
  children,
}: {
  title: string
  subtotal: string
  head: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="group">
      <div className="group-head">
        <h3>{title}</h3>
        <span className="group-subtotal num">{subtotal}</span>
      </div>
      <table className="group-table">
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** Day change in HKD; em-dash when the position has no prior price yet. */
function DayCell({ value }: { value: number | undefined }) {
  if (value === undefined) return <>—</>
  const cls = value > 0 ? 'gain' : value < 0 ? 'loss' : ''
  return <span className={cls}>{signedMoney(value)}</span>
}

function PnlCell({ value, native, ccy }: { value: number; native: number | null; ccy: Currency }) {
  const cls = value > 0 ? 'gain' : value < 0 ? 'loss' : ''
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const shown = native !== null ? Math.abs(native) : Math.abs(value)
  const shownCcy = native !== null ? ccy : 'HKD'
  return (
    <span className={cls}>
      {sign}
      {money(shown, shownCcy).replace('−', '')}
    </span>
  )
}
