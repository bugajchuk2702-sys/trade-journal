import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db.js'
import { ACC_KEY } from '../../components/Params.jsx'
import { calcTrade, summarize, toNum } from '../../stats.js'

// Статусы счёта в порядке «важности» — по нему сортируются карточки
export const STATUSES = ['Ongoing', 'Funded', 'Demo', 'Passed', 'Failed']

// Счёт из базы с значениями по умолчанию (старые записи были только {name, size})
export const normAcc = (a) => ({
  status: 'Ongoing', target: null, ddLimit: null, archived: false, createdAt: 0,
  ...a,
  size: toNum(a.size) || 0,
})

export function useAccounts() {
  const row = useLiveQuery(() => db.meta.get(ACC_KEY), [], undefined)
  const list = useMemo(() => (row?.value || []).map(normAcc), [row])
  const save = (v) => db.meta.put({ key: ACC_KEY, value: v })
  return { list, save }
}

export const byStatus = (a, b) =>
  STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || (a.createdAt || 0) - (b.createdAt || 0) || a.name.localeCompare(b.name)

// Сводка по сделкам счёта. size — размер счёта, от него считаются % прибыли и просадки.
export function accountStats(own, size) {
  const s = summarize(own)
  const calc = own.map(calcTrade).filter((c) => c.closed)
  const wins = calc.filter((c) => c.pnl > 0).length
  const losses = calc.filter((c) => c.pnl < 0).length
  const rs = calc.filter((c) => c.r != null)
  const pnlPct = size > 0 ? (s.totalPnl / size) * 100 : calc.reduce((x, c) => x + (c.netPct || 0), 0)
  return {
    count: s.count,
    wins,
    losses,
    be: calc.length - wins - losses,
    winrate: s.winrate,
    pnl: s.totalPnl,
    pnlPct,
    rr: rs.reduce((x, c) => x + c.r, 0),
    avgR: s.avgR,
    pf: s.profitFactor,
    ddPct: size > 0 ? (s.maxDd / size) * 100 : null,
    maxDd: s.maxDd,
    curve: s.curve,
  }
}

// Группировка сделок по значению параметра
export function bucket(trades, get) {
  const m = new Map()
  for (const t of trades) {
    const v = get(t)
    if (v == null || v === '') continue
    if (!m.has(v)) m.set(v, [])
    m.get(v).push(t)
  }
  return m
}
