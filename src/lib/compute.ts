import type {
  AssetClass,
  CashBalance,
  CryptoPosition,
  EquityPosition,
  FxRate,
  Mortgage,
  MortgagePayment,
  OptionPosition,
  Property,
} from './types'
import { BASE_CURRENCY, type Currency } from './types'
import { daysUntil } from './format'

/* ---------- FX ---------- */

export type FxMap = Map<string, FxRate>

/** Convert an amount in `from` currency to HKD using the fx map. Returns null if no rate. */
export function toBase(amount: number, from: Currency, fx: FxMap): number | null {
  if (from === BASE_CURRENCY) return amount
  const direct = fx.get(`${from}${BASE_CURRENCY}`)
  if (direct) return amount * direct.rate
  const inverse = fx.get(`${BASE_CURRENCY}${from}`)
  if (inverse && inverse.rate !== 0) return amount / inverse.rate
  return null
}

/* ---------- Mortgage amortization ---------- */

/** Months of payments elapsed since the first payment date (legacy amortization only). */
export function paymentsElapsed(m: Mortgage, at: Date = new Date()): number {
  if (!m.firstPaymentDate || !m.termMonths) return 0
  const first = new Date(`${m.firstPaymentDate}T00:00:00`)
  if (at < first) return 0
  const months =
    (at.getFullYear() - first.getFullYear()) * 12 + (at.getMonth() - first.getMonth()) + (at.getDate() >= first.getDate() ? 1 : 0)
  return Math.max(0, Math.min(months, m.termMonths))
}

/** A YYYY-MM-DD string for a timestamp, for comparing payment dates to the basis. */
function tsToISODate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Monthly payments remaining: the entered `paymentsLeft` minus the payments
 * logged on/after the basis date. Returns null if paymentsLeft isn't set.
 */
export function paymentsRemaining(m: Mortgage, payments: MortgagePayment[]): number | null {
  if (m.paymentsLeft === undefined) return null
  const basis = m.balanceOverrideAt !== undefined ? tsToISODate(m.balanceOverrideAt) : null
  const made =
    m.id !== undefined
      ? paymentsFor(payments, m.id).filter((p) => basis === null || p.date >= basis).length
      : 0
  return Math.max(0, m.paymentsLeft - made)
}

