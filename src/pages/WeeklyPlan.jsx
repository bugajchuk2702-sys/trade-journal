import React, { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPlan, savePlan, removePlan, uuid } from '../db.js'
import { mondayOf, shiftWeek, weekLabel } from '../week.js'
import ShotCard from '../components/ShotCard.jsx'
import WeeklyRecap from '../components/WeeklyRecap.jsx'
import NotesCard from '../components/NotesCard.jsx'
import { SymbolInput, SymbolIcon } from '../components/Symbols.jsx'

// Поля плана. Старые поля (focus, levels, rules, goals, review, checklist)
// остаются в базе нетронутыми, просто не показываются на странице.
const FIELDS = [
  'symbol', 'result',
  'w1Img', 'w1Text', 'd1Img', 'd1Text', 'h4Img', 'h4Text',
  'beforeImg', 'beforeText', 'afterImg', 'afterText',
  'updates', // [{ id, createdAt, img, text }] — карточки, созданные кнопкой Update
  'recapD1Img', // скриншот D1 в блоке Weekly Recap
  'weekNotes', // «Заметки недели»: текст
  'weekNotesImgs', // скриншоты к заметкам недели (вставляются скрыто, Ctrl+V)
]
const blank = {
  ...Object.fromEntries(FIELDS.map((k) => [k, ''])),
  updates: [],
  weekNotesImgs: [],
}

// Название карточки-обновления: день, в который её создали
const dayTitle = (ts) => {
  const s = new Date(ts).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const timeOf = (ts) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
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

  // Карточки W1, D1, H4, До, После — только скриншот (без текста).
  // Текстовые поля остаются только в карточках Updates.
  const shot = (key) => ({
    img: p[key + 'Img'],
    onImg: (v) => update({ [key + 'Img']: v }),
  })

  // Скриншоты заметок недели. Список берём из latest, чтобы быстрая вставка
  // нескольких картинок подряд не затирала друг друга.
  const addNoteImgs = (urls) => update({ weekNotesImgs: [...latest.current.weekNotesImgs, ...urls] })
  const removeNoteImg = (i) => update({ weekNotesImgs: latest.current.weekNotesImgs.filter((_, j) => j !== i) })

  // Updates: всегда читаем свежий список из latest, чтобы быстрые правки не затирали друг друга
  const addUpdate = () =>
    update({ updates: [{ id: uuid(), createdAt: Date.now(), img: '', text: '' }, ...latest.current.updates] })
  const patchUpdate = (id, patch) =>
    update({ updates: latest.current.updates.map((u) => (u.id === id ? { ...u, ...patch } : u)) })
  const removeUpdate = (id) => update({ updates: latest.current.updates.filter((u) => u.id !== id) })

  return (
    <>
      <div className="toolbar">
        <SymbolInput
          style={{ maxWidth: 280 }}
          value={p.symbol}
          onChange={(v) => update({ symbol: v })}
          placeholder="Выбери инструмент"
        />
        <select
          className={'res ' + p.result}
          style={{ maxWidth: 200 }}
          value={p.result}
          onChange={(e) => update({ result: e.target.value })}
        >
          <option value="">Итог: не выбран</option>
          <option value="profit">Прибыльная</option>
          <option value="loss">Убыточная</option>
          <option value="be">Безубыточная</option>
        </select>
        <span className="spacer" />
        <button className="danger" onClick={() => confirm('Удалить этот план?') && onDelete()}>Удалить план</button>
      </div>

      <h3 className="section-title">Pre-Session</h3>
      <div className="row3">
        <ShotCard title="W1" {...shot('w1')} />
        <ShotCard title="D1" {...shot('d1')} />
        <ShotCard title="H4" {...shot('h4')} />
      </div>

      <h3 className="section-title">Plan</h3>
      <div className="row2">
        <ShotCard title="До" {...shot('before')} />
        <ShotCard title="После" {...shot('after')} />
      </div>

      <div className="section-row">
        <h3 className="section-title">Updates</h3>
        <button onClick={addUpdate}>+ Update</button>
        <span className="hint">карточка создаётся с названием сегодняшнего дня</span>
      </div>
      {p.updates.length === 0 ? (
        <div className="card empty">Обновлений пока нет. Нажми Update, чтобы добавить скриншот и заметку за сегодня.</div>
      ) : (
        <div className="row2">
          {p.updates.map((u) => (
            <ShotCard
              key={u.id}
              title={dayTitle(u.createdAt)}
              subtitle={timeOf(u.createdAt)}
              img={u.img}
              text={u.text}
              onImg={(v) => patchUpdate(u.id, { img: v })}
              onText={(v) => patchUpdate(u.id, { text: v })}
              onRemove={() => confirm('Удалить это обновление?') && removeUpdate(u.id)}
              placeholder="Что изменилось, что видишь сейчас, план на сегодня"
            />
          ))}
        </div>
      )}

      <h3 className="section-title" style={{ marginTop: 22 }}>Weekly Recap</h3>
      <div className="row2">
        <ShotCard title="D1" {...shot('recapD1')} />
        <WeeklyRecap symbol={p.symbol} weekStart={plan.weekStart} />
      </div>

      <h4 className="subhead">Заметки и наблюдения в течение недели:</h4>
      <NotesCard
        title="Заметки недели"
        text={p.weekNotes}
        imgs={p.weekNotesImgs}
        onText={(v) => update({ weekNotes: v })}
        onAdd={addNoteImgs}
        onRemoveAt={removeNoteImg}
        placeholder="Любые заметки по неделе"
      />
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
            {p.symbol && <SymbolIcon symbol={p.symbol} size={18} />}
            {p.result && <span className={'rdot ' + p.result} />}
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
            <SymbolInput
              autoFocus
              style={{ flex: 1 }}
              value={newSym}
              onChange={setNewSym}
              placeholder="Выбери инструмент"
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
