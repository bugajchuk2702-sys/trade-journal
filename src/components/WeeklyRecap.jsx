import React, { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { calcTrade, summarize, fmt } from '../stats.js'

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

  const items = [
    ['Закрыто', s.count],
    ['Открыто', s.open],
    ['PnL', fmt(s.totalPnl), sign(s.totalPnl)],
    ['Винрейт', s.winrate == null ? '—' : fmt(s.winrate, 1) + '%'],
    ['Профит-фактор', s.profitFactor === Infinity ? '∞' : fmt(s.profitFactor)],
    ['Средний R', fmt(s.avgR), sign(s.avgR)],
    ['Лучшая', fmt(s.best), sign(s.best)],
    ['Худшая', fmt(s.worst), sign(s.worst)],
    ['Макс. просадка', fmt(s.maxDd), s.maxDd > 0 ? 'neg' : ''],
    ['Комиссии', fmt(s.fees)],
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
                <div className={'v ' + (cls || '')}>{value}</div>
              </div>
            ))}
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th className="left">Дата</th>
                  <th className="left">Сторона</th>
                  <th>Вход</th>
                  <th>Выход</th>
                  <th>PnL</th>
                  <th>R</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const c = calcTrade(t)
                  return (
                    <tr key={t.id} title={t.notes || ''}>
                      <td className="left">
                        {new Date(t.closedAt || t.openedAt).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </td>
                      <td className={'left ' + t.side}>{t.side === 'long' ? 'Лонг' : 'Шорт'}</td>
                      <td>{fmt(t.entry, 4)}</td>
                      <td>{c.closed ? fmt(t.exit, 4) : 'открыта'}</td>
                      <td className={sign(c.pnl)}>{fmt(c.pnl)}</td>
                      <td className={sign(c.r)}>{fmt(c.r)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
