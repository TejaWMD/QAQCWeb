import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from '@/App.jsx'
import '@/index.css'

// Auto-update service worker so GitHub Pages pushes propagate to installed PWAs
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    // Check for updates whenever the user brings the PWA back to the foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {})
      }
    })
  },
  onNeedRefresh() {
    updateSW(true)
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
