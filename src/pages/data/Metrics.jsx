import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db.js'
import { calcTrade, fmt, isMissed } from '../../stats.js'
import AnimNum from '../../AnimNum.jsx'
import { PARAMS, STYLE, CAT_PARAMS, addOption, catOf, clearOption, dropOption, renameOption, setCat, useParamCats, useParamOptions } from '../../components/Params.jsx'
import { useAccounts, bucket } from './accounts.js'
import { Ring, pct, sign, signed } from './ui.jsx'
import TradeCounts from '../../components/TradeCounts.jsx'
import { overviewOf } from './overview.js'
import { SymbolIcon } from '../../components/Symbols.jsx'

// Блоки в том же порядке, что и в Notion: две колонки, слева направо
const pOf = (key) => PARAMS.find((p) => p.key === key)
const GROUPS = [
  { id: 'symbol', title: 'Пары', dynamic: true, get: (t) => t.symbol }, // список берётся из самих сделок
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
  const decided = c.filter((x) => x.res !== 'be').length // винрейт считается без BE
  return {
    n: c.length,
    winrate: decided ? (wins / decided) * 100 : 0,
    pnl: c.reduce((s, x) => s + x.pnl, 0),
    avgR: rs.length ? rs.reduce((s, x) => s + x.r, 0) / rs.length : null,
  }
}

