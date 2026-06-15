# Yahoo quote proxy (Cloudflare Worker)

A ~50-line worker that lets the Portfolio PWA pull **live equity prices from
Yahoo Finance, keyless** — including the small/micro-caps that FMP's free tier
won't price. It exists only because Yahoo doesn't send CORS headers, so a static
site can't call it directly; the worker fetches server-side and re-serves with
CORS. Runs free on Cloudflare's Workers free tier (100k requests/day).

```
GET https://<your-worker>.workers.dev/?symbols=AAPL,POET,0700.HK
→ { "AAPL": { "price": 228.9, "currency": "USD" }, ... }
```

## Deploy — option A: dashboard (no tools, ~3 min)

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Create Worker**. Give it a name (e.g. `portfolio-quotes`) → **Deploy**.
2. Click **Edit code**. Select all, delete, then paste the entire contents of
   [`yahoo-quotes.js`](./yahoo-quotes.js). Click **Deploy**.
3. Copy the worker URL shown at the top (e.g.
   `https://portfolio-quotes.<you>.workers.dev`).
4. Test it in your browser:
   `https://portfolio-quotes.<you>.workers.dev/?symbols=AAPL` — you should see a
   JSON price.
5. In the Portfolio app: **Settings → Live prices → Quotes proxy URL**, paste the
   URL, **Save**, then **Refresh**.

## Deploy — option B: Wrangler CLI

```sh
npm i -g wrangler
cd worker
wrangler login
wrangler deploy
```

This uses [`wrangler.toml`](./wrangler.toml). The deploy prints the worker URL;
paste it into the app as above.

## Notes

- **Privacy:** requests go through *your own* Cloudflare account, not a third
  party. The worker forwards only the ticker symbols to Yahoo.
- **Locking it down (optional):** the worker allows any origin (`*`) so you can
  test it from a browser. To restrict it to your site, change the
  `Access-Control-Allow-Origin` value in `yahoo-quotes.js` from `'*'` to your
  Pages origin, e.g. `'https://<you>.github.io'`, and redeploy.
- **Symbols:** use the same tickers Yahoo uses — US plain (`AAPL`), HK with
  suffix (`0700.HK`), etc. These match what you already enter for FMP.
- **Fallback:** in the app, the proxy is the primary equity source; if it can't
  price a symbol and you also have an FMP key set, FMP fills the gap. Anything
  neither can price keeps its last manual value.
