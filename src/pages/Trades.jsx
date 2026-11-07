import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addTrade, updateTrade, removeTrade, exportJson, importJson } from '../db.js'
import { calcTrade, fmt, hasResult } from '../stats.js'
import { SymbolInput, SymbolIcon } from '../components/Symbols.jsx'
import { weekLabel } from '../week.js'
import ShotCard from '../components/ShotCard.jsx'
import AutoTextarea from '../components/AutoTextarea.jsx'
import ParamsBlock, { StylePicker, AccountPicker, PlanPicker } from '../components/Params.jsx'

// Дата в формате YYYY-MM-DD по местному времени (для <input type="date">)
export const toLocalDate = (ts) => {
  const d = new Date(ts)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}
// Выбранный день -> метка времени (полдень по местному времени, чтобы день не «съезжал»)
const dateToMs = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

export const emptyForm = () => ({
  symbol: '',
  side: 'long',
  openedAt: toLocalDate(Date.now()),
  closedAt: '',
  planId: '',
  style: '',
  account: '',
  accountSize: '',
  riskPct: '',
  pnlUsd: '',
  params: {},
  w1: '',
  d1: '',
  h4: '',
  resultImg: '',
  conclusion: '',
})

const sign = (n) => (n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

// Данные сделки из базы -> значения полей формы
export const tradeToForm = (t) => ({
  ...emptyForm(),
  ...t,
  openedAt: toLocalDate(t.openedAt),
  closedAt: t.closedAt ? toLocalDate(t.closedAt) : '',
  // исходные метки времени: если день не меняли, сохраняем их как есть (порядок сделок не собьётся)
  openedTs: t.openedAt,
  closedTs: t.closedAt || null,
})

const signed = (n, d = 2, suffix = '') => (n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + fmt(n, d) + suffix)

// Данные формы -> запись сделки в базе
const formToTrade = (f, hidePlan) => ({
  symbol: f.symbol.trim().toUpperCase(),
  side: f.side,
  openedAt: f.openedAt
    ? (f.openedTs && toLocalDate(f.openedTs) === f.openedAt ? f.openedTs : dateToMs(f.openedAt))
    : Date.now(),
  closedAt: f.closedAt
    ? (f.closedTs && toLocalDate(f.closedTs) === f.closedAt ? f.closedTs : dateToMs(f.closedAt))
    : null,
  ...(hidePlan ? {} : { planId: f.planId || null }),
  style: f.style,
  account: f.account,
  accountSize: f.accountSize,
  riskPct: f.riskPct,
  pnlUsd: f.pnlUsd,
  params: f.params || {},
  w1: f.w1,
  d1: f.d1,
  h4: f.h4,
  resultImg: f.resultImg,
  conclusion: f.conclusion,
})

// Заготовка новой сделки. Запись создаётся сразу, как только нажали «Новая сделка»,
// а дальше форма сама сохраняет каждое изменение — если вкладку закроет или выбьет,
// сделка уже лежит в таблице.
export const newTradeData = (over = {}) => formToTrade({ ...emptyForm(), ...over }, false)

const AUTOSAVE_MS = 500

// Форма сохраняется автоматически: каждое изменение уходит в базу через полсекунды,
// а при закрытии формы несохранённое дописывается сразу.
export function TradeForm({ initial, onSave, onClose, hidePlan }) {
  const [f, setF] = useState(initial || emptyForm())
  const latest = useRef(f)
  const timer = useRef(null)
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  const net = calcTrade({ pnlUsd: f.pnlUsd, accountSize: f.accountSize, riskPct: f.riskPct })

  const flush = () => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    saveRef.current(formToTrade(latest.current, hidePlan))
  }
  // Закрыли форму или ушли со страницы — не теряем последние правки
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (patch) => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setF(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, AUTOSAVE_MS)
  }
  const set = (k) => (e) => upd({ [k]: e.target.value })

  return (
    <form className="trade" onSubmit={(e) => { e.preventDefault(); flush() }}>
      <label className="c4">Инструмент
        <SymbolInput value={f.symbol} onChange={(v) => upd({ symbol: v })} placeholder="Выбери" />
      </label>
      <label className="c4">Направление
        <select value={f.side} onChange={set('side')}>
          <option value="long">Лонг</option>
          <option value="short">Шорт</option>
        </select>
      </label>
      <label className="c4">Открыта
        <input type="date" value={f.openedAt} onChange={set('openedAt')} />
      </label>
      <label className="c4">Закрыта
        <input type="date" value={f.closedAt} onChange={set('closedAt')} />
      </label>
      <div className="c4"><StylePicker value={f.style} onChange={(v) => upd({ style: v })} /></div>
      <div className="c4">
        {hidePlan
          ? <div className="pbox"><span className="plabel">План недели</span><div className="pbtn set" style={{ cursor: 'default' }}><span>Этот план</span></div></div>
          : <PlanPicker value={f.planId} symbol={f.symbol} onChange={(v) => upd({ planId: v })} />}
      </div>

      <div className="wide form-sec">Результат</div>
      <div className="c4"><AccountPicker value={f.account} onChange={(name, size) => upd({ account: name, accountSize: size })} /></div>
      <div className="c4 pair">
        <label>Risk, %
          <input type="text" inputMode="decimal" autoComplete="off" value={f.riskPct} onChange={set('riskPct')} placeholder="0.5" />
        </label>
        <label>PNL, $
          <input type="text" inputMode="decimal" autoComplete="off" value={f.pnlUsd} onChange={set('pnlUsd')} placeholder="0" />
        </label>
      </div>
      <div className="c4 netres">
        <span className="plabel">Net Result</span>
        <div className={'netres-val ' + (net.pnl > 0 ? 'pos' : net.pnl < 0 ? 'neg' : '')}>
          {signed(net.netPct, 2, '%')}
          <i>·</i>
          {net.r == null ? '—' : fmt(net.r, 2) + ' RR'}
        </div>
      </div>

      <ParamsBlock value={f.params} onChange={(v) => upd({ params: v })} />
      <div className="wide form-sec">Скриншоты</div>
      <div className="wide trade-shots">
        <ShotCard title="W1" img={f.w1} onImg={(v) => upd({ w1: v })} />
        <ShotCard title="D1" img={f.d1} onImg={(v) => upd({ d1: v })} />
        <ShotCard title="H4" img={f.h4} onImg={(v) => upd({ h4: v })} />
        <ShotCard title="Result" img={f.resultImg} onImg={(v) => upd({ resultImg: v })} />
      </div>
      <label className="wide">Conclusion
        <AutoTextarea value={f.conclusion} onChange={set('conclusion')} />
      </label>
      <div className="wide" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" onClick={() => { flush(); onClose && onClose() }}>Готово</button>
        <span className="hint">Сохраняется автоматически</span>
      </div>
    </form>
  )
}

