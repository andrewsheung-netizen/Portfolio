import { toBase, type FxMap } from './compute'
import { undoCashFlow, undoMortgagePayment, undoTrade } from './trades'
import type { CashFlow, Currency, Mortgage, MortgagePayment, Trade } from './types'

export type LedgerKind = 'buy' | 'sell' | 'close' | 'mortgage' | 'injection' | 'withdrawal'
export type LedgerCategory = 'Trades' | 'Mortgage' | 'Cash'

export interface LedgerItem {
  id: string
  ts: number
  /** YYYY-MM-DD for range filtering */
  date: string
  kind: LedgerKind
  category: LedgerCategory
  title: string
  detail: string
  /** signed native-currency amount shown on the row (cash impact or payment size) */
  amount: number
  currency: Currency
  /** realized P&L in HKD, when applicable (sells/closes) */
  realizedHkd: number | null
  undo: () => Promise<void>
}

function isoToTs(date: string): number {
  return new Date(`${date}T12:00:00`).getTime()
}

function tsToDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Sources {
  trades: Trade[]
  mortgagePayments: MortgagePayment[]
  mortgages: Mortgage[]
  cashFlows: CashFlow[]
}

/** Merge every money event into one chronological, undoable list (newest first). */
export function buildLedger({ trades, mortgagePayments, mortgages, cashFlows }: Sources, fx: FxMap): LedgerItem[] {
  const items: LedgerItem[] = []

  for (const t of trades) {
    const verb = t.kind === 'buy' ? 'Bought' : t.kind === 'sell' ? 'Sold' : 'Closed'
    const qty = t.assetType === 'option' ? `${t.quantity}×` : `${t.quantity}`
    const cashNote =
      t.funded === 'injection'
        ? '· fresh injection'
        : t.cashLabel
          ? `· ${t.cashDelta >= 0 ? '→' : '←'} ${t.cashLabel}`
          : ''
    items.push({
      id: `trade-${t.id}`,
      ts: t.at,
      date: tsToDate(t.at),
      kind: t.kind,
      category: 'Trades',
      title: `${verb} ${qty} ${t.symbol}`,
      detail: `@ ${fmtUnit(t.price, t.currency)} ${cashNote}`.trim(),
      amount: t.cashDelta,
      currency: t.currency,
      realizedHkd: t.kind === 'buy' ? null : toBase(t.realized, t.currency, fx),
      undo: () => undoTrade(t),
    })
  }

  for (const p of mortgagePayments) {
    const m = mortgages.find((mm) => mm.id === p.mortgageId)
    const ccy = m?.currency ?? 'HKD'
    items.push({
      id: `mort-${p.id}`,
      ts: isoToTs(p.date),
      date: p.date,
      kind: 'mortgage',
      category: 'Mortgage',
      title: `${m?.lender ?? 'Mortgage'} payment`,
      detail: `interest ${fmtUnit(p.interest, ccy)} · principal ${fmtUnit(p.principal, ccy)}`,
      amount: -(p.interest + p.principal),
      currency: ccy,
      realizedHkd: null,
      undo: () => undoMortgagePayment(p),
    })
  }

  for (const f of cashFlows) {
    items.push({
      id: `flow-${f.id}`,
      ts: f.at,
      date: f.date,
      kind: f.kind,
      category: 'Cash',
      title: f.kind === 'injection' ? 'Cash injection' : 'Cash withdrawal',
      detail: `${f.kind === 'injection' ? '→' : '←'} ${f.cashLabel}${f.note ? ` · ${f.note}` : ''}`,
      amount: f.kind === 'injection' ? f.amount : -f.amount,
      currency: f.currency,
      realizedHkd: null,
      undo: () => undoCashFlow(f),
    })
  }

  items.sort((a, b) => b.ts - a.ts)
  return items
}

function fmtUnit(v: number, ccy: Currency): string {
  // light formatter to avoid importing the heavier money() here; 2dp for prices
  const sym = ccy === 'HKD' ? 'HK$' : ccy === 'USD' ? 'US$' : `${ccy} `
  return `${sym}${v.toLocaleString('en-HK', { maximumFractionDigits: 2 })}`
}

export interface CategorySummary {
  realizedHkd: number
  investedHkd: number // cash out on buys (native→HKD), positive = deployed
  divestedHkd: number // cash in on sells
  interestHkd: number
  principalHkd: number
  injectedHkd: number // explicit injections + injection-funded buys
  withdrawnHkd: number
  buyCount: number
  sellCount: number
  mortgageCount: number
  flowCount: number
}

/**
 * Aggregate ledger items within [from, to] (inclusive YYYY-MM-DD) into HKD totals.
 * Items whose native amount can't be converted (missing FX) are skipped from sums.
 */
export function summarizeLedger(
  src: Sources,
  fx: FxMap,
  from: string,
  to: string,
): CategorySummary {
  const s: CategorySummary = {
    realizedHkd: 0,
    investedHkd: 0,
    divestedHkd: 0,
    interestHkd: 0,
    principalHkd: 0,
    injectedHkd: 0,
    withdrawnHkd: 0,
    buyCount: 0,
    sellCount: 0,
    mortgageCount: 0,
    flowCount: 0,
  }

  for (const t of src.trades) {
    const d = tsToDate(t.at)
    if (d < from || d > to) continue
    const ccy = t.currency
    if (t.kind === 'buy') {
      s.buyCount++
      const cost = toBase(t.price * t.quantity, ccy, fx)
      if (cost !== null) {
        s.investedHkd += cost
        if (t.funded === 'injection') s.injectedHkd += cost
      }
    } else {
      s.sellCount++
      const r = toBase(t.realized, ccy, fx)
      if (r !== null) s.realizedHkd += r
      const proceeds = toBase(t.cashDelta, ccy, fx)
      if (proceeds !== null) s.divestedHkd += proceeds
    }
  }

  for (const p of src.mortgagePayments) {
    if (p.date < from || p.date > to) continue
    s.mortgageCount++
    const ccy = src.mortgages.find((m) => m.id === p.mortgageId)?.currency ?? 'HKD'
    const int = toBase(p.interest, ccy, fx)
    const pri = toBase(p.principal, ccy, fx)
    if (int !== null) s.interestHkd += int
    if (pri !== null) s.principalHkd += pri
  }

  for (const f of src.cashFlows) {
    if (f.date < from || f.date > to) continue
    s.flowCount++
    const a = toBase(f.amount, f.currency, fx)
    if (a === null) continue
    if (f.kind === 'injection') s.injectedHkd += a
    else s.withdrawnHkd += a
  }

  return s
}
