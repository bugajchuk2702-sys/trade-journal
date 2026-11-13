import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db.js'
import { calcTrade, fmt, summarize } from '../../stats.js'
import AnimNum from '../../AnimNum.jsx'
import { PARAMS, STYLE, useParamOptions } from '../../components/Params.jsx'
import { useAccounts, bucket } from './accounts.js'
import { Ring, money, pct, sign, signed } from './ui.jsx'

// Блоки в том же порядке, что и в Notion: две колонки, слева направо
const pOf = (key) => PARAMS.find((p) => p.key === key)
const GROUPS = [
  { id: 'pointA', title: 'Point A', def: pOf('pointA'), get: (t) => t.params?.pointA },
  { id: 'pointB', title: 'Point B', def: pOf('pointB'), get: (t) => t.params?.pointB },
  { id: 'style', title: 'Trading Style', def: STYLE, get: (t) => t.style },
  { id: 'positionType', title: 'Position Type', def: pOf('positionType'), get: (t) => t.params?.positionType },
  { id: 'side', title: 'Direction', fixed: [['long', 'Long', 'pos'], ['short', 'Short', 'neg']], get: (t) => t.side },
  { id: 'priceDelivery', title: 'Price Delivery', def: pOf('priceDelivery'), get: (t) => t.params?.priceDelivery },
  { id: 'entryModel', title: 'Entry Model', def: pOf('entryModel'), get: (t) => t.params?.entryModel },
  { id: 'entryTf', title: 'Entry TF', def: pOf('entryTf'), get: (t) => t.params?.entryTf },
]

// Сводка по набору сделок: только закрытые (с результатом)
function stat(arr) {
  const c = arr.map(calcTrade).filter((x) => x.closed)
  const rs = c.filter((x) => x.r != null)
  const wins = c.filter((x) => x.res === 'win').length
  return {
    n: c.length,
    winrate: c.length ? (wins / c.length) * 100 : 0,
    pnl: c.reduce((s, x) => s + x.pnl, 0),
    avgR: rs.length ? rs.reduce((s, x) => s + x.r, 0) / rs.length : null,
  }
}

function Group({ g, trades, options }) {
  const by = bucket(trades, g.get)
  let rows
  if (g.fixed) rows = g.fixed.map(([v, label, tone]) => ({ v, label, tone }))
  else {
    const known = options.map((v) => ({ v, label: v }))
    const extra = [...by.keys()].filter((v) => !options.includes(v)).map((v) => ({ v, label: v, extra: true }))
    rows = [...known, ...extra]
  }
  const unset = trades.filter((t) => { const v = g.get(t); return v == null || v === '' }).length
  return (
    <div className="mt-group">
      <div className="mt-head"><span className="mt-pill">{g.title}</span></div>
      <ul className="mt-rows">
        {rows.map((r) => {
          const s = stat(by.get(r.v) || [])
          return (
            <li key={r.v} className={'mt-row' + (s.n === 0 ? ' zero' : '')}>
              <i className={'mt-dot ' + (r.tone || '')} />
              <span className="mt-name" title={r.label}>{r.label}{r.extra && <span className="acc-note"> · нет в списке</span>}</span>
              <span className="mt-n">{s.n} {s.n === 1 ? 'Trade' : 'Trades'}</span>
              <span className={'mt-r ' + sign(s.avgR)} title="Средний R">{s.avgR == null ? '' : signed(s.avgR, 2) + ' R'}</span>
              <span className={'mt-pnl ' + sign(s.pnl)} title="PnL">{s.n ? signed(s.pnl, 0) + ' $' : ''}</span>
              <span className="mt-wr" title="Winrate">{pct(s.winrate)}</span>
              <Ring value={s.winrate} n={s.n} />
            </li>
          )
        })}
        {rows.length === 0 && <li className="mt-empty">Вариантов пока нет</li>}
      </ul>
      {unset > 0 && <div className="mt-unset">Не указано в {unset} {unset === 1 ? 'сделке' : 'сделках'}</div>}
    </div>
  )
}

export default function Metrics() {
  const { get } = useParamOptions()
  const { list } = useAccounts()
  const all = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray(), [], [])
  const [acc, setAcc] = useState('') // '' = все счета

  const names = useMemo(() => {
    const set = new Set(list.map((a) => a.name))
    for (const t of all) if (t.account) set.add(t.account)
    return [...set]
  }, [list, all])
  const trades = useMemo(() => (acc ? all.filter((t) => t.account === acc) : all), [all, acc])
  const closedN = (arr) => arr.filter((t) => calcTrade(t).closed).length

  const s = useMemo(() => summarize(trades), [trades])
  const rSum = useMemo(() => trades.map(calcTrade).filter((c) => c.closed && c.r != null).reduce((x, c) => x + c.r, 0), [trades])
  const overview = [
    ['Trades', String(s.count), ''],
    ['Winrate', s.winrate == null ? '—' : pct(s.winrate, 1), ''],
    ['PnL', s.count ? signed(s.totalPnl, 2) + ' $' : '—', sign(s.totalPnl)],
    ['Σ R', s.avgR == null ? '—' : signed(rSum, 2), sign(rSum)],
    ['Avg R', s.avgR == null ? '—' : signed(s.avgR, 2), sign(s.avgR)],
    ['Profit factor', s.profitFactor == null ? '—' : s.profitFactor === Infinity ? '∞' : fmt(s.profitFactor, 2), ''],
    ['Max drawdown', s.count ? money(s.maxDd, 2) : '—', ''],
  ]

  return (
    <>
      {names.length > 0 && (
        <div className="chips mt-chips">
          <button type="button" className={'chip' + (acc === '' ? ' active' : '')} onClick={() => setAcc('')}>Все счета <span className="chip-n">{closedN(all)}</span></button>
          {names.map((n) => (
            <button key={n} type="button" className={'chip' + (acc === n ? ' active' : '')} onClick={() => setAcc(n)}>
              {n} <span className="chip-n">{closedN(all.filter((t) => t.account === n))}</span>
            </button>
          ))}
        </div>
      )}

      <section className="card">
        <div className="recap-metrics acc-overview mt-overview">
          {overview.map(([label, value, cls]) => (
            <div className="m" key={label}>
              <div className="l">{label}</div>
              <div className={'v ' + cls}><AnimNum value={value} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="toolbar"><h2 style={{ margin: 0 }}>Metrics</h2><span className="acc-note">сделки с результатом: по значению параметра, winrate и средний R</span></div>
        {trades.length === 0 ? (
          <div className="empty">{acc ? 'По этому счёту сделок пока нет' : 'Сделок пока нет'}</div>
        ) : (
          <div className="mt-grid">
            {GROUPS.map((g) => <Group key={g.id} g={g} trades={trades} options={g.def ? get(g.def) : []} />)}
          </div>
        )}
      </section>
    </>
  )
}
