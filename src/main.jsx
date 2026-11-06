import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/exo-2/wght.css'
import './app.css'

// Автообновление: когда на сайте выходит новая версия, приложение само
// подтягивает её и перезагружается. Проверка — при открытии, при возврате
// на вкладку и раз в полчаса.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => reg.update().catch(() => {})
    setInterval(check, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

createRoot(document.getElementById('root')).render(<App />)
