import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPlan, savePlan, removePlan, addTrade, updateTrade, uuid } from '../db.js'
import { byOpened, byOpenedDesc, calcTrade, fmt, hasResult } from '../stats.js'
import { newTradeData, tradeToForm } from './Trades.jsx'
import TradeModal from '../components/TradeModal.jsx'
import { mondayOf, weekLabel } from '../week.js'
import { fromIso, labelOf, planInRange, rangeOf, shift } from '../period.js'
import { usePlanStats } from '../planStats.js'
import TradeCounts from '../components/TradeCounts.jsx'
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
  'recapD1Img', // старый блок Weekly Recap (убран с экрана, рекап теперь в Performance); данные остаются в базе
  'recapH4Img',
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
const TAG_TINT = { BTC: '247,147,26', XAUUSD: '240,180,36', EURUSD: '70,110,220', GBPUSD: '200,70,90', GER40: '230,190,40', JP225: '220,50,60' }

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
          <span className={numCls(c, c.r)}>{c.r == null ? '—' : fmt(c.r, 1) + 'RR'}</span>
          {' / '}
          <span className={numCls(c, c.pnl)}>{c.closed ? money(c.pnl) : '—'}</span>
        </span>
      )}
      <span className="trow-side">{t.side === 'long' ? 'Лонг' : 'Шорт'}</span>
      <span className="trow-date">{new Date(t.openedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
    </button>
  )
}

