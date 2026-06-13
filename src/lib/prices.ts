import { db, getSetting } from './db'
import { computeTotals, snapshotPrices, type FxMap } from './compute'
import { todayISO } from './format'
import { BASE_CURRENCY, type Currency } from './types'

const FMP = 'https://financialmodelingprep.com/api/v3'
// Binance's public market-data host: keyless, CORS-enabled, and (unlike
// api.binance.com) not geo-restricted.
const BINANCE = 'https://data-api.binance.vision/api/v3'

// Treated as $1 — no Binance pair to quote (USDT itself ≈ USD).
const STABLE = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USD'])

/**
 * Public, keyless crypto price from Binance (quoted in USDT ≈ USD, which the app
 * then converts to HKD via the FX rate). One request per symbol so an unlisted
 * coin only fails itself. Returns null when the coin isn't on Binance / offline.
 */
async function binancePrice(symbol: string): Promise<number | null> {
  if (STABLE.has(symbol)) return 1
  try {
    const res = await fetch(`${BINANCE}/ticker/price?symbol=${encodeURIComponent(symbol)}USDT`)
    if (!res.ok) return null
    const r = (await res.json()) as { price?: string }
    const p = Number(r.price)
    return Number.isFinite(p) ? p : null
  } catch {
    return null
  }
}

export interface RefreshResult {
  /** count of positions/rates updated */
  updated: number
  /** symbols or pairs that failed */
  failed: string[]
  /** true when no API key is configured */
  noKey: boolean
  /** human note about options quotes */
  optionsNote?: string
  at: number
}

interface FmpQuote {
  symbol: string
  price: number
  name?: string
}

export interface QuoteLookup {
  name: string
  price: number
}

/**
 * Look up a single symbol's name and current price from FMP. Returns null when
 * there's no API key, the symbol is unknown, or the request fails — callers
 * treat null as "couldn't autofill" and leave the fields for manual entry.
 */
export async function lookupQuote(symbol: string): Promise<QuoteLookup | null> {
  const key = (await getSetting('fmpApiKey'))?.trim()
  if (!key || !symbol.trim()) return null
  try {
    const res = await fetch(`${FMP}/quote/${encodeURIComponent(symbol.trim())}?apikey=${encodeURIComponent(key)}`)
    if (!res.ok) return null
    const rows = (await res.json()) as FmpQuote[]
    const r = rows?.[0]
    if (!r || typeof r.price !== 'number' || !Number.isFinite(r.price)) return null
    return { name: r.name ?? '', price: r.price }
  } catch {
    return null
  }
}

async function fmpQuotes(symbols: string[], key: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (symbols.length === 0) return out
  // FMP batches comfortably at ~50 symbols per request
  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50)
    const res = await fetch(`${FMP}/quote/${batch.join(',')}?apikey=${encodeURIComponent(key)}`)
    if (!res.ok) throw new Error(`FMP ${res.status}`)
    const rows = (await res.json()) as FmpQuote[]
    for (const r of rows) {
      if (typeof r.price === 'number' && Number.isFinite(r.price)) out.set(r.symbol, r.price)
    }
  }
  return out
}

/** Currencies referenced anywhere in the data that need an FX pair to HKD. */
async function currenciesInUse(): Promise<Currency[]> {
  const [equities, options, cash, properties, mortgages, cryptos] = await Promise.all([
    db.equities.toArray(),
    db.options.toArray(),
    db.cash.toArray(),
    db.properties.toArray(),
    db.mortgages.toArray(),
    db.cryptos.toArray(),
  ])
  const set = new Set<Currency>()
  for (const p of equities) set.add(p.currency)
  for (const p of options) set.add(p.currency)
  for (const c of cash) set.add(c.currency)
  for (const p of properties) set.add(p.currency)
  for (const m of mortgages) set.add(m.currency)
  if (cryptos.length > 0) set.add('USD')
  set.delete(BASE_CURRENCY)
  return [...set]
}

/**
 * Refresh everything refreshable: crypto via Binance (public, keyless), equity
 * quotes + FX rates via FMP (needs a key). Option marks stay manual in v1.
 * Always captures a snapshot afterwards, even on partial failure.
 */
export async function refreshAll(): Promise<RefreshResult> {
  const key = (await getSetting('fmpApiKey'))?.trim()
  const failed: string[] = []
  let updated = 0
  const now = Date.now()

  // --- Crypto: Binance public feed, no key needed ---
  const cryptos = await db.cryptos.toArray()
  if (cryptos.length > 0) {
    const symbols = [...new Set(cryptos.map((p) => p.symbol))]
    const prices = new Map<string, number>()
    await Promise.all(
      symbols.map(async (s) => {
        const p = await binancePrice(s)
        if (p !== null) prices.set(s, p)
        else failed.push(s)
      }),
    )
    for (const p of cryptos) {
      const price = prices.get(p.symbol)
      if (price !== undefined) {
        await db.cryptos.update(p.id!, { price, priceUpdatedAt: now, priceSource: 'live' })
        updated++
      }
    }
  }

  // --- Equities + FX: FMP, needs a key ---
  if (key) {
    const [equities, ccys] = await Promise.all([db.equities.toArray(), currenciesInUse()])
    const equitySymbols = [...new Set(equities.map((p) => p.ticker))]
    const fxPairs = ccys.map((c) => `${c}${BASE_CURRENCY}`)

    const tryBatch = async (symbols: string[], label: string): Promise<Map<string, number>> => {
      try {
        return await fmpQuotes(symbols, key)
      } catch {
        failed.push(label)
        return new Map()
      }
    }

    const [eq, fx] = await Promise.all([tryBatch(equitySymbols, 'equities'), tryBatch(fxPairs, 'fx')])

    for (const p of equities) {
      const price = eq.get(p.ticker)
      if (price !== undefined) {
        await db.equities.update(p.id!, { price, priceUpdatedAt: now, priceSource: 'live' })
        updated++
      } else if (equitySymbols.includes(p.ticker) && eq.size > 0) {
        failed.push(p.ticker)
      }
    }
    for (const pair of fxPairs) {
      const rate = fx.get(pair)
      if (rate !== undefined) {
        await db.fxRates.put({ pair, rate, updatedAt: now, source: 'live' })
        updated++
      }
    }
  }

  await captureSnapshot()

  return {
    updated,
    failed: [...new Set(failed)],
    noKey: !key,
    optionsNote: (await db.options.count()) > 0 ? 'Option marks are manual — edit a position to update its mark.' : undefined,
    at: now,
  }
}

/** Recompute totals from the DB and write today's snapshot. */
export async function captureSnapshot(): Promise<void> {
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
  const empty =
    equities.length === 0 &&
    options.length === 0 &&
    cryptos.length === 0 &&
    cash.length === 0 &&
    properties.length === 0
  if (empty) return

  const fx: FxMap = new Map(fxRows.map((r) => [r.pair, r]))
  const data = { equities, options, cryptos, cash, properties, mortgages, mortgagePayments, fx }
  const totals = computeTotals(data)
  await db.snapshots.put({
    date: todayISO(),
    netWorth: totals.netWorth,
    byClass: totals.byClass,
    prices: snapshotPrices(data),
    takenAt: Date.now(),
  })
}
