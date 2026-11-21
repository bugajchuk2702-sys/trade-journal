import { calcTrade, summarize } from '../../stats.js'
import { pct, sign, signed } from './ui.jsx'
import { fmt } from '../../stats.js'

// Верхняя сводка по набору сделок (без Missed): Metrics и Performance показывают одно и то же
export function overviewOf(trades) {
  const s = summarize(trades)
  const rSum = trades.map(calcTrade).filter((c) => c.closed && c.r != null).reduce((x, c) => x + c.r, 0)
  return [
    ['Trades', String(s.count), ''],
    ['Winrate', s.winrate == null ? '—' : pct(s.winrate, 1), ''],
    ['PnL', s.count ? signed(s.totalPnl, 2) + ' $' : '—', sign(s.totalPnl)],
    ['Σ R', s.avgR == null ? '—' : signed(rSum, 2), sign(rSum)],
    ['Avg R', s.avgR == null ? '—' : signed(s.avgR, 2), sign(s.avgR)],
    ['Profit factor', s.profitFactor == null ? '—' : s.profitFactor === Infinity ? '∞' : fmt(s.profitFactor, 2), ''],
    ['Max drawdown', s.maxDdPct == null ? '—' : pct(s.maxDdPct, 2), ''],
  ]
}
