import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { db } from '../db.js'
import { summarize, fmt } from '../stats.js'

const sign = (n) => (n == null || !isFinite(n) ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

function readOpen() {
  try {
    return localStorage.getItem('dockOpen') !== '0'
  } catch {
    return true
  }
}

// Нижняя панель: слева все метрики, справа кривая капитала.
// Считается по ВСЕМ сделкам, поэтому одинакова на любой странице.
export default function Dashboard() {
  const trades = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray(), [], [])
  const s = useMemo(() => summarize(trades), [trades])
  const [open, setOpen] = useState(readOpen)

  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem('dockOpen', next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  const items = [
    ['Закрыто сделок', s.count],
    ['Открыто', s.open],
    ['PnL', fmt(s.totalPnl), sign(s.totalPnl)],
    ['Винрейт', s.winrate == null ? '—' : fmt(s.winrate, 1) + '%'],
    ['Профит-фактор', s.profitFactor === Infinity ? '∞' : fmt(s.profitFactor)],
    ['Матожидание', fmt(s.expectancy), sign(s.expectancy)],
    ['Средний R', fmt(s.avgR), sign(s.avgR)],
    ['Ср. прибыль', fmt(s.avgWin), s.avgWin != null ? 'pos' : ''],
    ['Ср. убыток', fmt(s.avgLoss), s.avgLoss != null ? 'neg' : ''],
    ['Лучшая сделка', fmt(s.best), sign(s.best)],
    ['Худшая сделка', fmt(s.worst), sign(s.worst)],
    ['Макс. просадка', fmt(s.maxDd), s.maxDd > 0 ? 'neg' : ''],
    ['Серия побед', s.maxWinStreak],
    ['Серия убытков', s.maxLossStreak],
    ['Комиссии', fmt(s.fees)],
  ]

  return (
    <footer className={'dock' + (open ? '' : ' closed')}>
      <div className="dock-head">
        <span className="dock-title">Метрики и кривая капитала</span>
        {!open && (
          <span className={'dock-mini ' + sign(s.totalPnl)}>
            PnL {fmt(s.totalPnl)} · винрейт {s.winrate == null ? '—' : fmt(s.winrate, 1) + '%'} · сделок {s.count}
          </span>
        )}
        <span className="spacer" />
        <button className="ghost small" onClick={toggle}>{open ? 'Свернуть ▾' : 'Развернуть ▴'}</button>
      </div>

      {open && (
        <div className="dock-body">
          <div className="card metrics">
            {items.map(([label, value, cls]) => (
              <div className="m" key={label}>
                <div className="l">{label}</div>
                <div className={'v ' + (cls || '')}>{value}</div>
              </div>
            ))}
          </div>

          <div className="card curve">
            {s.curve.length < 2 ? (
              <div className="empty">Кривая капитала появится после двух закрытых сделок</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={s.curve} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#2a3541" strokeDasharray="3 3" />
                  <XAxis dataKey="n" stroke="#8b98a5" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#8b98a5" tick={{ fontSize: 11 }} width={56} />
                  <ReferenceLine y={0} stroke="#8b98a5" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={{ background: '#171e26', border: '1px solid #2a3541' }}
                    labelFormatter={(n) => 'Сделка №' + n}
                    formatter={(v) => [fmt(v), 'Капитал']}
                  />
                  <Line type="monotone" dataKey="equity" stroke="#3ddc97" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </footer>
  )
}