/** Logged payments for one mortgage on or before `at`, newest first. */
export function paymentsFor(payments: MortgagePayment[], mortgageId: number, at?: Date): MortgagePayment[] {
  const cutoff = at ? `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` : null
  return payments
    .filter((p) => p.mortgageId === mortgageId && (cutoff === null || p.date <= cutoff))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Outstanding balance. Real-payment path wins: once any payment is logged the
 * balance is the tracking baseline (the current-balance override if set, else the
 * original principal) minus the principal repaid since — exact for floating rates.
 * With no payments, falls back to the override, then the amortization formula.
 */
export function mortgageBalance(m: Mortgage, payments: MortgagePayment[] = [], at: Date = new Date()): number {
  const logged = m.id !== undefined ? paymentsFor(payments, m.id, at) : []
  // Current balance is the baseline; subtract only principal repaid on/after the
  // basis date (earlier payments are already reflected in the entered balance).
  if (m.balanceOverride !== undefined) {
    const basis = m.balanceOverrideAt !== undefined ? tsToISODate(m.balanceOverrideAt) : null
    const repaid = logged.filter((p) => basis === null || p.date >= basis).reduce((s, p) => s + p.principal, 0)
    return Math.max(0, m.balanceOverride - repaid)
  }
  if (logged.length > 0) {
    return Math.max(0, m.originalPrincipal - logged.reduce((s, p) => s + p.principal, 0))
  }
  // Legacy amortization fallback, only when those inputs exist on older data.
  if (m.annualRate !== undefined && m.monthlyPayment !== undefined && m.firstPaymentDate && m.termMonths) {
    const n = paymentsElapsed(m, at)
    const r = m.annualRate / 12
    if (r === 0) return Math.max(0, m.originalPrincipal - m.monthlyPayment * n)
    const growth = Math.pow(1 + r, n)
    return Math.max(0, m.originalPrincipal * growth - (m.monthlyPayment * (growth - 1)) / r)
  }
  return m.originalPrincipal
}

/** Interest paid on a mortgage within a calendar year (native currency). */
export function interestPaidInYear(payments: MortgagePayment[], mortgageId: number, year: number): number {
  const prefix = `${year}-`
  return payments
    .filter((p) => p.mortgageId === mortgageId && p.date.startsWith(prefix))
    .reduce((s, p) => s + p.interest, 0)
}

/* ---------- Position valuation (native currency) ---------- */

export function equityValue(p: EquityPosition): number | null {
  if (p.price === undefined) return null
  return p.price * p.quantity
}

export function equityPnl(p: EquityPosition): number | null {
  if (p.price === undefined) return null
  return (p.price - p.avgCost) * p.quantity
}

/** Signed market value: short options carry negative value (a liability to close). */
export function optionValue(p: OptionPosition): number | null {
  if (p.mark === undefined) return null
  const gross = p.mark * p.contracts * p.multiplier
  return p.side === 'long' ? gross : -gross
}

export function optionPnl(p: OptionPosition): number | null {
  if (p.mark === undefined) return null
  const perShare = p.side === 'long' ? p.mark - p.premium : p.premium - p.mark
  return perShare * p.contracts * p.multiplier
}

export function optionDte(p: OptionPosition): number {
  return daysUntil(p.expiry)
}

export function cryptoValue(p: CryptoPosition): number | null {
  if (p.price === undefined) return null
  return p.price * p.quantity
}

export function cryptoPnl(p: CryptoPosition): number | null {
  if (p.price === undefined) return null
  return (p.price - p.avgCost) * p.quantity
}

/* ---------- Aggregation ---------- */

export interface PortfolioData {
  equities: EquityPosition[]
  options: OptionPosition[]
  cryptos: CryptoPosition[]
  cash: CashBalance[]
  properties: Property[]
  mortgages: Mortgage[]
  mortgagePayments: MortgagePayment[]
  fx: FxMap
}

export interface Totals {
  netWorth: number
  byClass: Record<AssetClass, number>
  /** positions whose value could not be converted or priced */
  unpriced: number
}

export function computeTotals(d: PortfolioData): Totals {
  const byClass: Record<AssetClass, number> = { equity: 0, option: 0, crypto: 0, cash: 0, home: 0 }
  let unpriced = 0

  for (const p of d.equities) {
    const v = equityValue(p)
    const base = v === null ? null : toBase(v, p.currency, d.fx)
    if (base === null) unpriced++
    else byClass.equity += base
  }
  for (const p of d.options) {
    const v = optionValue(p)
    const base = v === null ? null : toBase(v, p.currency, d.fx)
    if (base === null) unpriced++
    else byClass.option += base
  }
  for (const p of d.cryptos) {
    const v = cryptoValue(p)
    const base = v === null ? null : toBase(v, 'USD', d.fx)
    if (base === null) unpriced++
    else byClass.crypto += base
  }
  for (const c of d.cash) {
    const base = toBase(c.amount, c.currency, d.fx)
    if (base === null) unpriced++
    else byClass.cash += base
  }
  for (const prop of d.properties) {
    const value = toBase(prop.estimatedValue, prop.currency, d.fx)
    if (value === null) {
      unpriced++
      continue
    }
    let debt = 0
    for (const m of d.mortgages.filter((m) => m.propertyId === prop.id)) {
      const b = toBase(mortgageBalance(m, d.mortgagePayments), m.currency, d.fx)
      if (b !== null) debt += b
    }
    byClass.home += value - debt
  }

  const netWorth = byClass.equity + byClass.option + byClass.crypto + byClass.cash + byClass.home
  return { netWorth, byClass, unpriced }
}

/* ---------- Day-change attribution ---------- */

export function equityKey(p: EquityPosition): string {
  return `eq:${p.ticker}`
}

export function optionKey(p: OptionPosition): string {
  return `op:${p.underlying}:${p.strike}:${p.right}:${p.expiry}:${p.side}`
}

export function cryptoKey(p: CryptoPosition): string {
  return `cr:${p.symbol}`
}

/** Native prices for every priced position + FX rates, for storage in a snapshot. */
export function snapshotPrices(d: PortfolioData): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of d.equities) if (p.price !== undefined) out[equityKey(p)] = p.price
  for (const p of d.options) if (p.mark !== undefined) out[optionKey(p)] = p.mark
  for (const p of d.cryptos) if (p.price !== undefined) out[cryptoKey(p)] = p.price
  for (const [pair, r] of d.fx) out[`fx:${pair}`] = r.rate
  return out
}

