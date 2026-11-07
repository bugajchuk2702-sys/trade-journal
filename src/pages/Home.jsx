import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { mondayOf, shiftWeek, weekLabel } from '../week.js'
import Dashboard from '../components/Dashboard.jsx'
import { SymbolIcon } from '../components/Symbols.jsx'

// Итог недели по инструменту (второй элемент — цвет значка)
const RESULT = { profit: ['Прибыльная', 'profit'], loss: ['Убыточная', 'loss'], be: ['Безубыточная', 'be'] }

// Плитка с числом на карточке плана; ноль приглушён
const Stat = ({ n, label, muted }) => (
  <div className={'pc-stat' + (muted || n === 0 ? ' zero' : '')}>
    <b>{n}</b>
    <span>{label}</span>
  </div>
)

// Главная: сверху планы текущей недели по инструментам, ниже метрики и кривая капитала
export default function Home({ go }) {
  const current = mondayOf()
  const [ws, setWs] = useState(current)
  const plans = useLiveQuery(
    () => db.plans.where('weekStart').equals(ws).and((p) => !p.deleted).sortBy('createdAt'),
    [ws],
    []
  )

  const counts = useLiveQuery(
    () => db.trades.filter((t) => !t.deleted && t.planId).toArray().then((a) => a.reduce((m, t) => ((m[t.planId] = (m[t.planId] || 0) + 1), m), {})),
    [],
    {}
  )

  return (
    <>
      <div className="page-title">
        <h2>Планы недели</h2>
        <button className="ghost small" onClick={() => setWs(shiftWeek(ws, -1))} aria-label="Предыдущая неделя">◀</button>
        <strong>{weekLabel(ws)}</strong>
        <button className="ghost small" onClick={() => setWs(shiftWeek(ws, 1))} aria-label="Следующая неделя">▶</button>
        {ws !== current && <button className="ghost small" onClick={() => setWs(current)}>Текущая неделя</button>}
        <span className="spacer" />
        <button className="ghost small" onClick={() => go('plan', { weekStart: ws })}>Все планы →</button>
      </div>

      <div className="plan-cards">
        {plans.map((p) => {
          const items = p.checklist || []
          const done = items.filter((x) => x.done).length
          const bias = RESULT[p.result]
          return (
            <button key={p.id} className="plan-card" onClick={() => go('plan', { weekStart: ws, planId: p.id })}>
              <div className="plan-card-head">
                <span className="sym">{p.symbol && <SymbolIcon symbol={p.symbol} size={26} />}{p.symbol || 'Общий план'}</span>
                {bias && <span className={'badge ' + bias[1]}>{bias[0]}</span>}
              </div>
              <div className="pc-stats">
                <Stat n={counts[p.id] || 0} label="Trades" />
                <Stat n={(p.updates || []).length} label="Updates" />
                {items.length > 0 && <Stat n={`${done}/${items.length}`} label="Чек-лист" muted={done === 0} />}
              </div>
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
