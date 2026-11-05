import React, { useEffect, useRef, useState } from 'react'
import { db, savePlan, uuid } from '../db.js'

const iso = (d) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

// Понедельник недели, в которую попадает дата (строка YYYY-MM-DD)
const mondayOf = (date = new Date()) => {
  const x = new Date(date)
  x.setHours(12, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return iso(x)
}

const shiftWeek = (ws, n) => {
  const [y, m, d] = ws.split('-').map(Number)
  return iso(new Date(y, m - 1, d + 7 * n, 12))
}

const weekLabel = (ws) => {
  const [y, m, d] = ws.split('-').map(Number)
  const a = new Date(y, m - 1, d, 12)
  const b = new Date(y, m - 1, d + 6, 12)
  const f = (x) => x.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return `${f(a)} – ${f(b)} ${b.getFullYear()}`
}

const FIELDS = ['focus', 'levels', 'rules', 'goals', 'review', 'checklist']
const pick = (p) => Object.fromEntries(FIELDS.map((k) => [k, p[k]]))
const blank = () => ({ focus: '', levels: '', rules: '', goals: '', review: '', checklist: [] })

function PlanEditor({ ws }) {
  const [p, setP] = useState(null)
  const [newItem, setNewItem] = useState('')
  const latest = useRef(null)
  const timer = useRef(null)

  // Загружаем план этой недели (компонент пересоздаётся при смене недели)
  useEffect(() => {
    let alive = true
    db.plans.get('plan-' + ws).then((r) => {
      if (!alive) return
      const init = { ...blank(), ...(r && !r.deleted ? pick({ ...blank(), ...r }) : {}) }
      latest.current = init
      setP(init)
    })
    return () => {
      alive = false
      // Не теряем несохранённые правки при уходе со страницы
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
        if (latest.current) savePlan(ws, pick(latest.current))
      }
    }
  }, [ws])

  if (!p) return null

  const update = (patch) => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setP(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      savePlan(ws, pick(next))
    }, 500)
  }

  const text = (key) => ({ value: p[key], onChange: (e) => update({ [key]: e.target.value }) })

  const addItem = () => {
    const t = newItem.trim()
    if (!t) return
    update({ checklist: [...p.checklist, { id: uuid(), text: t, done: false }] })
    setNewItem('')
  }

  const done = p.checklist.filter((x) => x.done).length

  return (
    <div className="grid2">
      <section className="card">
        <h2>Фокус недели / bias</h2>
        <textarea {...text('focus')} placeholder="Что главное на этой неделе? Какой взгляд на рынок?" />
      </section>
      <section className="card">
        <h2>Ключевые уровни и сценарии</h2>
        <textarea {...text('levels')} placeholder="Уровни, зоны, если/то сценарии" />
      </section>
      <section className="card">
        <h2>Правила недели</h2>
        <textarea {...text('rules')} placeholder="Чего не делаю, лимиты на сделки и убыток" />
      </section>
      <section className="card">
        <h2>Цели на неделю</h2>
        <textarea {...text('goals')} placeholder="Процессные цели, не только деньги" />
      </section>
      <section className="card">
        <h2>Чек-лист {p.checklist.length > 0 && <span className="hint">({done}/{p.checklist.length})</span>}</h2>
        {p.checklist.map((it) => (
          <div className={'check' + (it.done ? ' done' : '')} key={it.id}>
            <input
              type="checkbox"
              checked={it.done}
              onChange={() => update({ checklist: p.checklist.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)) })}
            />
            <span>{it.text}</span>
            <button className="danger small" onClick={() => update({ checklist: p.checklist.filter((x) => x.id !== it.id) })}>✕</button>
          </div>
        ))}
        <div className="addrow">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Новый пункт, Enter чтобы добавить"
          />
          <button onClick={addItem}>+</button>
        </div>
      </section>
      <section className="card">
        <h2>Итоги недели</h2>
        <textarea {...text('review')} placeholder="Что получилось, какие ошибки, выводы на следующую неделю" />
      </section>
    </div>
  )
}

export default function WeeklyPlan() {
  const [ws, setWs] = useState(() => mondayOf())
  const current = mondayOf()

  return (
    <>
      <div className="page-title">
        <h2>Weekly Plan</h2>
        <button className="ghost small" onClick={() => setWs(shiftWeek(ws, -1))}>◀</button>
        <strong>{weekLabel(ws)}</strong>
        <button className="ghost small" onClick={() => setWs(shiftWeek(ws, 1))}>▶</button>
        {ws !== current && <button className="ghost small" onClick={() => setWs(current)}>Текущая неделя</button>}
        <span className="hint">сохраняется автоматически</span>
      </div>
      <PlanEditor key={ws} ws={ws} />
    </>
  )
}