export interface DayMover {
  key: string
  label: string
  /** day change in base currency (HKD) */
  change: number
}

export interface DayChanges {
  /** position key → day change in HKD; only positions with prior AND current prices */
  byKey: Map<string, number>
  /** top absolute movers, descending */
  movers: DayMover[]
}

/**
 * Price-movement attribution vs a prior snapshot's stored prices:
 * (current − prior) × current quantity, converted at current FX.
 * FX drift is deliberately not attributed to positions.
 */
export function computeDayChanges(d: PortfolioData, prior: Record<string, number>): DayChanges {
  const byKey = new Map<string, number>()
  const movers: DayMover[] = []

  const push = (key: string, label: string, nativeChange: number, ccy: Currency) => {
    const base = toBase(nativeChange, ccy, d.fx)
    if (base === null) return
    byKey.set(key, base)
    movers.push({ key, label, change: base })
  }

  for (const p of d.equities) {
    const key = equityKey(p)
    const prev = prior[key]
    if (prev === undefined || p.price === undefined) continue
    push(key, p.ticker, (p.price - prev) * p.quantity, p.currency)
  }
  for (const p of d.options) {
    const key = optionKey(p)
    const prev = prior[key]
    if (prev === undefined || p.mark === undefined) continue
    const perShare = p.side === 'long' ? p.mark - prev : prev - p.mark
    push(key, `${p.underlying} ${p.strike}${p.right === 'call' ? 'C' : 'P'}`, perShare * p.contracts * p.multiplier, p.currency)
  }
  for (const p of d.cryptos) {
    const key = cryptoKey(p)
    const prev = prior[key]
    if (prev === undefined || p.price === undefined) continue
    push(key, p.symbol, (p.price - prev) * p.quantity, 'USD')
  }

  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  return { byKey, movers }
}

/* ---------- Attention flags ---------- */

export type Flag =
  | { kind: 'expiry'; option: OptionPosition; dte: number }
  | { kind: 'stale-property'; property: Property; days: number }
  | { kind: 'unpriced'; count: number }

const PROPERTY_STALE_DAYS = 90
export const EXPIRY_WARN_DTE = 14

export function computeFlags(d: PortfolioData, unpriced: number): Flag[] {
  const flags: Flag[] = []
  for (const o of d.options) {
    const dte = optionDte(o)
    if (dte <= EXPIRY_WARN_DTE) flags.push({ kind: 'expiry', option: o, dte })
  }
  for (const p of d.properties) {
    const days = Math.floor((Date.now() - p.valuedAt) / 86_400_000)
    if (days >= PROPERTY_STALE_DAYS) flags.push({ kind: 'stale-property', property: p, days })
  }
  if (unpriced > 0) flags.push({ kind: 'unpriced', count: unpriced })
  flags.sort((a, b) => flagRank(a) - flagRank(b))
  return flags
}

function flagRank(f: Flag): number {
  if (f.kind === 'expiry') return f.dte
  if (f.kind === 'unpriced') return 50
  return 100
}