// Период для фильтра таблицы: неделя (с понедельника) или месяц
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function periodRange(mode, anchor) {
  const a = startOfDay(anchor)
  if (mode === 'week') {
    const start = new Date(a)
    start.setDate(a.getDate() - ((a.getDay() + 6) % 7))
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    return [start, end]
  }
  const start = new Date(a.getFullYear(), a.getMonth(), 1)
  return [start, new Date(a.getFullYear(), a.getMonth() + 1, 1)]
}
function shiftAnchor(mode, anchor, n) {
  const x = new Date(anchor)
  if (mode === 'week') x.setDate(x.getDate() + 7 * n)
  else x.setMonth(x.getMonth() + n, 1)
  return x
}
function periodLabel(mode, anchor) {
  const [start, end] = periodRange(mode, anchor)
  if (mode === 'month') {
    const m = start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    return m.replace(/\s*г\.$/, '').replace(/^./, (c) => c.toUpperCase())
  }
  const last = new Date(end)
  last.setDate(end.getDate() - 1)
  const f = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return `${f(start)} – ${f(last)} ${last.getFullYear()}`
}

export default function Trades({ params = {}, go }) {
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [newId, setNewId] = useState(null) // id только что созданной сделки (для заголовка формы)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('week') // week | month | all
  const [anchor, setAnchor] = useState(() => new Date())
  const fileRef = useRef(null)

  const plans = useLiveQuery(() => db.plans.filter((p) => !p.deleted).toArray(), [], [])
  const planOf = (t) => plans.find((p) => p.id === t.planId)

  // Пришли из плана по клику на сделку — сразу открываем её на правку
  useEffect(() => {
    if (!params.tradeId) return
    db.trades.get(params.tradeId).then((t) => {
      if (t && !t.deleted) {
        setEditing(t)
        setFormOpen(true)
      }
    })
  }, [params.tradeId])

  const trades = useLiveQuery(() => db.trades.where('deleted').equals(0).reverse().sortBy('openedAt'), [], [])

  const [from, to] = mode === 'all' ? [null, null] : periodRange(mode, anchor)
  const inPeriod = useMemo(
    () => (mode === 'all' ? trades : trades.filter((t) => t.openedAt >= from.getTime() && t.openedAt < to.getTime())),
    [trades, mode, anchor] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return inPeriod
    return inPeriod.filter((t) => `${t.symbol} ${t.conclusion || t.notes || ''}`.toLowerCase().includes(q))
  }, [inPeriod, query])

  const [curFrom] = mode === 'all' ? [null] : periodRange(mode, new Date())
  const isCurrent = mode === 'all' || (from && curFrom && from.getTime() === curFrom.getTime())

  // Колонки PnL / R нужны только для старых сделок, где ещё были цены
  const hasNums = filtered.some(hasResult)

  const closeForm = () => { setFormOpen(false); setEditing(null); setNewId(null) }
  // Сделка создаётся сразу и появляется в таблице — даже пустая; дальше правки сохраняются сами
  const openNew = async () => {
    const t = await addTrade(newTradeData())
    setEditing(t)
    setNewId(t.id)
    setFormOpen(true)
  }
  const openEdit = (t) => {
    setEditing(t)
    setNewId(null)
    setFormOpen(true)
    document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const doExport = async () => {
    const blob = new Blob([await exportJson()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `trade-journal-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const doImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const n = await importJson(await file.text())
      alert(`Импортировано записей: ${n}`)
    } catch (err) {
      alert('Ошибка импорта: ' + err.message)
    }
    e.target.value = ''
  }

  return (
    <>
      <div className="page-title">
        <h2>Trades</h2>
        <span className="spacer" />
        {params.back && go && !formOpen && (
          <button type="button" className="ghost" onClick={() => go('plan', params.back)}>← К плану</button>
        )}
        {formOpen
          ? <button type="button" className="ghost" onClick={closeForm}>Закрыть</button>
          : <button type="button" onClick={openNew}>+ Новая сделка</button>}
      </div>

      {formOpen && editing && (
        <section className="card">
          <div className="shot-head">
            <h2>{editing.id === newId ? 'Новая сделка' : 'Редактировать сделку'}</h2>
            <span className="spacer" />
            {params.back && go && (
              <button type="button" className="ghost small" onClick={() => go('plan', params.back)}>← К плану</button>
            )}
          </div>
          <TradeForm
            key={editing.id}
            initial={tradeToForm(editing)}
            onSave={(d) => updateTrade(editing.id, d)}
            onClose={closeForm}
          />
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>Сделки</h2>
          <div className="chips period-chips">
            {[['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Все']].map(([k, label]) => (
              <button key={k} type="button" className={'chip' + (mode === k ? ' active' : '')} onClick={() => { setMode(k); setAnchor(new Date()) }}>{label}</button>
            ))}
          </div>
          {mode !== 'all' && (
            <div className="period-nav">
              <button type="button" className="ghost small" onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))} aria-label="Назад">◀</button>
              <strong>{periodLabel(mode, anchor)}</strong>
              <button type="button" className="ghost small" onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))} aria-label="Вперёд">▶</button>
              {!isCurrent && <button type="button" className="ghost small" onClick={() => setAnchor(new Date())}>{mode === 'week' ? 'Текущая неделя' : 'Текущий месяц'}</button>}
            </div>
          )}
          <span className="spacer" />
          <button type="button" className="ghost small" onClick={doExport}>Экспорт JSON</button>
          <button type="button" className="ghost small" onClick={() => fileRef.current?.click()}>Импорт JSON</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={doImport} />
        </div>
        <div className="toolbar">
          <input placeholder="Поиск: тикер, заключение" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div className="empty">{trades.length === 0 ? 'Пока нет сделок' : mode === 'all' || query ? 'Ничего не найдено' : 'За этот период сделок нет'}</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th className="left">Дата</th>
                  <th className="left">Инструмент</th>
                  <th className="left">Сторона</th>
                  <th className="left">План</th>
                  {hasNums && <th>PnL</th>}
                  {hasNums && <th>Net</th>}
                  {hasNums && <th>R</th>}
                  <th className="left">Скриншоты</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const c = calcTrade(t)
                  return (
                    <tr key={t.id} title={t.conclusion || t.notes || ''}>
                      <td className="left">{new Date(t.openedAt).toLocaleDateString('ru-RU', { dateStyle: 'short' })}</td>
                      <td className="left"><span className="symcell"><SymbolIcon symbol={t.symbol} size={20} />{t.symbol || <span className="subtle">Не выбран</span>}</span></td>
                      <td className={'left ' + t.side}>{t.side === 'long' ? 'Лонг' : 'Шорт'}</td>
                      <td className="left">{planOf(t) ? <span className="tag">{planOf(t).symbol} · {weekLabel(planOf(t).weekStart).replace(/ \d{4}$/, '')}</span> : <span className="subtle">—</span>}</td>
                      {hasNums && <td className={sign(c.pnl)}>{c.closed ? fmt(c.pnl) : '—'}</td>}
                      {hasNums && <td className={sign(c.netPct)}>{c.netPct == null ? '—' : signed(c.netPct, 2, '%')}</td>}
                      {hasNums && <td className={sign(c.r)}>{fmt(c.r)}</td>}
                      <td className="left">
                        {[['W1', t.w1], ['D1', t.d1], ['H4', t.h4], ['Result', t.resultImg]].filter(([, v]) => v).map(([k]) => (
                          <span className="tag" key={k}>{k}</span>
                        ))}
                      </td>
                      <td>
                        <button className="ghost small" onClick={() => openEdit(t)}>Изм.</button>{' '}
                        <button className="danger small" onClick={() => confirm('Удалить сделку?') && removeTrade(t.id)}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
