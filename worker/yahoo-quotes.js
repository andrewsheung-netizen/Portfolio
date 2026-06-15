/**
 * Portfolio — Yahoo Finance quote proxy (Cloudflare Worker).
 *
 * A static site can't call Yahoo directly: Yahoo doesn't send CORS headers, so
 * the browser throws away the response. This tiny worker fetches quotes from
 * Yahoo server-side (where CORS doesn't apply) and re-serves them with
 * `Access-Control-Allow-Origin`, so the PWA can read them.
 *
 * Request:  GET /?symbols=AAPL,POET,0700.HK
 * Response: { "AAPL": { "price": 228.9, "currency": "USD" }, ... }
 *           (symbols Yahoo can't price are simply omitted)
 *
 * Uses Yahoo's v8 chart endpoint, which — unlike v7/quote — needs no cookie or
 * "crumb", so it works unauthenticated. One upstream request per symbol, run in
 * parallel and edge-cached for 60s.
 *
 * Deploy: see worker/README.md. Runs free on Cloudflare's Workers free tier.
 */

const YF = 'https://query1.finance.yahoo.com/v8/finance/chart/'
const MAX_SYMBOLS = 60

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }

    const url = new URL(request.url)
    const symbols = (url.searchParams.get('symbols') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_SYMBOLS)

    if (symbols.length === 0) {
      return json({ ok: true, usage: 'GET /?symbols=AAPL,POET,0700.HK' })
    }

    const out = {}
    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const r = await fetch(`${YF}${encodeURIComponent(sym)}?interval=1d&range=1d`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (portfolio-quotes-proxy)' },
            cf: { cacheTtl: 60, cacheEverything: true },
          })
          if (!r.ok) return
          const data = await r.json()
          const meta = data?.chart?.result?.[0]?.meta
          const price = meta?.regularMarketPrice
          if (typeof price === 'number' && isFinite(price)) {
            out[sym] = { price, currency: meta.currency ?? null }
          }
        } catch {
          // omit this symbol; the app keeps its last known value
        }
      }),
    )

    return json(out)
  },
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...CORS },
  })
}
