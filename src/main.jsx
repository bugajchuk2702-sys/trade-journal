import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import '@fontsource-variable/inter/wght.css'
import '@fontsource/fira-sans/latin-400.css'
import '@fontsource/fira-sans/cyrillic-400.css'
import '@fontsource/fira-sans/latin-500.css'
import '@fontsource/fira-sans/cyrillic-500.css'
import '@fontsource/fira-sans/latin-600.css'
import '@fontsource/fira-sans/cyrillic-600.css'
import '@fontsource/fira-sans-extra-condensed/latin-700-italic.css'
import '@fontsource/fira-sans-extra-condensed/cyrillic-700-italic.css'
import '@fontsource/fira-sans-extra-condensed/latin-800-italic.css'
import '@fontsource/fira-sans-extra-condensed/cyrillic-800-italic.css'
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
