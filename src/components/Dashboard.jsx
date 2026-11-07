import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { db } from '../db.js'
import { summarize, pctCurve, fmt } from '../stats.js'
import AnimNum, { heroMotion } from '../AnimNum.jsx'

const sign = (n) => (n == null || !isFinite(n) ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

// Переключатель периода: текущий месяц или всё время
const RangeToggle = ({ value, onChange }) => (
  <div className="chips">
    <button type="button" className={'chip' + (value === 'month' ? ' active' : '')} onClick={() => onChange('month')} title="С 1-го числа текущего месяца">Месяц</button>
    <button type="button" className={'chip' + (value === 'all' ? ' active' : '')} onClick={() => onChange('all')}>Всё время</button>
  </div>
)

// Слева карточка со всеми метриками, справа кривая капитала.
// Считается по всем сделкам.
export default function Dashboard() {
  const trades = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray(), [], [])
  const [mRange, setMRange] = useState('all') // период метрик слева (у кривой свой переключатель)
  const monthStart = useMemo(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime() }, [])
  const s = useMemo(
    () => summarize(mRange === 'month' ? trades.filter((t) => (t.closedAt || t.openedAt) >= monthStart) : trades),
    [trades, mRange, monthStart]
  )

  // Кривая: в % от размера счёта, за текущий месяц или за всё время
  const [range, setRange] = useState('all') // month | all
  const pc = useMemo(() => pctCurve(trades, range === 'month' ? monthStart : 0), [trades, range, monthStart])
  const last = pc.curve[pc.curve.length - 1].equity
  const tone = last < 0 ? 'var(--red-fill)' : 'var(--green-fill)'

  // «1 д 0 ч»
  const hold = (ms) => {
    const h = Math.round((ms || 0) / 3600000)
    return `${Math.floor(h / 24)} д ${h % 24} ч`
  }
  const wr = (v) => fmt(v || 0, 1) + '%'
  const pf = (v) => ((v || 0) > 0 ? '+' : '') + fmt(v || 0) + '%'
  const items = [
    ['PnL %', pf(s.pctTotal), sign(s.pctTotal)],
    ['Винрейт', wr(s.winrate)],
    ['Профит-фактор', s.profitFactor === Infinity ? '∞' : fmt(s.profitFactor || 0)],
    ['Винрейт лонг / шорт', [wr(s.winrateLong), wr(s.winrateShort)], '', 'Доля прибыльных сделок: лонг / шорт', true],
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
            <div className="tt-row">
              <b>{s.total} Trades</b>
              <span className="tt-sep">|</span>
              <span className="tt-g" title="Прибыльные">{s.winCount}</span>
              <span className="tt-sl">/</span>
              <span className="tt-r" title="Убыточные">{s.lossCount}</span>
              <span className="tt-sl">/</span>
              <span className="tt-o" title="Безубыток">{s.beCount}</span>
              <span className="tt-sl">/</span>
              <span className="tt-b" title="Открытые">{s.open}</span>
            </div>
          </div>
          <div className="m-grid">
            {items.map(([label, value, cls, tip, wide]) => (
              <div className={'m' + (wide ? ' wide' : '')} key={label} title={tip}>
                <div className="l">{label}</div>
                <div className={'v ' + (cls || '')}>
                  {Array.isArray(value) ? (
                    // два значения строго по колонкам сетки: слева лонг, справа шорт
                    <div className="v2">
                      <span><AnimNum value={value[0]} /><i>/</i></span>
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
    </section>
  )
}
