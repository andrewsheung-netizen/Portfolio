import { db } from './db'
import { computeTotals, cryptoKey, equityKey, optionKey, type FxMap } from './compute'
import type { Snapshot } from './types'

/**
 * Sample dataset for trying the app before entering real data.
 * Loaded only via the ?demo=1 URL flag or the Settings action, and only
 * into an empty database. Prices are plausible, not live.
 */
export async function seedDemo(): Promise<boolean> {
  const count = await db.equities.count()
  const cashCount = await db.cash.count()
  if (count > 0 || cashCount > 0) return false

  const now = Date.now()
  const h12 = 12 * 3600_000

  const broker = await db.accounts.add({ name: 'IBKR', kind: 'brokerage', currency: 'USD' })
  const bank = await db.accounts.add({ name: 'HSBC', kind: 'bank', currency: 'HKD' })
  const wallet = await db.accounts.add({ name: 'Ledger', kind: 'wallet', currency: 'USD' })

  await db.equities.bulkAdd([
    { accountId: broker, ticker: 'VOO', name: 'Vanguard S&P 500', quantity: 85, avgCost: 412.4, currency: 'USD', price: 562.18, priceUpdatedAt: now - h12, priceSource: 'manual' },
    { accountId: broker, ticker: 'NVDA', name: 'NVIDIA', quantity: 120, avgCost: 96.2, currency: 'USD', price: 171.44, priceUpdatedAt: now - h12, priceSource: 'manual' },
    { accountId: broker, ticker: 'AAPL', name: 'Apple', quantity: 150, avgCost: 168.7, currency: 'USD', price: 228.92, priceUpdatedAt: now - h12, priceSource: 'manual' },
    { accountId: broker, ticker: '0700.HK', name: 'Tencent', quantity: 800, avgCost: 348.0, currency: 'HKD', price: 524.5, priceUpdatedAt: now - h12, priceSource: 'manual' },
    { accountId: broker, ticker: '2800.HK', name: 'Tracker Fund of HK', quantity: 6000, avgCost: 18.9, currency: 'HKD', price: 26.34, priceUpdatedAt: now - h12, priceSource: 'manual' },
  ])

  const future = (days: number) => {
    const d = new Date(now + days * 86_400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  await db.options.bulkAdd([
    { accountId: broker, underlying: 'NVDA', right: 'call', side: 'long', strike: 180, expiry: future(9), contracts: 5, multiplier: 100, premium: 6.4, currency: 'USD', mark: 4.1, markUpdatedAt: now - h12, markSource: 'manual' },
    { accountId: broker, underlying: 'AAPL', right: 'put', side: 'short', strike: 210, expiry: future(38), contracts: 3, multiplier: 100, premium: 5.2, currency: 'USD', mark: 3.05, markUpdatedAt: now - h12, markSource: 'manual' },
    { accountId: broker, underlying: 'SPY', right: 'put', side: 'long', strike: 545, expiry: future(94), contracts: 4, multiplier: 100, premium: 9.8, currency: 'USD', mark: 11.3, markUpdatedAt: now - h12, markSource: 'manual' },
  ])

  await db.cryptos.bulkAdd([
    { accountId: wallet, symbol: 'BTC', name: 'Bitcoin', quantity: 0.85, avgCost: 48_200, price: 104_350, priceUpdatedAt: now - h12, priceSource: 'manual' },
    { accountId: wallet, symbol: 'ETH', name: 'Ethereum', quantity: 9.2, avgCost: 2_410, price: 3_905, priceUpdatedAt: now - h12, priceSource: 'manual' },
  ])

  await db.cash.bulkAdd([
    { accountId: bank, label: 'HSBC current', amount: 384_000, currency: 'HKD', updatedAt: now - 5 * 86_400_000 },
    { accountId: bank, label: 'Time deposit', amount: 1_200_000, currency: 'HKD', updatedAt: now - 20 * 86_400_000 },
    { accountId: broker, label: 'IBKR cash', amount: 31_500, currency: 'USD', updatedAt: now - h12 },
  ])

  const propertyId = await db.properties.add({
    label: 'Tseung Kwan O flat',
    estimatedValue: 9_800_000,
    currency: 'HKD',
    valuedAt: now - 130 * 86_400_000,
  })

  const mortgageId = (await db.mortgages.add({
    propertyId: propertyId as number,
    lender: 'HSBC',
    originalPrincipal: 5_880_000,
    annualRate: 0.0388,
    monthlyPayment: 26_350,
    firstPaymentDate: '2021-03-01',
    termMonths: 360,
    currency: 'HKD',
    // current balance after ~3.5 years; monthly payments draw down from here
    balanceOverride: 5_268_000,
    balanceOverrideAt: now,
  })) as number

  // two recent statements — HIBOR-linked, so the interest/principal split moves
  const ym = (monthsAgo: number) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() - monthsAgo)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-05`
  }
  await db.mortgagePayments.bulkAdd([
    { mortgageId, date: ym(2), interest: 17_180, principal: 9_170, rate: 0.0395 },
    { mortgageId, date: ym(1), interest: 16_940, principal: 9_410, rate: 0.0388 },
  ])

  await db.fxRates.bulkAdd([
    { pair: 'USDHKD', rate: 7.81, updatedAt: now - h12, source: 'manual' },
  ])

  // ~90 days of plausible history ending at the current computed net worth
  const [equities, options, cryptos, cash, properties, mortgages, mortgagePayments, fxRows] = await Promise.all([
    db.equities.toArray(),
    db.options.toArray(),
    db.cryptos.toArray(),
    db.cash.toArray(),
    db.properties.toArray(),
    db.mortgages.toArray(),
    db.mortgagePayments.toArray(),
    db.fxRates.toArray(),
  ])
  const fx: FxMap = new Map(fxRows.map((r) => [r.pair, r]))
  const totals = computeTotals({ equities, options, cryptos, cash, properties, mortgages, mortgagePayments, fx })

  let seed = 42
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2_147_483_648
    return seed / 2_147_483_648
  }

  // yesterday's per-position prices: current price nudged ±2% so day-change
  // attribution has something honest to show on first open
  const priorPrices: Record<string, number> = {}
  const nudge = (v: number) => v * (1 + (rand() - 0.5) * 0.04)
  for (const p of equities) if (p.price !== undefined) priorPrices[equityKey(p)] = nudge(p.price)
  for (const p of options) if (p.mark !== undefined) priorPrices[optionKey(p)] = nudge(p.mark)
  for (const p of cryptos) if (p.price !== undefined) priorPrices[cryptoKey(p)] = nudge(p.price)
  for (const r of fxRows) priorPrices[`fx:${r.pair}`] = r.rate

  // yesterday's net worth must reconcile with the nudged prices, so the
  // headline move equals the sum of per-position day changes
  const usd = fxRows.find((r) => r.pair === 'USDHKD')?.rate ?? 7.81
  const fxTo = (ccy: string) => (ccy === 'HKD' ? 1 : usd)
  let dayDelta = 0
  for (const p of equities) {
    if (p.price !== undefined) dayDelta += (p.price - priorPrices[equityKey(p)]) * p.quantity * fxTo(p.currency)
  }
  for (const p of options) {
    if (p.mark === undefined) continue
    const perShare = p.side === 'long' ? p.mark - priorPrices[optionKey(p)] : priorPrices[optionKey(p)] - p.mark
    dayDelta += perShare * p.contracts * p.multiplier * fxTo(p.currency)
  }
  for (const p of cryptos) {
    if (p.price !== undefined) dayDelta += (p.price - priorPrices[cryptoKey(p)]) * p.quantity * usd
  }

  const snapshots: Snapshot[] = []
  let value = totals.netWorth
  for (let i = 0; i <= 90; i++) {
    const d = new Date(now - i * 86_400_000)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    snapshots.push({
      date,
      netWorth: value,
      byClass: totals.byClass,
      prices: i === 1 ? priorPrices : undefined,
      takenAt: d.getTime(),
    })
    if (i === 0) {
      value = totals.netWorth - dayDelta
    } else {
      // walk backwards: each prior day differs by ±0.6% with slight downward drift
      value = value * (1 - 0.0009 + (rand() - 0.5) * 0.012)
    }
  }
  await db.snapshots.bulkPut(snapshots)
  return true
}
