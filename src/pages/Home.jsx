import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { mondayOf, shiftWeek, weekLabel } from '../week.js'
import Dashboard from '../components/Dashboard.jsx'
import { SymbolIcon } from '../components/Symbols.jsx'
import TradeCounts from '../components/TradeCounts.jsx'
import { calcTrade, isMissed } from '../stats.js'

// Итог недели по инструменту (второй элемент — цвет значка)
// Narrative Result плана: отработал / не отработал (класс — цвет бейджа)
const NARRATIVE = { worked: ['Отработал', 'profit'], failed: ['Не отработал', 'loss'] }
const RESULT = { profit: ['Прибыльная', 'profit'], loss: ['Убыточная', 'loss'], be: ['Безубыточная', 'be'] }

// Главная: сверху планы текущей недели по инструментам, ниже метрики и кривая капитала
export default function Home({ go }) {
  const current = mondayOf()
  const [ws, setWs] = useState(current)
  const plans = useLiveQuery(
    () => db.plans.where('weekStart').equals(ws).and((p) => !p.deleted).sortBy('createdAt'),
    [ws],
    []
  )

  // Сделки каждого плана: всего, прибыльные, убыточные, безубыток, открытые
  const stats = useLiveQuery(
    () =>
      db.trades
        .filter((t) => !t.deleted && t.planId && !isMissed(t))
        .toArray()
        .then((a) =>
          a.reduce((m, t) => {
            const c = calcTrade(t)
            const x = (m[t.planId] ||= { total: 0, win: 0, loss: 0, be: 0, open: 0 })
            x.total += 1
            if (!c.closed) x.open += 1
            else if (c.res === 'win') x.win += 1
            else if (c.res === 'loss') x.loss += 1
            else x.be += 1
            return m
          }, {})
        ),
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
          const bias = RESULT[p.result]
          const narr = NARRATIVE[p.narrative]
          return (
            <button key={p.id} className="plan-card" onClick={() => go('plan', { weekStart: ws, planId: p.id })}>
              <div className="plan-card-head">
                <span className="sym">{p.symbol && <SymbolIcon symbol={p.symbol} size={26} />}{p.symbol || 'Общий план'}</span>
                {bias && (
                  <span className="pc-badge">
                    <span className="pc-cap">Weekly Result</span>
                    <span className={'badge ' + bias[1]}>{bias[0]}</span>
                  </span>
                )}
              </div>
              <div className="pc-foot">
                <TradeCounts compact {...(stats[p.id] || {})} />
                {narr && (
                  <span className="pc-badge">
                    <span className="pc-cap">Narrative Result</span>
                    <span className={'badge ' + narr[1]}>{narr[0]}</span>
                  </span>
                )}
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
