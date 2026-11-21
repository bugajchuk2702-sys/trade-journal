import React, { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uuid } from '../db.js'
import { byOpenedDesc, calcTrade, fmt, hasResult, isMissed, summarize } from '../stats.js'
import TradeCounts from '../components/TradeCounts.jsx'
import RichEditor, { cleanHtml } from '../components/RichEditor.jsx'
import Lightbox from '../components/Lightbox.jsx'
import { iso, weekLabel } from '../week.js'
import { labelOf, planInRange, rangeOf, shift } from '../period.js'
import { SymbolIcon, SymbolInput } from '../components/Symbols.jsx'
import DateInput from '../components/DateInput.jsx'
import AnimNum from '../AnimNum.jsx'
import { ResultPill } from './Trades.jsx'
import { useAccounts } from './data/accounts.js'
import { overviewOf } from './data/overview.js'
import { sign, signed } from './data/ui.jsx'

// Performance: итоги за период — сводка, планы, ошибки/заметки и сделки
const MODES = [['week', 'Неделя'], ['month', 'Месяц'], ['quarter', 'Квартал'], ['custom', 'Свой']]
const LOG_KEY = 'perfLog'
const LIMIT = 5 // сколько планов и сделок видно сразу, остальные сворачиваются

const ago = (ms) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

// Кнопка «Показать ещё / Свернуть» под длинным списком
function More({ total, open, onToggle }) {
  if (total <= LIMIT) return null
  return (
    <button type="button" className="ghost small perf-more" aria-expanded={open} onClick={onToggle}>
      {open ? 'Свернуть' : `Показать ещё ${total - LIMIT}`}
    </button>
  )
}

// Рекап по дням недели: у каждого дня «Общее» и вкладки по парам, в каждой свой текст со скриншотами.
// Хранится в базе по дате: { html — «Общее», pairs: { 'EURUSD': html } }
const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница']
const hasContent = (h) => !!h && (/<img/i.test(h) || h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== '')

function RecapDay({ day, planSyms, value, today }) {
  const [tab, setTab] = useState('') // '' — «Общее», иначе название пары
  const [adding, setAdding] = useState(false)
  const [sym, setSym] = useState('')
  const pairs = value.pairs || {}
  const extra = Object.keys(pairs).filter((x) => !planSyms.includes(x))
  const syms = [...planSyms, ...extra]
  const key = 'recap:' + day.date
  // Всегда читаем свежую запись, чтобы правки разных вкладок не затирали друг друга
  const patch = async (fn) => db.meta.put({ key, value: fn((await db.meta.get(key))?.value || {}) })
  const cur = syms.includes(tab) ? tab : ''
  const html = cur ? pairs[cur] || '' : value.html || ''
  const save = (h) => patch((c) => (cur ? { ...c, pairs: { ...(c.pairs || {}), [cur]: h } } : { ...c, html: h }))
  const addPair = (e) => {
    e?.preventDefault()
    const v = sym.trim().toUpperCase()
    if (!v) return
    if (!syms.includes(v)) patch((c) => ({ ...c, pairs: { ...(c.pairs || {}), [v]: '' } }))
    setTab(v); setSym(''); setAdding(false)
  }
  const removePair = () => {
    if (hasContent(html) && !confirm('Удалить пару ' + cur + ' и её заметки за этот день?')) return
    patch((c) => { const pr = { ...(c.pairs || {}) }; delete pr[cur]; return { ...c, pairs: pr } })
    setTab('')
  }
  return (
    <div className={'card recap-day' + (today ? ' today' : '')}>
      <h3>{day.name} · {day.date}</h3>
      <div className="recap-tabs">
        <button type="button" className={'chip' + (cur === '' ? ' active' : '')} onClick={() => setTab('')}>
          Общее{hasContent(value.html) && cur !== '' && <i className="rc-dot" />}
        </button>
        {syms.map((x) => (
          <button type="button" key={x} className={'chip' + (cur === x ? ' active' : '')} onClick={() => setTab(x)}>
            <SymbolIcon symbol={x} size={16} />{x}{hasContent(pairs[x]) && cur !== x && <i className="rc-dot" />}
          </button>
        ))}
        {!adding && <button type="button" className="chip add" onClick={() => setAdding(true)}>+ Пара</button>}
      </div>
      {adding && (
        <form className="addrow recap-add" onSubmit={addPair}>
          <SymbolInput autoFocus style={{ flex: 1 }} value={sym} onChange={setSym} placeholder="Выбери инструмент" />
          <button type="submit">Добавить</button>
          <button type="button" className="ghost" onClick={() => { setAdding(false); setSym('') }}>Отмена</button>
        </form>
      )}
      <RichEditor
        key={key + '|' + cur}
        value={html}
        placeholder={cur ? `Заметки по ${cur}… вставь скриншот прямо в текст.` : 'Заметки за день… вставь скриншот прямо в текст.'}
        onChange={save}
      />
      {cur && extra.includes(cur) && <button type="button" className="ghost small recap-del" onClick={removePair}>Убрать пару {cur}</button>}
    </div>
  )
}

