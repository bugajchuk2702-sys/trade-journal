import React, { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, requestPersistentStorage } from './db.js'
import Dashboard from './components/Dashboard.jsx'
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

function readTab() {
  try {
    const t = localStorage.getItem('tab')
    if (TABS.some((x) => x.id === t)) return t
  } catch {
    /* ignore */
  }
  return TABS[0].id
}

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

export default function App() {
  const online = useOnline()
  const [tab, setTab] = useState(readTab)
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

  const go = (id) => {
    setTab(id)
    try {
      localStorage.setItem('tab', id)
    } catch {
      /* ignore */
    }
  }

  const { Page } = TABS.find((t) => t.id === tab)

  return (
    <div className="shell">
      <header className="nav">
        <div className="brand">📈 Журнал</div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={'tab' + (t.id === tab ? ' active' : '')} onClick={() => go(t.id)}>
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
        </div>
      </header>

      <main className="main">
        <div className="main-inner">
          <Page />
        </div>
      </main>

      <Dashboard />
    </div>
  )
}
