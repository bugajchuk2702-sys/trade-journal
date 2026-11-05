import React, { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPlan, savePlan, removePlan, uuid } from '../db.js'
import { mondayOf, shiftWeek, weekLabel } from '../week.js'

const FIELDS = ['symbol', 'bias', 'focus', 'levels', 'rules', 'goals', 'review', 'checklist']
const blank = { symbol: '', bias: '', focus: '', levels: '', rules: '', goals: '', review: '', checklist: [] }
const pick = (p) => Object.fromEntries(FIELDS.map((k) => [k, p[k] ?? blank[k]]))

function PlanEditor({ plan, onDelete }) {
  const [p, setP] = useState(() => pick(plan))
  const [newItem, setNewItem] = useState('')
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

  const text = (key) => ({ value: p[key], onChange: (e) => update({ [key]: e.target.value }) })

  const addItem = () => {
    const t = newItem.trim()
    if (!t) return
    update({ checklist: [...p.checklist, { id: uuid(), text: t, done: false }] })
    setNewItem('')
  }

  const done = p.checklist.filter((x) => x.done).length

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

      <div className="grid2">
        <section className="card">
          <h2>Фокус недели / идея</h2>
          <textarea {...text('focus')} placeholder="Что главное по этому инструменту на неделю? Какой взгляд?" />
        </section>
        <section className="card">
          <h2>Ключевые уровни и сценарии</h2>
          <textarea {...text('levels')} placeholder="Уровни, зоны, если/то сценарии" />
        </section>
        <section className="card">
          <h2>Правила</h2>
          <textarea {...text('rules')} placeholder="Чего не делаю, лимиты на сделки и убыток" />
        </section>
        <section className="card">
          <h2>Цели</h2>
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
          <textarea {...text('review')} placeholder="Что получилось, какие ошибки, выводы" />
        </section>
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