function Recap({ from }) {
  const rows = useLiveQuery(() => db.meta.where('key').startsWith('recap:').toArray(), [], [])
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value || {}]))
  const weekIso = iso(from)
  // Пары недели — из планов этой недели
  const plans = useLiveQuery(() => db.plans.where('weekStart').equals(weekIso).and((p) => !p.deleted).toArray(), [weekIso], [])
  const planSyms = [...new Set(plans.map((p) => (p.symbol || '').trim()).filter(Boolean))]
  const today = iso(new Date())
  const days = DAYS.map((name, i) => { const d = new Date(from); d.setDate(from.getDate() + i); return { name, date: iso(d) } })
  return (
    <section className="recap">
      <h2 className="section-title">Рекап</h2>
      {days.map((d) => (
        <RecapDay key={d.date} day={d} planSyms={planSyms} value={byKey['recap:' + d.date] || {}} today={d.date === today} />
      ))}
    </section>
  )
}

// Итоги периода (неделя / месяц / квартал): общий рекап и рекомендации на следующий период.
// Рекомендации потом показываются в начале следующего периода.
const NOTE_MODES = new Set(['week', 'month', 'quarter'])
const NEXT_LABEL = { week: 'прошлой недели', month: 'прошлого месяца', quarter: 'прошлого квартала' }
const useHtml = (key) => {
  const row = useLiveQuery(() => db.meta.get(key), [key], undefined)
  return [row?.value?.html || '', (html) => db.meta.put({ key, value: { html } })]
}
const sumKey = (mode, from) => `recapsum:${mode}:${iso(from)}`
const recKey = (mode, from) => `recaprec:${mode}:${iso(from)}`

function PeriodNotes({ mode, from }) {
  const [sum, setSum] = useHtml(sumKey(mode, from))
  const [rec, setRec] = useHtml(recKey(mode, from))
  const k = `${mode}:${iso(from)}`
  return (
    <section className="card">
      <div className="recap-fields">
      <div className="recap-field">
        <div className="perf-log-title">Общий рекап</div>
        <RichEditor key={'s' + k} value={sum} onChange={setSum} placeholder="Что получилось, что исправить, план на следующий период…" />
      </div>
      <div className="recap-field">
        <div className="perf-log-title">Рекомендации на следующий период</div>
        <RichEditor key={'r' + k} value={rec} onChange={setRec} placeholder="напр. улучшить входы, не закрывать рано…" />
      </div>
      </div>
    </section>
  )
}

