import React, { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { summarize, fmt, fmtHold } from '../stats.js'
import AnimNum from '../AnimNum.jsx'

const sign = (n) => (n == null || !isFinite(n) ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

// EUR/USD, eur-usd и EURUSD считаем одним инструментом
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9А-ЯЁ]/g, '')

// Статистика недели по инструменту плана. Сделки берутся из вкладки Trades:
// совпадает инструмент, а дата закрытия (или открытия, если закрытия нет) попадает в неделю.
export default function WeeklyRecap({ symbol, weekStart }) {
  const [y, m, d] = weekStart.split('-').map(Number)
  const from = new Date(y, m - 1, d).getTime()
  const to = new Date(y, m - 1, d + 7).getTime()

  const trades = useLiveQuery(
    async () => {
      const all = await db.trades.where('deleted').equals(0).toArray()
      const key = norm(symbol)
      return all
        .filter((t) => !key || norm(t.symbol) === key || (key.length >= 3 && (norm(t.symbol).startsWith(key) || key.startsWith(norm(t.symbol)) && norm(t.symbol).length >= 3)))
        .filter((t) => {
          const ts = t.closedAt || t.openedAt
          return ts >= from && ts < to
        })
        .sort((a, b) => (a.closedAt || a.openedAt) - (b.closedAt || b.openedAt))
    },
    [symbol, weekStart],
    []
  )

  const s = useMemo(() => summarize(trades), [trades])

  const pf = (v) => ((v || 0) > 0 ? '+' : '') + fmt(v || 0) + '%'
  const items = [
    ['Сделок', s.total],
    ['PnL %', pf(s.pctTotal), sign(s.pctTotal)],
    ['Винрейт', fmt(s.winrate || 0, 1) + '%'],
    ['Средний R', fmt(s.avgR || 0), sign(s.avgR)],
    ['Макс. просадка', (s.maxDdPct > 0 ? '-' : '') + fmt(s.maxDdPct || 0) + '%', s.maxDdPct > 0 ? 'neg' : ''],
    ['Время в позиции', fmtHold(s.avgHold)],
  ]

  return (
    <section className="card recap">
      <div className="shot-head">
        <h2>Статистика недели{symbol ? ` · ${symbol}` : ''}</h2>
      </div>

      {trades.length === 0 ? (
        <div className="empty">
          На этой неделе сделок нету
        </div>
      ) : (
        <>
          <div className="recap-metrics">
            {items.map(([label, value, cls]) => (
              <div className="m" key={label}>
                <div className="l">{label}</div>
                <div className={'v ' + (cls || '')}><AnimNum value={value} /></div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
