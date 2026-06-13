/* Portfolio service worker — offline app shell for a local-first PWA.
   Strategy: network-first for navigations (so updates land when online,
   with the cached shell as the offline fallback); cache-first for the
   hashed, immutable build assets. Cross-origin requests (e.g. the FMP
   price API) are never intercepted — they hit the network and fail
   gracefully offline, which the app already handles. */

const CACHE = 'portfolio-v1'
const SHELL = new URL('./', self.registration.scope).href

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Only handle our own origin + scope; let everything else (FMP API, fonts CDN) pass through.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(SHELL).pathname)) return

  if (req.mode === 'navigate') {
    // Network-first: fresh shell when online, cached shell when not.
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(CACHE)
          cache.put(SHELL, res.clone())
          return res
        } catch {
          return (await caches.match(SHELL)) || (await caches.match(req)) || Response.error()
        }
      })(),
    )
    return
  }

  // Cache-first for assets (immutable, content-hashed).
  event.respondWith(
    (async () => {
      const cached = await caches.match(req)
      if (cached) return cached
      try {
        const res = await fetch(req)
        if (res.ok && res.type === 'basic') {
          const cache = await caches.open(CACHE)
          cache.put(req, res.clone())
        }
        return res
      } catch {
        return cached || Response.error()
      }
    })(),
  )
})
