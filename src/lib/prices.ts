import { db, getSetting } from './db'
import { computeTotals, snapshotPrices, type FxMap } from './compute'
import { todayISO } from './format'
import { BASE_CURRENCY, type Currency } from './types'

const FMP = 'https://financialmodelingprep.com/api/v3'
// FMP's newer "stable" endpoint — used as a per-symbol fallback when the legacy
// v3 path fails (some keys/plans only serve one or the other).
const FMP_STABLE = 'https://financialmodelingprep.com/stable/quote'
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

/**
 * Quote a single symbol, isolated so one bad ticker can't fail the others.
 * Tries the legacy v3 endpoint, then FMP's "stable" endpoint. Returns null when
 * the symbol isn't covered (e.g. an exchange the plan doesn't include) or the
 * request fails — the caller flags just that ticker, not the whole batch.
 */
async function fmpQuoteOne(symbol: string, key: string): Promise<number | null> {
  const urls = [
    `${FMP}/quote/${encodeURIComponent(symbol)}?apikey=${encodeURIComponent(key)}`,
    `${FMP_STABLE}?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const rows = (await res.json()) as FmpQuote[]
      const p = rows?.[0]?.price
      if (typeof p === 'number' && Number.isFinite(p)) return p
    } catch {
      // try the next endpoint
    }
  }
  return null
}

// Keyless, CORS-enabled FX feed (USD-based; we derive cross-rates to HKD).
const FXAPI = 'https://open.er-api.com/v6/latest/USD'

/**
 * Fetch HKD-per-unit rates for the given currencies from a free keyless source.
 * Returns a Map of `${ccy}HKD` → rate. Throws on network/parse failure.
 */
async function fetchFxToHkd(currencies: Currency[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (currencies.length === 0) return out
  const res = await fetch(FXAPI)
  if (!res.ok) throw new Error(`FX ${res.status}`)
  const data = (await res.json()) as { rates?: Record<string, number> }
  const rates = data.rates
  const hkdPerUsd = rates?.HKD
  if (!rates || !hkdPerUsd) throw new Error('FX: no HKD rate')
  for (const ccy of currencies) {
    const perUsd = rates[ccy]
    if (perUsd && Number.isFinite(perUsd)) out.set(`${ccy}${BASE_CURRENCY}`, hkdPerUsd / perUsd)
  }
  return out
}

/** Currencies referenced anywhere in the data that need an FX pair to HKD. */
export async function currenciesInUse(): Promise<Currency[]> {
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
 * Refresh everything refreshable: crypto via Binance and FX via a free FX feed
 * (both keyless), equity quotes via FMP (needs a key). Option marks stay manual.
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

  // --- FX: free keyless feed; never clobbers a manually-set rate ---
  const ccys = await currenciesInUse()
  if (ccys.length > 0) {
    try {
      const fx = await fetchFxToHkd(ccys)
      const existing = new Map((await db.fxRates.toArray()).map((r) => [r.pair, r]))
      for (const [pair, rate] of fx) {
        if (existing.get(pair)?.source === 'manual') continue // respect user overrides
        await db.fxRates.put({ pair, rate, updatedAt: now, source: 'live' })
        updated++
      }
    } catch {
      failed.push('fx')
    }
  }

  // --- Equities: FMP, needs a key ---
  if (key) {
    const equities = await db.equities.toArray()
    const equitySymbols = [...new Set(equities.map((p) => p.ticker))]
    // Try the efficient batch first; if it throws (one unsupported ticker can
    // poison the whole request), fall through and quote the rest individually.
    const eq = new Map<string, number>()
    try {
      for (const [s, p] of await fmpQuotes(equitySymbols, key)) eq.set(s, p)
    } catch {
      // batch failed wholesale — per-symbol fallback below recovers the rest
    }
    // Any symbol the batch didn't return: quote it on its own so supported
    // tickers still update and only the genuinely uncovered ones get flagged.
    const missing = equitySymbols.filter((s) => !eq.has(s))
    await Promise.all(
      missing.map(async (s) => {
        const p = await fmpQuoteOne(s, key)
        if (p !== null) eq.set(s, p)
      }),
    )
    for (const p of equities) {
      const price = eq.get(p.ticker)
      if (price !== undefined) {
        await db.equities.update(p.id!, { price, priceUpdatedAt: now, priceSource: 'live' })
        updated++
      } else {
        failed.push(p.ticker)
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
