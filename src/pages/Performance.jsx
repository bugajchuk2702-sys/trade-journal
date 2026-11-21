import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uuid } from '../db.js'
import { byOpenedDesc, calcTrade, fmt, hasResult, isMissed, summarize } from '../stats.js'
import TradeCounts from '../components/TradeCounts.jsx'
import { iso, weekLabel } from '../week.js'
import { SymbolIcon } from '../components/Symbols.jsx'
import DateInput from '../components/DateInput.jsx'
import AnimNum from '../AnimNum.jsx'
import { ResultPill } from './Trades.jsx'
import { useAccounts } from './data/accounts.js'
import { overviewOf } from './data/overview.js'
import { sign, signed } from './data/ui.jsx'

// Performance: итоги за период — сводка, планы, ошибки/заметки и сделки
const MODES = [['week', 'Неделя'], ['month', 'Месяц'], ['quarter', 'Квартал'], ['custom', 'Свой']]
const LOG_KEY = 'perfLog'

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

function rangeOf(mode, anchor, custom) {
  const a = dayStart(anchor)
  if (mode === 'week') {
    const s = new Date(a); s.setDate(a.getDate() - ((a.getDay() + 6) % 7))
    const e = new Date(s); e.setDate(s.getDate() + 7)
    return [s, e]
  }
  if (mode === 'month') return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 1)]
  if (mode === 'quarter') { const q = Math.floor(a.getMonth() / 3) * 3; return [new Date(a.getFullYear(), q, 1), new Date(a.getFullYear(), q + 3, 1)] }
  const s = custom.from ? fromIso(custom.from) : a
  const e = custom.to ? fromIso(custom.to) : s
  const [lo, hi] = s <= e ? [s, e] : [e, s]
  const end = new Date(hi); end.setDate(hi.getDate() + 1)
  return [lo, end]
}

function shift(mode, anchor, n) {
  const x = new Date(anchor)
  if (mode === 'week') x.setDate(x.getDate() + 7 * n)
  else if (mode === 'month') x.setMonth(x.getMonth() + n, 1)
  else x.setMonth(x.getMonth() + 3 * n, 1)
  return x
}

// Номер недели по ISO (как в «Неделя 47 · 2026»)
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return [Math.ceil(((t - y0) / 864e5 + 1) / 7), t.getUTCFullYear()]
}

