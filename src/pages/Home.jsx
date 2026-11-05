import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { mondayOf, weekLabel } from '../week.js'
import Dashboard from '../components/Dashboard.jsx'

const BIAS = { long: ['Лонг', 'long'], short: ['Шорт', 'short'], neutral: ['Нейтрально', ''] }

// Главная: сверху планы текущей недели по инструментам, ниже метрики и кривая капитала
export default function Home({ go }) {
  const ws = mondayOf()
  const plans = useLiveQuery(
    () => db.plans.where('weekStart').equals(ws).and((p) => !p.deleted).sortBy('createdAt'),
    [ws],
    []
  )

  return (
    <>
      <div className="page-title">
        <h2 className="section-title" style={{ margin: 0 }}>Планы недели · {weekLabel(ws)}</h2>
        <span className="spacer" />
        <button className="ghost small" onClick={() => go('plan', { weekStart: ws })}>Все планы →</button>
      </div>

      <div className="plan-cards">
        {plans.map((p) => {
          const items = p.checklist || []
          const done = items.filter((x) => x.done).length
          const bias = BIAS[p.bias]
          const text = (p.focus || '').trim() || (p.levels || '').trim()
          return (
            <button key={p.id} className="plan-card" onClick={() => go('plan', { weekStart: ws, planId: p.id })}>
              <div className="plan-card-head">
                <span className="sym">{p.symbol || 'Общий план'}</span>
                {bias && <span className={'badge ' + bias[1]}>{bias[0]}</span>}
              </div>
              <div className="ex">{text || 'План ещё не написан'}</div>
              {items.length > 0 && <div className="hint">Чек-лист: {done}/{items.length}</div>}
            </button>
          )
        })}
        <button className="plan-card add" onClick={() => go('plan', { weekStart: ws, create: true })}>
          + {plans.length === 0 ? 'Создать первый план недели' : 'Новый план'}
        </button>
      </div>

      <Dashboard />
    </>
  )
}