// Трейды плана — компактный список в стиле Notion
function TradesList({ trades, onAdd, onOpen }) {
  const ordered = [...trades].sort(byOpened)
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
// BE — цифры оранжевые, как плашка результата
const numCls = (c, n) => (c && c.closed && c.res === 'be' ? 'be-num' : sign(n))

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
    () => db.trades.filter((t) => t.planId === plan.id && !t.deleted).toArray().then((a) => a.sort(byOpenedDesc)),
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

const PERIODS = [['week', 'Неделя'], ['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год'], ['all', 'Всё']]
const RESULT = { profit: ['Прибыльная', 'profit'], loss: ['Убыточная', 'loss'], be: ['Безубыточная', 'be'] }
const NARRATIVE = { worked: ['Отработал', 'profit'], failed: ['Не отработал', 'loss'] }

// Карточка плана в списке: инструмент, даты недели, итоги
function PlanCard({ plan, st, onOpen }) {
  const res = RESULT[plan.result]
  const narr = NARRATIVE[plan.narrative]
  return (
    <button type="button" className="plan-card pcard" onClick={onOpen}>
      <div className="pcard-top">
        <span className="pcard-ico">{plan.symbol ? <SymbolIcon symbol={plan.symbol} size={30} /> : '··'}</span>
        <span className="pcard-meta">
          <span className="pcard-name">{plan.symbol || 'Общий план'}</span>
        </span>
        <span className="pcard-date">{weekLabel(plan.weekStart).replace(/ \d{4}$/, '').split(' – ').map((d, i) => <span key={i}>{i ? d : d + ' –'}</span>)}</span>
      </div>
      <div className="pcard-badges">
        <span className="pc-badge">
          <span className="pc-cap">Weekly Result</span>
          <span className={'badge ' + (res ? res[1] : '')}>{res ? res[0] : 'Не выбран'}</span>
        </span>
        <span className="pc-badge">
          <span className="pc-cap">Narrative Result</span>
          <span className={'badge ' + (narr ? narr[1] : '')}>{narr ? narr[0] : 'Не выбран'}</span>
        </span>
      </div>
      <div className="pcard-foot">
        <TradeCounts compact {...(st || {})} />
        <span className="spacer" />
        <span className="pcard-open">Открыть →</span>
      </div>
    </button>
  )
}

// Форма создания плана; неделя — та, к которой он добавляется
function NewPlanForm({ week, hasPlans, onCreate, onCancel }) {
  const [sym, setSym] = useState('')
  const submit = (e) => {
    e?.preventDefault()
    const v = sym.trim().toUpperCase()
    if (v) onCreate(v)
  }
  return (
    <form className="card newplan" onSubmit={submit}>
      <h2>{hasPlans ? 'Новый план' : 'План на эту неделю ещё не создан'}</h2>
      <div className="addrow">
        <SymbolInput autoFocus style={{ flex: 1 }} value={sym} onChange={setSym} placeholder="Выбери инструмент" />
        <button type="submit">Создать план</button>
        <button type="button" className="ghost" onClick={onCancel}>Отмена</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>План создаётся на неделю {weekLabel(week)}. Для каждого инструмента на неделю — отдельный план.</div>
    </form>
  )
}

export default function WeeklyPlan({ params = {}, go }) {
  // Страница открывается списком планов; сам план — только по клику (или по ссылке с главной / из сделки)
  const [mode, setMode] = useState('week')
  const [anchor, setAnchor] = useState(() => (params.weekStart ? fromIso(params.weekStart) : new Date()))
  const [openId, setOpenId] = useState(params.planId || null)
  const [addWeek, setAddWeek] = useState(params.create ? params.weekStart || mondayOf() : null)

  const all = useLiveQuery(() => db.plans.filter((p) => !p.deleted).toArray(), [], undefined)
  const stats = usePlanStats()
  const [from, to] = rangeOf(mode, anchor)
  const isCurrent = from.getTime() === rangeOf(mode, new Date())[0].getTime()

  const list = useMemo(
    () =>
      (all || [])
        .filter((p) => planInRange(p.weekStart, from, to))
        .sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : (a.createdAt || 0) - (b.createdAt || 0))),
    [all, from.getTime(), to.getTime()] // eslint-disable-line react-hooks/exhaustive-deps
  )

  if (all === undefined) return null
  const opened = openId ? all.find((p) => p.id === openId) : null
  // Неделя, на которую создаётся новый план: у открытого плана — его неделя, в списке — просматриваемая
  const weekForNew = opened ? opened.weekStart : mode === 'week' ? mondayOf(from) : mondayOf()

  const create = async (symbol) => {
    const plan = await createPlan(addWeek || weekForNew, symbol)
    setAddWeek(null)
    setOpenId(plan.id)
  }
  const newForm = addWeek && (
    <NewPlanForm week={addWeek} hasPlans={all.length > 0} onCreate={create} onCancel={() => setAddWeek(null)} />
  )

  // ----- открытый план -----
  if (opened) {
    const siblings = all.filter((p) => p.weekStart === opened.weekStart).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    return (
      <>
        <div className="page-title">
          <button className="ghost small" onClick={() => { setOpenId(null); setAddWeek(null) }}>← Все планы</button>
          <h2>Weekly Plan</h2>
          <strong>{weekLabel(opened.weekStart)}</strong>
          <span className="hint">сохраняется автоматически</span>
        </div>

        <div className="chips">
          {siblings.map((p) => (
            <button key={p.id} className={'chip' + (p.id === opened.id && !addWeek ? ' active' : '')} onClick={() => { setOpenId(p.id); setAddWeek(null) }}>
              {p.symbol && <SymbolIcon symbol={p.symbol} size={18} />}
              {p.result && <span className={'rdot ' + p.result} />}
              {p.symbol || 'Общий'}
              {stats[p.id]?.total > 0 && <span className="chip-n" title="Сделок в плане">{stats[p.id].total}</span>}
            </button>
          ))}
          {!addWeek && <button className="chip add" onClick={() => setAddWeek(opened.weekStart)}>+ Новый план</button>}
        </div>

        {newForm}

        {!addWeek && (
          <PlanEditor
            key={opened.id}
            plan={opened}
            go={go}
            onDelete={async () => {
              await removePlan(opened.id)
              setOpenId(null)
            }}
          />
        )}
      </>
    )
  }

  // ----- список планов -----
  const move = (n) => setAnchor(shift(mode, anchor, n))
  return (
    <>
      <div className="page-title">
        <h2>Weekly Plan</h2>
        <span className="spacer" />
        <div className="tabs seg" role="tablist" aria-label="Период">
          {PERIODS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} className={'tab' + (mode === k ? ' active' : '')} onClick={() => { setMode(k); setAnchor(new Date()) }}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setAddWeek(weekForNew)}>+ Новый план</button>
      </div>

      {mode !== 'all' && (
        <div className="page-title plan-period">
          <button className="ghost small" onClick={() => move(-1)} aria-label="Предыдущий период">◀</button>
          <strong>{labelOf(mode, from, to)}</strong>
          <button className="ghost small" onClick={() => move(1)} aria-label="Следующий период">▶</button>
          {!isCurrent && <button className="ghost small" onClick={() => setAnchor(new Date())}>Сейчас</button>}
        </div>
      )}

      {newForm}

      {list.length === 0 && !addWeek ? (
        <div className="card empty">
          Планов за этот период нет.
          <div style={{ marginTop: 10 }}><button onClick={() => setAddWeek(weekForNew)}>+ Новый план</button></div>
        </div>
      ) : (
        <div className="plan-cards pcards">
          {list.map((p) => <PlanCard key={p.id} plan={p} st={stats[p.id]} onOpen={() => setOpenId(p.id)} />)}
        </div>
      )}
    </>
  )
}