function labelOf(mode, from, to) {
  if (mode === 'week') { const [w, y] = isoWeek(from); return `Неделя ${w} · ${y}` }
  if (mode === 'month') return from.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '').replace(/^./, (c) => c.toUpperCase())
  if (mode === 'quarter') return `Q${Math.floor(from.getMonth() / 3) + 1} · ${from.getFullYear()}`
  const last = new Date(to); last.setDate(to.getDate() - 1)
  const f = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${f(from)} – ${f(last)}`
}

const ago = (ms) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

// Ошибки и заметки периода: хранятся в базе одним списком, к периоду относятся по дате записи
function Log({ from, to }) {
  const row = useLiveQuery(() => db.meta.get(LOG_KEY), [], undefined)
  const all = row?.value || []
  const [drafts, setDrafts] = useState({ error: '', note: '' })
  const mine = all.filter((x) => x.at >= from.getTime() && x.at < to.getTime()).sort((a, b) => b.at - a.at)
  const save = (v) => db.meta.put({ key: LOG_KEY, value: v })

  // Смотрим прошлый период — запись ставится в его начало, чтобы она осталась в нём
  const stamp = () => { const n = Date.now(); return n >= from.getTime() && n < to.getTime() ? n : from.getTime() + 12 * 36e5 }
  const add = (kind) => {
    const text = drafts[kind].trim()
    if (!text) return
    save([...all, { id: uuid(), kind, text, at: stamp() }])
    setDrafts({ ...drafts, [kind]: '' })
  }
  const kinds = [['error', 'Ошибки', 'Новая ошибка…', 'Добавить ошибку'], ['note', 'Заметки', 'Новая заметка…', 'Добавить заметку']]
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Ошибки и заметки</h2>
      <div className="perf-logs">
      {kinds.map(([kind, title, ph, btn]) => {
        const items = mine.filter((x) => x.kind === kind)
        return (
          <div className="perf-log" key={kind}>
            <div className="perf-log-title">{title}</div>
            {items.length === 0 ? <div className="subtle">—</div> : (
              <ul className="perf-items">
                {items.map((x) => (
                  <li key={x.id}>
                    <span className="perf-date">{ago(x.at)}</span>
                    <span className="perf-text">{x.text}</span>
                    <button type="button" className="pdel" aria-label="Удалить" title="Удалить" onClick={() => save(all.filter((y) => y.id !== x.id))}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="perf-add">
              <input
                value={drafts[kind]}
                placeholder={ph}
                onChange={(e) => setDrafts({ ...drafts, [kind]: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(kind) } }}
              />
              <button type="button" className="ghost small" disabled={!drafts[kind].trim()} onClick={() => add(kind)}>{btn}</button>
            </div>
          </div>
        )
      })}
      </div>
    </section>
  )
}

export default function Performance({ go }) {
  const [mode, setMode] = useState('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [custom, setCustom] = useState(() => { const t = new Date(); const a = new Date(t); a.setDate(t.getDate() - 29); return { from: iso(a), to: iso(t) } })
  const [acc, setAcc] = useState('')
  const { list } = useAccounts()

  const all = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray().then((a) => a.sort(byOpenedDesc)), [], [])
  const plans = useLiveQuery(() => db.plans.filter((p) => !p.deleted).toArray(), [], [])

  const [from, to] = rangeOf(mode, anchor, custom)
  const [curFrom] = rangeOf(mode, new Date(), custom)
  const isCurrent = from.getTime() === curFrom.getTime()

  const names = useMemo(() => {
    const set = new Set(list.filter((a) => !a.archived).map((a) => a.name))
    for (const t of all) if (t.account) set.add(t.account)
    return [...set]
  }, [list, all])

  const inPeriod = useMemo(
    () => all.filter((t) => t.openedAt >= from.getTime() && t.openedAt < to.getTime() && (!acc || t.account === acc)),
    [all, acc, from.getTime(), to.getTime()] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const counted = useMemo(() => inPeriod.filter((t) => !isMissed(t)), [inPeriod])
  const overview = useMemo(() => overviewOf(counted), [counted])

  // План относится к периоду, если его неделя (пн–вс) пересекается с периодом
  const periodPlans = useMemo(() => {
    const lo = new Date(from); lo.setDate(lo.getDate() - 6)
    return plans
      .filter((p) => { const w = fromIso(p.weekStart); return w >= lo && w < to })
      .sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : (a.createdAt || 0) - (b.createdAt || 0)))
  }, [plans, from.getTime(), to.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  // Итоги по каждому плану: его сделки (с учётом выбранного счёта), без привязки к периоду
  const planStats = useMemo(() => {
    const out = {}
    for (const p of periodPlans) {
      const own = all.filter((t) => t.planId === p.id && (!acc || t.account === acc))
      const sm = summarize(own)
      const rs = own.filter((t) => !isMissed(t)).map(calcTrade).filter((c) => c.closed && c.r != null)
      out[p.id] = { sm, rr: rs.length ? rs.reduce((x, c) => x + c.r, 0) : null }
    }
    return out
  }, [periodPlans, all, acc])

  return (
    <>
      <div className="page-title"><h2>Performance</h2></div>

      <section className="card">
        <div className="toolbar">
          <div className="chips period-chips">
            {MODES.map(([k, label]) => (
              <button key={k} type="button" className={'chip' + (mode === k ? ' active' : '')} onClick={() => { setMode(k); setAnchor(new Date()) }}>{label}</button>
            ))}
          </div>
          {mode === 'custom' ? (
            <div className="period-nav">
              <DateInput value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} aria-label="С даты" />
              <span className="subtle">—</span>
              <DateInput value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} aria-label="По дату" />
            </div>
          ) : (
            <div className="period-nav">
              <button type="button" className="ghost small" onClick={() => setAnchor(shift(mode, anchor, -1))} aria-label="Предыдущий период">◀</button>
              <strong>{labelOf(mode, from, to)}</strong>
              <button type="button" className="ghost small" onClick={() => setAnchor(shift(mode, anchor, 1))} aria-label="Следующий период">▶</button>
              {!isCurrent && <button type="button" className="ghost small" onClick={() => setAnchor(new Date())}>Сейчас</button>}
            </div>
          )}
        </div>
        {names.length > 0 && (
          <div className="chips mt-chips" style={{ marginTop: 14, marginBottom: 0 }}>
            <button type="button" className={'chip' + (acc === '' ? ' active' : '')} onClick={() => setAcc('')}>Все счета</button>
            {names.map((n) => (
              <button key={n} type="button" className={'chip' + (acc === n ? ' active' : '')} onClick={() => setAcc(n)}>{n}</button>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        {counted.length === 0 ? (
          <div className="empty">Нет сделок за этот период</div>
        ) : (
          <div className="recap-metrics acc-overview mt-overview" style={{ marginBottom: 0 }}>
            {overview.map(([label, value, cls]) => (
              <div className="m" key={label}>
                <div className="l">{label}</div>
                <div className={'v ' + cls}><AnimNum value={value} /></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Планы за период</h2>
        {periodPlans.length === 0 ? <div className="subtle">Планов за этот период нет</div> : (
          <ul className="perf-plans">
            {periodPlans.map((p) => (
              <li key={p.id}>
                <button type="button" className="perf-plan" onClick={() => go('plan', { weekStart: p.weekStart, planId: p.id })}>
                  {p.symbol && <SymbolIcon symbol={p.symbol} size={18} />}
                  <span className="perf-plan-name">{p.symbol || 'Общий план'}</span>
                  <span className="subtle perf-plan-week">{weekLabel(p.weekStart).replace(/ \d{4}$/, '')}</span>
                  {(() => {
                    const { sm, rr } = planStats[p.id]
                    return (
                      <>
                        <TradeCounts total={sm.total} win={sm.winCount} loss={sm.lossCount} be={sm.beCount} open={sm.open} missed={sm.missed} />
                        <span className={'perf-plan-n ' + sign(sm.pctTotal)} title="Net %">{sm.pctTotal == null ? '—' : signed(sm.pctTotal, 2, '%')}</span>
                        <span className={'perf-plan-n ' + sign(rr)} title="RR">{rr == null ? '—' : signed(rr, 2) + ' RR'}</span>
                      </>
                    )
                  })()}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Сделки за период</h2>
        {inPeriod.length === 0 ? <div className="empty">Нет сделок за этот период</div> : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th className="left">Дата</th><th className="left">Инструмент</th><th className="left">Сторона</th><th className="left">Result</th><th>PnL</th><th>Net</th><th>R</th></tr>
              </thead>
              <tbody>
                {inPeriod.map((t) => {
                  const c = calcTrade(t)
                  return (
                    <tr key={t.id} className={'perf-row' + (c.res === 'missed' ? ' is-missed' : '')} onClick={() => go('trades', { tradeId: t.id })}>
                      <td className="left">{new Date(t.openedAt).toLocaleDateString('ru-RU', { dateStyle: 'short' })}</td>
                      <td className="left"><span className="symcell"><SymbolIcon symbol={t.symbol} size={20} />{t.symbol || <span className="subtle">Не выбран</span>}</span></td>
                      <td className={'left ' + t.side}>{t.side === 'long' ? 'Лонг' : 'Шорт'}</td>
                      <td className="left">{hasResult(t) ? <ResultPill c={c} /> : <span className="subtle">—</span>}</td>
                      <td className={sign(c.pnl)}>{c.closed ? fmt(c.pnl) + ' $' : '—'}</td>
                      <td className={sign(c.netPct)}>{c.netPct == null ? '—' : signed(c.netPct, 2, '%')}</td>
                      <td className={sign(c.r)}>{c.r == null ? '—' : fmt(c.r)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Log from={from} to={to} />
    </>
  )
}
