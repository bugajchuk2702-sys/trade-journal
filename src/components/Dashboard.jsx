import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { db } from '../db.js'
import TradeCounts from './TradeCounts.jsx'
import { summarize, pctCurve, calcTrade, isMissed, fmt, fmtHold } from '../stats.js'
import AnimNum, { heroMotion } from '../AnimNum.jsx'

const sign = (n) => (n == null || !isFinite(n) ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

// Переключатель периода: текущий месяц или всё время
const RangeToggle = ({ value, onChange }) => (
  <div className="chips">
    <button type="button" className={'chip' + (value === 'month' ? ' active' : '')} onClick={() => onChange('month')} title="С 1-го числа текущего месяца">Месяц</button>
    <button type="button" className={'chip' + (value === 'all' ? ' active' : '')} onClick={() => onChange('all')}>Всё время</button>
  </div>
)


const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const dayId = (y, m, d) => y * 10000 + (m + 1) * 100 + d

// Результаты по дням: в % от счёта (если у сделки известен размер счёта), иначе в $.
// День сделки — день закрытия, а если её нет — день открытия.
function dayResults(trades) {
  const map = new Map()
  for (const t of trades) {
    if (isMissed(t)) continue
    const c = calcTrade(t)
    if (!c.closed) continue
    const d = new Date(t.closedAt || t.openedAt)
    const k = dayId(d.getFullYear(), d.getMonth(), d.getDate())
    const e = map.get(k) || { pct: 0, hasPct: false, usd: 0, n: 0 }
    if (c.netPct != null) { e.pct += c.netPct; e.hasPct = true }
    e.usd += c.pnl || 0
    e.n += 1
    map.set(k, e)
  }
  return map
}

// «1 сделка», «2 сделки», «5 сделок»
const tradesWord = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'сделка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'сделки' : 'сделок'}`
const dayValue = (e) => (e.hasPct ? e.pct : e.usd)
const dayText = (e) => {
  const v = dayValue(e)
  return (v > 0 ? '+' : '') + (e.hasPct ? fmt(v) + '%' : fmt(v, 0) + ' $')
}

// Календарь результатов за месяц: каждый день окрашен по итогу
function PnlCalendar({ days, y, m }) {
  const first = (new Date(y, m, 1).getDay() + 6) % 7
  const count = new Date(y, m + 1, 0).getDate()
  const rows = Math.ceil((first + count) / 7)
  const now = new Date()
  const today = dayId(now.getFullYear(), now.getMonth(), now.getDate())
  const cells = []
  for (let i = 0; i < first; i++) cells.push(<span key={'b' + i} className="cal-blank" />)
  for (let d = 1; d <= count; d++) {
    const id = dayId(y, m, d)
    const e = days.get(id)
    const v = e ? dayValue(e) : 0
    const cls = 'cal-day' + (e ? (v > 0 ? ' win' : v < 0 ? ' loss' : ' be') : '') + (id === today ? ' today' : '')
    cells.push(
      <span key={d} className={cls}>
        <span className="cal-top">
          <span className="cal-n">{d}</span>
          {e && <span className="cal-cnt">{tradesWord(e.n)}</span>}
        </span>
        {e && <span className="cal-v">{dayText(e)}</span>}
      </span>
    )
  }
  return (
    <div className="cal" style={{ '--rows': rows }}>
      {WEEKDAYS.map((w) => <span key={w} className="cal-wd">{w}</span>)}
      {cells}
    </div>
  )
}

// Отдельная карточка: календарь результатов за месяц с навигацией и суммой
function CalendarCard({ trades }) {
  const [cm, setCm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const shiftMonth = (k) => setCm(({ y, m }) => { const d = new Date(y, m + k, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const days = useMemo(() => dayResults(trades), [trades])
  const monthTotal = useMemo(() => {
    let pct = 0, usd = 0, hasPct = false, n = 0
    for (const [k, e] of days) {
      if (Math.floor(k / 100) !== cm.y * 100 + cm.m + 1) continue
      pct += e.pct; usd += e.usd; hasPct = hasPct || e.hasPct; n += e.n
    }
    return { n, text: n ? dayText({ hasPct, pct, usd }) : '', cls: sign(hasPct ? pct : usd) }
  }, [days, cm])
  const now = new Date()
  const isThisMonth = cm.y === now.getFullYear() && cm.m === now.getMonth()
  return (
    <div className="card calendar">
      <div className="cal-head">
        <span className="cal-nav">
          <button type="button" className="ghost small" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">◀</button>
          <strong>{MONTHS[cm.m]} {cm.y}</strong>
          <button type="button" className="ghost small" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">▶</button>
          {!isThisMonth && <button type="button" className="ghost small" onClick={() => setCm({ y: now.getFullYear(), m: now.getMonth() })}>Сегодня</button>}
        </span>
        {monthTotal.n > 0 && <span className={'cal-total ' + monthTotal.cls} title="Итог за месяц">{monthTotal.text}</span>}
      </div>
      <PnlCalendar days={days} y={cm.y} m={cm.m} />
    </div>
  )
}

// Слева карточка со всеми метриками, справа кривая капитала.
// Считается по всем сделкам.
export default function Dashboard() {
  const trades = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray(), [], [])
  const [mRange, setMRange] = useState('all') // период метрик слева (у кривой свой переключатель)
  const monthStart = useMemo(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime() }, [])
  const plans = useLiveQuery(() => db.plans.where('deleted').equals(0).toArray(), [], [])
  const s = useMemo(
    () => summarize(mRange === 'month' ? trades.filter((t) => (t.closedAt || t.openedAt) >= monthStart) : trades),
    [trades, mRange, monthStart]
  )

  // Кривая: в % от размера счёта, за текущий месяц или за всё время
  const [range, setRange] = useState('all') // month | all
  const pc = useMemo(() => pctCurve(trades, range === 'month' ? monthStart : 0), [trades, range, monthStart])
  const last = pc.curve[pc.curve.length - 1].equity
  const tone = last < 0 ? 'var(--red-fill)' : 'var(--green-fill)'

  const hold = fmtHold
  // Винрейт нарратива: доля планов с итогом «Отработал» среди планов с выбранным Narrative Result.
  // За месяц берутся планы недель, начавшихся с 1-го числа.
  const narr = useMemo(() => {
    const ms = new Date(monthStart)
    const from = ms.getFullYear() + '-' + String(ms.getMonth() + 1).padStart(2, '0') + '-01'
    const set = plans.filter((p) => (p.narrative === 'worked' || p.narrative === 'failed') && (mRange === 'all' || p.weekStart >= from))
    const worked = set.filter((p) => p.narrative === 'worked').length
    return { worked, total: set.length, rate: set.length ? (worked / set.length) * 100 : 0 }
  }, [plans, mRange, monthStart])
  const wr = (v) => fmt(v || 0, 1) + '%'
  const pf = (v) => ((v || 0) > 0 ? '+' : '') + fmt(v || 0) + '%'
  const items = [
    ['PnL %', pf(s.pctTotal), sign(s.pctTotal)],
    ['Винрейт', wr(s.winrate), '', 'Доля прибыльных сделок, безубыточные (BE) не считаются'],
    ['Винрейт нарратива', wr(narr.rate), '', narr.total ? `Отработал ${narr.worked} из ${narr.total} планов` : 'Пока нет планов с выбранным Narrative Result'],
    [['Винрейт лонг', 'Винрейт шорт'], [wr(s.winrateLong), wr(s.winrateShort)], '', 'Доля прибыльных сделок без BE: лонг / шорт', true],
    ['Время в позиции', hold(s.avgHold), '', 'Среднее время в позиции'],
    ['Средний R', fmt(s.avgR || 0), sign(s.avgR)],
    ['Ср. % прибыли', pf(s.avgWinPct), s.avgWinPct != null ? 'pos' : ''],
    ['Ср. % убытка', pf(s.avgLossPct), s.avgLossPct != null ? 'neg' : ''],
    ['Макс. просадка', (s.maxDdPct > 0 ? '-' : '') + fmt(s.maxDdPct || 0) + '%', s.maxDdPct > 0 ? 'neg' : ''],
    ['Серия побед', s.maxWinStreak],
    ['Серия убытков', s.maxLossStreak],
  ]

  return (
    <section className="dash">
      <h3 className="section-title">Метрики и кривая капитала</h3>
      <div className="dash-body">
        <div className="card metrics">
          <div className="m-total">
            <div className="tt-head">
              <div className="tt-title">Total Trades</div>
              <RangeToggle value={mRange} onChange={setMRange} />
            </div>
            <TradeCounts total={s.total} win={s.winCount} loss={s.lossCount} be={s.beCount} open={s.open} missed={s.missed} />
          </div>
          <div className="m-grid">
            {items.map(([label, value, cls, tip, wide]) => (
              <div className={'m' + (wide ? ' wide' : '')} key={String(label)} title={tip}>
                {Array.isArray(label) ? (
                  <div className="l v2"><span>{label[0]}</span><span>{label[1]}</span></div>
                ) : (
                  <div className="l">{label}</div>
                )}
                <div className={'v ' + (cls || '')}>
                  {Array.isArray(value) ? (
                    // два значения строго по колонкам сетки: слева лонг, справа шорт
                    <div className="v2">
                      <span><AnimNum value={value[0]} /></span>
                      <span><AnimNum value={value[1]} /></span>
                    </div>
                  ) : (
                    <AnimNum value={value} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card curve" style={{ '--tone': tone }}>
          <div className="curve-head">
            <span className="curve-title">Рост счёта, %</span>
            <RangeToggle value={range} onChange={setRange} />
          </div>
          <div className="curve-plot">
            {pc.count === 0 ? (
              <div className="empty">{range === 'month' ? 'В этом месяце закрытых сделок пока нет' : 'Кривая появится после первой закрытой сделки'}</div>
            ) : pc.withPct === 0 ? (
              <div className="empty">Выбери счёт с размером в сделках — тогда кривая покажет проценты</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pc.curve} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" style={{ stopColor: tone, stopOpacity: 0.32 }} />
                      <stop offset="100%" style={{ stopColor: tone, stopOpacity: 0 }} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="n" stroke="var(--text-3)" tick={{ fontSize: 11, fill: 'var(--text-2)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis stroke="var(--text-3)" tick={{ fontSize: 11, fill: 'var(--text-2)' }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => Number(v.toFixed(1)) + '%'} />
                  <ReferenceLine y={0} stroke="var(--line-2)" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: 'none', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,.25)', color: 'var(--text)' }}
                    itemStyle={{ color: 'var(--text)' }}
                    labelStyle={{ color: 'var(--text-2)' }}
                    labelFormatter={(n, pl) => (n === 0 ? 'Старт' : 'Сделка №' + n + (pl?.[0]?.payload?.date ? ' · ' + new Date(pl[0].payload.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''))}
                    formatter={(v) => [(v > 0 ? '+' : '') + fmt(v) + '%', 'Рост']}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#888" strokeWidth={2.5} fill="url(#eqFill)" dot={false} isAnimationActive={heroMotion()} animationDuration={1100} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <h3 className="section-title">Календарь результатов</h3>
      <CalendarCard trades={trades} />
    </section>
  )
}
