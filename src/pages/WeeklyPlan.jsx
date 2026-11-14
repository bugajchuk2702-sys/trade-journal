import React, { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPlan, savePlan, removePlan, addTrade, updateTrade, uuid } from '../db.js'
import { calcTrade, fmt, hasResult } from '../stats.js'
import { newTradeData, tradeToForm } from './Trades.jsx'
import TradeModal from '../components/TradeModal.jsx'
import { mondayOf, shiftWeek, weekLabel } from '../week.js'
import ShotCard from '../components/ShotCard.jsx'
import WeeklyRecap from '../components/WeeklyRecap.jsx'
import NotesCard from '../components/NotesCard.jsx'
import NotesLinker from '../components/NotesLinker.jsx'
import { SymbolInput, SymbolIcon, norm } from '../components/Symbols.jsx'

// Поля плана. Старые поля (focus, levels, rules, goals, review, checklist)
// остаются в базе нетронутыми, просто не показываются на странице.
const FIELDS = [
  'symbol', 'result',
  'narrative', // Narrative Result: '' | 'worked' | 'failed'
  'w1Img', 'w1Text', 'd1Img', 'd1Text', 'h4Img', 'h4Text',
  'beforeImg', 'beforeText', 'afterImg', 'afterText',
  'updates', // [{ id, createdAt, img, text }] — карточки, созданные кнопкой Update
  'recapD1Img', // скриншот D1 в блоке Weekly Recap
  'recapH4Img', // скриншот H4 там же
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

const money = (n) => fmt(n, 2).replace(/,00$/, '') + '$'

// Цвет метки инструмента (как теги в Notion)
const TAG_TINT = { BTC: '247,147,26', XAUUSD: '240,180,36', EURUSD: '70,110,220', GBPUSD: '200,70,90', GER40: '230,190,40', JP225: '220,50,60', AUDUSD: '40,120,200', USDCHF: '230,90,70' }

function TradeRow({ t, n, onOpen }) {
  const c = calcTrade(t)
  const hasNums = hasResult(t)
  const res = c.res === 'missed' ? 'missed' : c.closed ? c.res : 'open'
  const label = { open: 'Open', win: 'Win', loss: 'Loss', be: 'BE', missed: 'Missed' }[res]
  const tint = TAG_TINT[norm(t.symbol)]
  return (
    <button type="button" className={'trow' + (res === 'missed' ? ' is-missed' : '')} onClick={() => onOpen(t)} title="Открыть сделку на вкладке Trades">
      <svg className="trow-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M3.5 1.5h6l3 3v10h-9z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M9.5 1.5v3h3M5.5 9.5l1.7-1.7 1.6 1.4 2-2.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="trow-title">Trade #{n}</span>
      <span className="tchip" style={tint ? { '--tint': tint } : undefined}>
        <SymbolIcon symbol={t.symbol} size={14} />
        {t.symbol}
      </span>
      {hasNums && <span className={'tpill ' + res}><i />{label}</span>}
      {hasNums && c.closed && (
        <span className="trow-meta">
          <span className={sign(c.r)}>{c.r == null ? '—' : fmt(c.r, 1) + 'RR'}</span>
          {' / '}
          <span className={sign(c.pnl)}>{c.closed ? money(c.pnl) : '—'}</span>
        </span>
      )}
      <span className="trow-side">{t.side === 'long' ? 'Лонг' : 'Шорт'}</span>
      <span className="trow-date">{new Date(t.openedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
    </button>
  )
}

// Трейды плана — компактный список в стиле Notion
function TradesList({ trades, onAdd, onOpen }) {
  const ordered = [...trades].sort((a, b) => a.openedAt - b.openedAt || (a.createdAt || 0) - (b.createdAt || 0))
  // Пока из плана не добавлено ни одного трейда, блок не показываем
  if (ordered.length === 0) return null
  return (
    <section className="tlist" aria-label="Трейды плана">
      <div className="tlist-head">
        <span>Trades</span>
        <span className="tlist-count">{ordered.length}</span>
        <span className="spacer" />
        <button type="button" className="tlist-add" onClick={onAdd} title="Добавить трейд" aria-label="Добавить трейд">+</button>
      </div>
      {ordered.map((t, i) => <TradeRow key={t.id} t={t} n={i + 1} onOpen={onOpen} />)}
    </section>
  )
}

const sign = (n) => (n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

function PlanEditor({ plan, onDelete, go }) {
  const [p, setP] = useState(() => pick(plan))
  // null — окно закрыто, иначе { trade, isNew }
  const [tradeModal, setTradeModal] = useState(null)
  // Сделка создаётся сразу (и видна в списке плана и в таблице Trades), дальше форма сохраняет правки сама
  const startTrade = async () => {
    const trade = await addTrade(newTradeData({ symbol: latest.current.symbol, planId: plan.id }))
    setTradeModal({ trade, isNew: true })
  }
  const attached = useLiveQuery(
    () => db.trades.filter((t) => t.planId === plan.id && !t.deleted).toArray().then((a) => a.sort((x, y) => y.openedAt - x.openedAt)),
    [plan.id],
    []
  )
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
      <div className="toolbar" style={{ alignItems: 'flex-end' }}>
        <SymbolInput
          style={{ maxWidth: 280 }}
          value={p.symbol}
          onChange={(v) => update({ symbol: v })}
          placeholder="Выбери инструмент"
        />
        <label style={{ width: 200 }}>
          Weekly Result
          <select
            className={'res ' + p.result}
            value={p.result}
            onChange={(e) => update({ result: e.target.value })}
          >
            <option value="">Итог: не выбран</option>
            <option value="profit">Прибыльная</option>
            <option value="loss">Убыточная</option>
            <option value="be">Безубыточная</option>
          </select>
        </label>
        <label style={{ width: 200 }}>
          Narrative Result
          <select
            className={'res ' + ({ worked: 'profit', failed: 'loss' }[p.narrative] || '')}
            value={p.narrative}
            onChange={(e) => update({ narrative: e.target.value })}
          >
            <option value="">Не выбран</option>
            <option value="worked">Отработал</option>
            <option value="failed">Не отработал</option>
          </select>
        </label>
        <span className="spacer" />
        <button onClick={startTrade}>+ Добавить трейд</button>
      </div>

      <TradesList trades={attached} onAdd={startTrade}onOpen={(t) => go('trades', { tradeId: t.id, back: { weekStart: plan.weekStart, planId: plan.id } })} />

      <NotesLinker kind="plan" id={plan.id} go={go} />

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
      </div>
      {p.updates.length === 0 ? null : (
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
        <ShotCard title="H4" {...shot('recapH4')} />
      </div>

      <h3 className="section-title" style={{ marginTop: 22 }}>Weekly Notes</h3>
      <div className="notes-recap">
        <NotesCard
          title="Заметки недели"
          text={p.weekNotes}
          imgs={p.weekNotesImgs}
          onText={(v) => update({ weekNotes: v })}
          onAdd={addNoteImgs}
          onRemoveAt={removeNoteImg}
          placeholder="Любые заметки по неделе"
        />
        <WeeklyRecap symbol={p.symbol} weekStart={plan.weekStart} />
      </div>

      <div className="plan-footer">
        <button className="danger" onClick={() => confirm('Удалить этот план?') && onDelete()}>Удалить план</button>
      </div>

      {tradeModal && (
        <TradeModal
          title={(tradeModal.isNew ? 'Новая сделка' : 'Редактировать сделку') + (p.symbol ? ' · ' + p.symbol : '')}
          initial={tradeToForm(tradeModal.trade)}
          tradeId={tradeModal.trade.id}
          go={go}
          onClose={() => setTradeModal(null)}
          onSave={(d) => updateTrade(tradeModal.trade.id, d)}
        />
      )}
    </>
  )
}

export default function WeeklyPlan({ params = {}, go }) {
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
  // Сколько сделок привязано к каждому плану — показываем на вкладке плана
  const counts = useLiveQuery(
    () => db.trades.filter((t) => !t.deleted && t.planId).toArray().then((a) => a.reduce((m, t) => ((m[t.planId] = (m[t.planId] || 0) + 1), m), {})),
    [],
    {}
  )
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
            {counts[p.id] > 0 && <span className="chip-n" title="Сделок в плане">{counts[p.id]}</span>}
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
          go={go}
          onDelete={async () => {
            await removePlan(selected.id)
            setSelId(null)
          }}
        />
      )}
    </>
  )
}