// Рекомендации, написанные в прошлом периоде: напоминание в начале нового
function PrevRecs({ mode, prevFrom }) {
  const [rec] = useHtml(recKey(mode, prevFrom))
  const [big, setBig] = useState(null)
  if (!rec) return null
  return (
    <section className="card prev-recs">
      <h2 style={{ marginTop: 0 }}>Рекомендации {NEXT_LABEL[mode]}</h2>
      <div className="re-body re-read" onClick={(e) => { if (e.target.tagName === 'IMG') setBig(e.target.src) }} dangerouslySetInnerHTML={{ __html: cleanHtml(rec) }} />
      {big && <Lightbox src={big} onClose={() => setBig(null)} />}
    </section>
  )
}

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
  const [openPlans, setOpenPlans] = useState(false)
  const [openTrades, setOpenTrades] = useState(false)

  const all = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray().then((a) => a.sort(byOpenedDesc)), [], [])
  const plans = useLiveQuery(() => db.plans.filter((p) => !p.deleted).toArray(), [], [])

  const [from, to] = rangeOf(mode, anchor, custom)
  const [curFrom] = rangeOf(mode, new Date(), custom)
  const isCurrent = from.getTime() === curFrom.getTime()
  useEffect(() => { setOpenPlans(false); setOpenTrades(false) }, [mode, acc, from.getTime(), to.getTime()])

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
    return plans
      .filter((p) => planInRange(p.weekStart, from, to))
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
            {overview.map(([label, value, cls, sub]) => (
              <div className="m" key={label}>
                <div className="l">{label}</div>
                <div className={'v ' + cls}>
                <AnimNum value={value} />
                {sub && <span className="v-sub"><span className="tt-sep">|</span><TradeCounts compact short win={sub.win} loss={sub.loss} be={sub.be} /></span>}
              </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {NOTE_MODES.has(mode) && <PrevRecs mode={mode} prevFrom={rangeOf(mode, shift(mode, anchor, -1), custom)[0]} />}

      <div className="perf-cols">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Планы за период</h2>
        {periodPlans.length === 0 ? <div className="subtle">Планов за этот период нет</div> : (
          <ul className="perf-plans">
            {(openPlans ? periodPlans : periodPlans.slice(0, LIMIT)).map((p) => (
              <li key={p.id}>
                <button type="button" className="perf-plan" onClick={() => go('plan', { weekStart: p.weekStart, planId: p.id })}>
                  <span className="perf-plan-top">
                    {p.symbol && <SymbolIcon symbol={p.symbol} size={18} />}
                    <span className="perf-plan-name">{p.symbol || 'Общий план'}</span>
                    <span className="subtle perf-plan-week">{weekLabel(p.weekStart).replace(/ \d{4}$/, '')}</span>
                  </span>
                  {(() => {
                    const { sm, rr } = planStats[p.id]
                    return (
                      <span className="perf-plan-res">
                        <TradeCounts total={sm.total} win={sm.winCount} loss={sm.lossCount} be={sm.beCount} open={sm.open} missed={sm.missed} />
                        <span className="perf-plan-sp" />
                        <span className={'perf-plan-n ' + sign(sm.pctTotal)} title="Net %">{sm.pctTotal == null ? '—' : signed(sm.pctTotal, 2, '%')}</span>
                        <span className={'perf-plan-n ' + sign(rr)} title="RR">{rr == null ? '—' : signed(rr, 2) + ' RR'}</span>
                      </span>
                    )
                  })()}
                </button>
              </li>
            ))}
          </ul>
        )}
        <More total={periodPlans.length} open={openPlans} onToggle={() => setOpenPlans((o) => !o)} />
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Сделки за период</h2>
        {inPeriod.length === 0 ? <div className="empty">Нет сделок за этот период</div> : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th className="left">Дата</th><th className="left">Инструмент</th><th className="left">Сторона</th><th className="left">Result</th><th>Net</th><th>R</th></tr>
              </thead>
              <tbody>
                {(openTrades ? inPeriod : inPeriod.slice(0, LIMIT)).map((t) => {
                  const c = calcTrade(t)
                  return (
                    <tr key={t.id} className={'perf-row' + (c.res === 'missed' ? ' is-missed' : '')} onClick={() => go('trades', { tradeId: t.id })}>
                      <td className="left">{new Date(t.openedAt).toLocaleDateString('ru-RU', { dateStyle: 'short' })}</td>
                      <td className="left"><span className="symcell"><SymbolIcon symbol={t.symbol} size={20} />{t.symbol || <span className="subtle">Не выбран</span>}</span></td>
                      <td className={'left ' + t.side}>{t.side === 'long' ? 'Лонг' : 'Шорт'}</td>
                      <td className="left">{hasResult(t) ? <ResultPill c={c} /> : <span className="subtle">—</span>}</td>
                      <td className={sign(c.netPct)}>{c.netPct == null ? '—' : signed(c.netPct, 2, '%')}</td>
                      <td className={sign(c.r)}>{c.r == null ? '—' : fmt(c.r)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <More total={inPeriod.length} open={openTrades} onToggle={() => setOpenTrades((o) => !o)} />
      </section>
      </div>

      {mode === 'week' && <Recap from={from} />}

      <div className={NOTE_MODES.has(mode) ? 'perf-bottom' : undefined}>
        {NOTE_MODES.has(mode) && <PeriodNotes mode={mode} from={from} />}
        <Log from={from} to={to} />
      </div>
    </>
  )
}
