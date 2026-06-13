import { useMemo, useState } from 'react'
import type { FxMap } from '../lib/compute'
import { summarizeLedger } from '../lib/ledger'
import type { CashFlow, Mortgage, MortgagePayment, Snapshot, Trade } from '../lib/types'
import { money, signedMoney, todayISO } from '../lib/format'
import { ViewHero } from './ViewHero'

interface Props {
  trades: Trade[]
  mortgagePayments: MortgagePayment[]
  mortgages: Mortgage[]
  cashFlows: CashFlow[]
  snapshots: Snapshot[]
  fx: FxMap
}

/** Net-worth change across a date range, from the daily snapshots. */
function netWorthChange(snapshots: Snapshot[], from: string, to: string): { change: number; pct: number | null } | null {
  if (snapshots.length < 2) return null
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const upToEnd = sorted.filter((s) => s.date <= to)
  if (upToEnd.length === 0) return null
  const end = upToEnd[upToEnd.length - 1]
  // start = the snapshot just at/before the range opens, else the earliest available
  const atOrBeforeFrom = sorted.filter((s) => s.date <= from)
  const start = atOrBeforeFrom.length > 0 ? atOrBeforeFrom[atOrBeforeFrom.length - 1] : sorted[0]
  if (start.date === end.date) return null
  const change = end.netWorth - start.netWorth
  const pct = start.netWorth !== 0 ? (change / Math.abs(start.netWorth)) * 100 : null
  return { change, pct }
}

type Preset = 'month' | 'ytd' | '12mo' | 'all' | 'custom'

function rangeFor(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = todayISO()
  switch (preset) {
    case 'month':
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
    case 'ytd':
      return { from: `${now.getFullYear()}-01-01`, to: today }
    case '12mo': {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - 1)
      return { from: iso(d), to: today }
    }
    case 'all':
      return { from: '1900-01-01', to: today }
    case 'custom':
      return { from: customFrom || '1900-01-01', to: customTo || today }
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'ytd', label: 'This year' },
  { key: '12mo', label: '12 months' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
]

export function SummaryView({ trades, mortgagePayments, mortgages, cashFlows, snapshots, fx }: Props) {
  const [preset, setPreset] = useState<Preset>('ytd')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState(todayISO())

  const { from, to } = rangeFor(preset, customFrom, customTo)
  const s = useMemo(
    () => summarizeLedger({ trades, mortgagePayments, mortgages, cashFlows }, fx, from, to),
    [trades, mortgagePayments, mortgages, cashFlows, fx, from, to],
  )
  const nw = useMemo(() => netWorthChange(snapshots, from, to), [snapshots, from, to])

  const netInvested = s.investedHkd - s.divestedHkd
  const netCapital = s.injectedHkd - s.withdrawnHkd
  const rangeLabel = from === '1900-01-01' ? 'all time' : `since ${from}`

  return (
    <section aria-label="Summary">
      <ViewHero
        label="Net worth change"
        value={nw?.change ?? 0}
        signed
        pct={nw?.pct ?? null}
        sub={nw ? rangeLabel : 'not enough history yet'}
      />
      <div className="ledger-head">
        <h2>Summary</h2>
        <div className="ledger-toggles" role="group" aria-label="Range">
          {PRESETS.map((p) => (
            <button key={p.key} className={`toggle${preset === p.key ? ' toggle-on' : ''}`} aria-pressed={preset === p.key} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="form-grid sum-custom">
          <label className="field">
            <span className="field-label">From</span>
            <input className="input num" type="date" max={todayISO()} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">To</span>
            <input className="input num" type="date" max={todayISO()} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </label>
        </div>
      )}

      <p className="sum-range num">
        {from === '1900-01-01' ? 'all time' : from} → {to} · all figures HKD
      </p>

      <div className="sum-grid">
        <SumCard title="Realized P&L" hint={`${s.sellCount} sells / closes`}>
          <span className={`num sum-big ${s.realizedHkd > 0 ? 'gain' : s.realizedHkd < 0 ? 'loss' : ''}`}>{signedMoney(s.realizedHkd)}</span>
        </SumCard>

        <SumCard title="Net invested" hint={`${s.buyCount} buys · ${s.sellCount} sells`}>
          {/* positive = net capital deployed into holdings; negative = net divested to cash */}
          <span className="num sum-big">{signedMoney(netInvested)}</span>
          <dl className="sum-rows">
            <div><dt>Bought</dt><dd className="num">{money(s.investedHkd)}</dd></div>
            <div><dt>Sold</dt><dd className="num">{money(s.divestedHkd)}</dd></div>
          </dl>
        </SumCard>

        <SumCard title="Mortgage" hint={`${s.mortgageCount} payments`}>
          <dl className="sum-rows">
            <div><dt>Interest</dt><dd className="num">{money(s.interestHkd)}</dd></div>
            <div><dt>Principal</dt><dd className="num">{money(s.principalHkd)}</dd></div>
            <div className="sum-total"><dt>Total paid</dt><dd className="num">{money(s.interestHkd + s.principalHkd)}</dd></div>
          </dl>
        </SumCard>

        <SumCard title="Capital flows" hint={`${s.flowCount} transfers`}>
          <span className={`num sum-big ${netCapital > 0 ? 'gain' : netCapital < 0 ? 'loss' : ''}`}>{signedMoney(netCapital)}</span>
          <dl className="sum-rows">
            <div><dt>Injected</dt><dd className="num">{money(s.injectedHkd)}</dd></div>
            <div><dt>Withdrawn</dt><dd className="num">{money(s.withdrawnHkd)}</dd></div>
          </dl>
        </SumCard>
      </div>
    </section>
  )
}

function SumCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <article className="sum-card">
      <div className="sum-card-head">
        <h3>{title}</h3>
        <span className="sum-hint">{hint}</span>
      </div>
      {children}
    </article>
  )
}