function Group({ g, trades, options, allCats }) {
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState('')
  const catList = g.def ? CAT_PARAMS[g.def.key] : null
  const [newCat, setNewCat] = useState(catList ? catList[0] : '')
  const by = bucket(trades, g.get)
  let rows
  if (g.fixed) rows = g.fixed.map(([v, label, tone]) => ({ v, label, tone }))
  else if (g.dynamic) {
    // Пары: только те, что есть в сделках, чаще торгуемые выше
    rows = [...by.keys()]
      .map((v) => ({ v, label: v, n: stat(by.get(v)).n, all: by.get(v).length }))
      .sort((a, b) => b.n - a.n || b.all - a.all || a.label.localeCompare(b.label))
  } else {
    const known = options.map((v) => ({ v, label: v }))
    const extra = [...by.keys()].filter((v) => !options.includes(v)).map((v) => ({ v, label: v, extra: true }))
    rows = [...known, ...extra]
  }
  // Категории: строки идут группами, перед каждой — заголовок с итогами по категории
  if (catList) {
    const catRows = (c) => rows.filter((r) => catOf(allCats, g.def.key, r.v) === c)
    const out = []
    for (const c of [...catList, '']) {
      const rs = catRows(c)
      if (!rs.length && c === '') continue
      const sum = stat(rs.flatMap((r) => by.get(r.v) || []))
      out.push({ head: true, c, sum })
      out.push(...rs)
    }
    rows = out
  }
  const unset = trades.filter((t) => { const v = g.get(t); return v == null || v === '' }).length
  return (
    <div className="mt-group">
      <div className="mt-head">
        <span className="mt-pill">{g.title}</span>
        {g.def && <button type="button" className="ghost small mt-edit" onClick={() => setEdit((e) => !e)}>{edit ? 'Готово' : 'Править'}</button>}
      </div>
      <ul className="mt-rows">
        {rows.map((r) => {
          if (r.head) {
            return (
              <li key={'h:' + r.c} className="mt-sub">
                {r.c || 'Без категории'}
                <span className="mt-sub-n">{r.sum.n ? `${r.sum.n} ${r.sum.n === 1 ? 'Trade' : 'Trades'} · ${pct(r.sum.winrate)}${r.sum.avgR == null ? '' : ' · ' + signed(r.sum.avgR, 2) + ' R'}` : ''}</span>
              </li>
            )
          }
          const s = stat(by.get(r.v) || [])
          if (edit && g.def) {
            return (
              <li key={r.v} className="mt-row mt-editing">
                <input
                  className="mt-input"
                  defaultValue={r.v}
                  aria-label={'Название: ' + r.v}
                  onBlur={(e) => { if (e.target.value.trim() === r.v) return; renameOption(g.def, r.v, e.target.value).then((ok) => { if (!ok) e.target.value = r.v }) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = r.v; e.target.blur() } }}
                />
                {r.extra && <span className="acc-note">нет в списке</span>}
                {catList && <button type="button" className="mt-cat" title="Сменить категорию" onClick={() => { const cur = catOf(allCats, g.def.key, r.v); setCat(g.def.key, r.v, catList[(catList.indexOf(cur) + 1) % catList.length]) }}>⇄ {(catOf(allCats, g.def.key, r.v) || 'без категории').slice(0, 3)}</button>}
                <span className="mt-n">{(by.get(r.v) || []).length} {(by.get(r.v) || []).length === 1 ? 'Trade' : 'Trades'}</span>
                <button type="button" className="pdel" title={r.extra ? 'Очистить значение в сделках' : 'Убрать из списка'} aria-label={'Убрать ' + r.v} onClick={() => (r.extra ? clearOption(g.def, r.v) : dropOption(g.def, r.v))}>✕</button>
              </li>
            )
          }
          return (
            <li key={r.v} className={'mt-row' + (s.n === 0 ? ' zero' : '')}>
              {g.dynamic ? <span className="mt-ico"><SymbolIcon symbol={r.v} size={18} /></span> : <i className={'mt-dot ' + (r.tone || '')} />}
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
      {edit && g.def && (
        <div className="mt-add">
          <input className="mt-input" value={draft} placeholder="Новый вариант" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { addOption(g.def, draft, newCat); setDraft('') } }} />
          {catList && <select value={newCat} onChange={(e) => setNewCat(e.target.value)} aria-label="Категория">{catList.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
          <button type="button" className="small" disabled={!draft.trim()} onClick={() => { addOption(g.def, draft, newCat); setDraft('') }}>+</button>
        </div>
      )}
      {edit && <div className="hint" style={{ marginTop: 6 }}>Переименуй вариант — он изменится во всех сделках. Дай существующее название — варианты объединятся.</div>}
      {unset > 0 && <div className="mt-unset">Не указано в {unset} {unset === 1 ? 'сделке' : 'сделках'}</div>}
    </div>
  )
}

export default function Metrics() {
  const { get } = useParamOptions()
  const allCats = useParamCats()
  const { list } = useAccounts()
  const all = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray(), [], [])
  const [acc, setAcc] = useState('') // '' = все счета

  const names = useMemo(() => {
    const set = new Set(list.map((a) => a.name))
    for (const t of all) if (t.account) set.add(t.account)
    return [...set]
  }, [list, all])
  const trades = useMemo(() => all.filter((t) => !isMissed(t) && (!acc || t.account === acc)), [all, acc])
  const closedN = (arr) => arr.filter((t) => calcTrade(t).closed).length

  const overview = useMemo(() => overviewOf(trades), [trades])

  // Карточки раскладываются в две колонки без дыр: каждая следующая идёт в ту колонку, где пока меньше строк
  const columns = useMemo(() => {
    const cols = [[], []]
    const load = [0, 0]
    for (const g of GROUPS) {
      const set = new Set(g.def ? get(g.def) : [])
      for (const t of trades) { const v = g.get(t); if (v) set.add(v) }
      const w = 3 + set.size + (g.def && CAT_PARAMS[g.def.key] ? 4 : 0)
      const i = load[1] < load[0] ? 1 : 0
      cols[i].push(g)
      load[i] += w
    }
    return cols
  }, [trades, get]) // eslint-disable-line react-hooks/exhaustive-deps

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
      </section>

      <section className="card">
        <div className="toolbar"><h2 style={{ margin: 0 }}>Metrics</h2><span className="acc-note">сделки с результатом: по значению параметра, winrate и средний R</span></div>
        {trades.length === 0 ? (
          <div className="empty">{acc ? 'По этому счёту сделок пока нет' : 'Сделок пока нет'}</div>
        ) : (
          <div className="mt-grid">
            {columns.map((col, i) => (
              <div className="mt-col" key={i}>
                {col.map((g) => <Group key={g.id} g={g} trades={trades} options={g.def ? get(g.def) : []} allCats={allCats} />)}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
