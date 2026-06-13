# Portfolio

A live personal net-worth and assets tracker — investments, options, crypto, cash, and property + mortgage in one HKD picture. Local-first (all data lives in your browser via IndexedDB), installable as a PWA, and works offline.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build locally
```

Icons are generated from `public/icon.svg`:

```bash
node scripts/gen-icons.mjs   # rewrites the pwa-*.png / apple-touch-icon.png
```

## PWA

- Installable (manifest + icons) and offline-capable via `public/sw.js` (network-first for the app shell, cache-first for hashed assets; the price API is never cached and degrades gracefully offline).
- The service worker only registers in production builds.

## Deploy to GitHub Pages

The build uses a **relative base path**, so it runs at any Pages URL without configuration. A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and publishes on every push to `main`.

One-time setup:

1. Create a repo on GitHub and push this project:
   ```bash
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site publishes to
   `https://<you>.github.io/<repo>/`.

Your data is per-device and per-origin — export a JSON backup from Settings to move it between devices.
