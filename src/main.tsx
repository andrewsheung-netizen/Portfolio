import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import App from './App'
import { seedDemo } from './lib/demo'

async function boot() {
  if (new URLSearchParams(location.search).has('demo')) {
    await seedDemo()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

/** Register the offline service worker (production build only). */
function registerSW() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is an enhancement; ignore registration failures */
    })
  })
}

void boot()
registerSW()
