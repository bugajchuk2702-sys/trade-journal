import React, { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPlan, savePlan, removePlan } from '../db.js'
import { mondayOf, shiftWeek, weekLabel } from '../week.js'
import ShotCard from '../components/ShotCard.jsx'

// Поля плана. Старые поля (focus, levels, rules, goals, review, checklist)
// остаются в базе нетронутыми, просто не показываются на странице.
const FIELDS = [
  'symbol', 'bias',
  'w1Img', 'w1Text', 'd1Img', 'd1Text', 'h4Img', 'h4Text',
  'beforeImg', 'beforeText', 'afterImg', 'afterText',
]
const blank = Object.fromEntries(FIELDS.map((k) => [k, '']))
const pick = (p) => Object.fromEntries(FIELDS.map((k) => [k, p[k] ?? blank[k]]))

function PlanEditor({ plan, onDelete }) {
  const [p, setP] = useState(() => pick(plan))
  const latest = useRef(p)
  const timer = useRef(null)

  // При смене плана / уходе со страницы не теряем несохранённые правки
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
        savePlan(plan.id, latest.current)
      }
    },
    [plan.id]
  )

  const update = (patch) => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setP(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      savePlan(plan.id, next)
    }, 500)
  }

  // Пропсы для карточки: ключ-префикс (w1, d1, h4, before, after)
  const shot = (key) => ({
    img: p[key + 'Img'],
    text: p[key + 'Text'],
    onImg: (v) => update({ [key + 'Img']: v }),
    onText: (v) => update({ [key + 'Text']: v }),
  })

  return (
    <>
      <div className="toolbar">
        <input
          style={{ maxWidth: 260, fontWeight: 700, fontSize: 16 }}
          value={p.symbol}
          onChange={(e) => update({ symbol: e.target.value.toUpperCase() })}
          placeholder="Инструмент: BTCUSDT, EUR/USD…"
        />
        <select style={{ maxWidth: 200 }} value={p.bias} onChange={(e) => update({ bias: e.target.value })}>
          <option value="">Без направления</option>
          <option value="long">Лонг</option>
          <option value="short">Шорт</option>
          <option value="neutral">Нейтрально</option>
        </select>
        <span className="spacer" />
        <button className="danger" onClick={() => confirm('Удалить этот план?') && onDelete()}>Удалить план</button>
      </div>

      <h3 className="section-title">Pre-Session</h3>
      <div className="row3">
        <ShotCard title="W1" {...shot('w1')} placeholder="Недельный график: структура, ключевые уровни, контекст" />
        <ShotCard title="D1" {...shot('d1')} placeholder="Дневной график: структура, зоны, куда идёт цена" />
        <ShotCard title="H4" {...shot('h4')} placeholder="H4: ближайшие уровни, где ищу вход" />
      </div>

      <h3 className="section-title">Plan</h3>
      <div className="row2">
        <ShotCard title="До" {...shot('before')} placeholder="План до сессии: сценарии, вход, стоп, цель" />
        <ShotCard title="После" {...shot('after')} placeholder="Что произошло на самом деле, выводы" />
      </div>
    </>
  )
}

export default function WeeklyPlan({ params = {} }) {
  const [ws, setWs] = useState(params.weekStart || mondayOf())
  const [selId, setSelId] = useState(params.planId || null)
  const [adding, setAdding] = useState(!!params.create)
  const [newSym, setNewSym] = useState('')
  const current = mondayOf()

  const plans = useLiveQuery(
    () => db.plans.where('weekStart').equals(ws).and((p) => !p.deleted).sortBy('createdAt'),
    [ws],
    []
  )
  const selected = plans.find((p) => p.id === selId) || plans[0] || null
  const showForm = adding || plans.length === 0

  const changeWeek = (next) => {
    setWs(next)
    setSelId(null)
    setAdding(false)
  }

  const create = async (e) => {
    e?.preventDefault()
    const s = newSym.trim().toUpperCase()
    if (!s) return
    const plan = await createPlan(ws, s)
    setSelId(plan.id)
    setNewSym('')
    setAdding(false)
  }

  return (
    <>
      <div className="page-title">
        <h2>Weekly Plan</h2>
        <button className="ghost small" onClick={() => changeWeek(shiftWeek(ws, -1))}>◀</button>
        <strong>{weekLabel(ws)}</strong>
        <button className="ghost small" onClick={() => changeWeek(shiftWeek(ws, 1))}>▶</button>
        {ws !== current && <button className="ghost small" onClick={() => changeWeek(current)}>Текущая неделя</button>}
        <span className="hint">сохраняется автоматически</span>
      </div>

      <div className="chips">
        {plans.map((p) => (
          <button
            key={p.id}
            className={'chip' + (selected && p.id === selected.id && !adding ? ' active' : '')}
            onClick={() => {
              setSelId(p.id)
              setAdding(false)
            }}
          >
            {p.symbol || 'Общий'}
          </button>
        ))}
        {plans.length > 0 && !adding && (
          <button className="chip add" onClick={() => setAdding(true)}>+ Новый план</button>
        )}
      </div>

      {showForm && (
        <form className="card newplan" onSubmit={create}>
          <h2>{plans.length === 0 ? 'План на эту неделю ещё не создан' : 'Новый план'}</h2>
          <div className="addrow">
            <input
              autoFocus
              value={newSym}
              onChange={(e) => setNewSym(e.target.value)}
              placeholder="Инструмент: BTCUSDT, EUR/USD, золото…"
            />
            <button type="submit">Создать план</button>
            {adding && plans.length > 0 && (
              <button type="button" className="ghost" onClick={() => setAdding(false)}>Отмена</button>
            )}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>Для каждого инструмента на неделю — отдельный план. Они появятся карточками на главной.</div>
        </form>
      )}

      {selected && !adding && (
        <PlanEditor
          key={selected.id}
          plan={selected}
          onDelete={async () => {
            await removePlan(selected.id)
            setSelId(null)
          }}
        />
      )}
    </>
  )
}
