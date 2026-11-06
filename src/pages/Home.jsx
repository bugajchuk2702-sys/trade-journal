import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { mondayOf, shiftWeek, weekLabel } from '../week.js'
import Dashboard from '../components/Dashboard.jsx'
import { SymbolIcon } from '../components/Symbols.jsx'

// Итог недели по инструменту (второй элемент — цвет значка)
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
          // Заметка с карточки: сначала самое свежее обновление, потом старые текстовые поля
          const text = [p.updates?.[0]?.text, p.beforeText, p.h4Text, p.d1Text, p.w1Text, p.focus, p.levels]
            .map((s) => (s || '').trim())
            .find(Boolean)
          return (
            <button key={p.id} className="plan-card" onClick={() => go('plan', { weekStart: ws, planId: p.id })}>
              <div className="plan-card-head">
                <span className="sym">{p.symbol && <SymbolIcon symbol={p.symbol} size={26} />}{p.symbol || 'Общий план'}</span>
                {bias && <span className={'badge ' + bias[1]}>{bias[0]}</span>}
              </div>
              <div className="ex">{text || 'Заметок пока нет'}</div>
              {items.length > 0 && <div className="hint">Чек-лист: {done}/{items.length}</div>}
              {(p.updates || []).length > 0 && <div className="hint">Updates: {p.updates.length}</div>}
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
