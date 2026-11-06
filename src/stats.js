// Расчёты по сделке. Универсальная формула: работает для крипты, акций, форекса (если size — в единицах актива)
// Число из текста, который ввёл человек: терпимо к «180$», «1%», «1,5», пробелам
export const toNum = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const m = String(v).replace(',', '.').replace(/[^0-9.+-]/g, '')
  if (m === '' || m === '-' || m === '+' || m === '.') return null
  const n = Number(m)
  return isFinite(n) ? n : null
}
const has = (v) => toNum(v) != null

// Есть ли у сделки результат: новый (PnL в $) или старый (цены входа / выхода)
export const hasResult = (t) => has(t.pnlUsd) || has(t.entry)

export function calcTrade(t) {
  // Новая схема: PnL в долларах, риск в % от счёта, размер счёта запоминается в сделке
  if (has(t.pnlUsd)) {
    const pnl = toNum(t.pnlUsd)
    const acc = toNum(t.accountSize) || 0
    const risk = toNum(t.riskPct) || 0
    const netPct = acc > 0 ? (pnl / acc) * 100 : null
    const r = acc > 0 && risk > 0 ? pnl / ((acc * risk) / 100) : null
    return { closed: true, pnl, r, netPct }
  }
  const entry = Number(t.entry)
  const exit = t.exit === '' || t.exit == null ? null : Number(t.exit)
  const size = Number(t.size)
  const fees = Number(t.fees) || 0
  const stop = t.stop === '' || t.stop == null ? null : Number(t.stop)
  const dir = t.side === 'short' ? -1 : 1

  if (exit == null || !isFinite(exit)) {
    return { closed: false, pnl: null, r: null, netPct: null }
  }
  const gross = (exit - entry) * size * dir
  const pnl = gross - fees

  let r = null
  if (stop != null && isFinite(stop) && stop !== entry) {
    const risk = Math.abs(entry - stop) * size
    if (risk > 0) r = pnl / risk
  }
  return { closed: true, pnl, r, netPct: null }
}

export function summarize(trades) {
  const closed = trades
    .map((t) => ({ ...t, ...calcTrade(t) }))
    .filter((t) => t.closed)
    .sort((a, b) => (a.closedAt || a.openedAt) - (b.closedAt || b.openedAt) || (a.createdAt || 0) - (b.createdAt || 0))

  const wins = closed.filter((t) => t.pnl > 0)
  const losses = closed.filter((t) => t.pnl < 0)
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0)
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  const fees = closed.reduce((s, t) => s + (Number(t.fees) || 0), 0)

  const rs = closed.filter((t) => t.r != null).map((t) => t.r)
  const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null

  // Кривая капитала, макс. просадка и серии
  let equity = 0
  let peak = 0
  let maxDd = 0
  let winStreak = 0
  let lossStreak = 0
  let maxWinStreak = 0
  let maxLossStreak = 0
  const curve = closed.map((t, i) => {
    equity += t.pnl
    peak = Math.max(peak, equity)
    maxDd = Math.max(maxDd, peak - equity)
    if (t.pnl > 0) {
      winStreak += 1
      lossStreak = 0
    } else if (t.pnl < 0) {
      lossStreak += 1
      winStreak = 0
    } else {
      winStreak = 0
      lossStreak = 0
    }
    maxWinStreak = Math.max(maxWinStreak, winStreak)
    maxLossStreak = Math.max(maxLossStreak, lossStreak)
    return { n: i + 1, equity: Number(equity.toFixed(2)), date: t.closedAt || t.openedAt }
  })

  const pnls = closed.map((t) => t.pnl)

  return {
    count: closed.length,
    open: trades.length - closed.length,
    winrate: closed.length ? (wins.length / closed.length) * 100 : null,
    totalPnl,
    fees,
    expectancy: closed.length ? totalPnl / closed.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    avgR,
    best: pnls.length ? Math.max(...pnls) : null,
    worst: pnls.length ? Math.min(...pnls) : null,
    maxDd,
    maxWinStreak,
    maxLossStreak,
    curve,
  }
}

export const fmt = (n, d = 2) =>
  n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d })
