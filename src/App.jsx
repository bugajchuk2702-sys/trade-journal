import React, { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, requestPersistentStorage } from './db.js'
import Home from './pages/Home.jsx'
import WeeklyPlan from './pages/WeeklyPlan.jsx'
import Trades from './pages/Trades.jsx'
import Mpa from './pages/Mpa.jsx'
import Notes from './pages/Notes.jsx'

const TABS = [
  { id: 'plan', label: 'Weekly Plan', Page: WeeklyPlan },
  { id: 'trades', label: 'Trades', Page: Trades },
  { id: 'mpa', label: 'MPA', Page: Mpa },
  { id: 'notes', label: 'Notes', Page: Notes },
]

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

const THEMES = ['auto', 'light', 'dark']
const THEME_ICON = { auto: 'Авто', light: 'Светлая', dark: 'Тёмная' }

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'auto' } catch { return 'auto' }
  })
  useEffect(() => {
    const el = document.documentElement
    if (theme === 'auto') el.removeAttribute('data-theme')
    else el.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])
  const next = () => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])
  return [theme, next]
}

function useStyle() {
  const [style, setStyle] = useState(() => {
    try { return localStorage.getItem('style') === 'cyber' ? 'cyber' : 'apple' } catch { return 'apple' }
  })
  useEffect(() => {
    const el = document.documentElement
    if (style === 'cyber') el.dataset.style = 'cyber'
    else el.removeAttribute('data-style')
    try { localStorage.setItem('style', style) } catch {}
  }, [style])
  return [style, setStyle]
}

export default function App() {
  const online = useOnline()
  const [style, setStyle] = useStyle()
  const [theme, nextTheme] = useTheme()
  // Приложение всегда открывается на главной. params нужны, чтобы с карточки плана
  // сразу попасть в нужный план на странице Weekly Plan.
  const [view, setView] = useState({ tab: 'home', params: {} })
  const [persisted, setPersisted] = useState(null)

  useEffect(() => {
    requestPersistentStorage().then(setPersisted)
  }, [])

  const pending = useLiveQuery(async () => {
    const [a, b, c] = await Promise.all([
      db.trades.where('synced').equals(0).count(),
      db.plans.where('synced').equals(0).count(),
      db.notes.where('synced').equals(0).count(),
    ])
    return a + b + c
  }, [], 0)

  const go = (tab, params = {}) => {
    setView({ tab, params })
    document.querySelector('.main')?.scrollTo({ top: 0 })
  }

  const Page = view.tab === 'home' ? Home : TABS.find((t) => t.id === view.tab).Page

  return (
    <div className="shell">
      <header className="nav">
        <button className={'brand' + (view.tab === 'home' ? ' active' : '')} onClick={() => go('home')} title="Главная">
          <span className="logo">
            <svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>
          </span>
          Журнал
        </button>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={'tab' + (t.id === view.tab ? ' active' : '')} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <div className="status">
          <span className={'dot ' + (online ? 'ok' : 'off')} />
          {online ? 'Онлайн' : 'Офлайн'}
          {pending > 0 && ` · не синхронизировано: ${pending}`}
          {persisted === false && ' · хранилище не защищено'}
          <span title="Время сборки этой версии"> · версия от {new Date(__BUILD_TIME__).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
        <div className="tabs stylesw" title="Стиль оформления">
          <button className={'tab' + (style === 'apple' ? ' active' : '')} onClick={() => setStyle('apple')}>Apple</button>
          <button className={'tab' + (style === 'cyber' ? ' active' : '')} onClick={() => setStyle('cyber')}>Cyber</button>
        </div>
        <button className="icon-btn theme-btn" onClick={nextTheme} title={'Тема: ' + ({ auto: 'как в системе', light: 'светлая', dark: 'тёмная' })[theme]}>
          {THEME_ICON[theme]}
        </button>
      </header>

      <main className="main">
        <div className="main-inner">
          <Page go={go} params={view.params} />
        </div>
      </main>
    </div>
  )
}
