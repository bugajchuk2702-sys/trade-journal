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
export const isMissed = (t) => t.result === 'missed'
export const hasResult = (t) => has(t.pnlUsd) || has(t.entry) || isMissed(t) // у Missed метка видна даже без PnL

// Итог сделки: то, что выбрал сам трейдер (Win / Loss / BE), а если не выбрал — по знаку PnL
// missed — упущенная / не замеченная позиция: в статистику не входит совсем
const RESULTS = ['win', 'loss', 'be', 'missed']
export const resOf = (t, pnl) => (RESULTS.includes(t.result) ? t.result : pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'be')

export function calcTrade(t) {
  // Новая схема: PnL в долларах, риск в % от счёта, размер счёта запоминается в сделке
  if (has(t.pnlUsd)) {
    const pnl = toNum(t.pnlUsd)
    const acc = toNum(t.accountSize) || 0
    const risk = toNum(t.riskPct) || 0
    const netPct = acc > 0 ? (pnl / acc) * 100 : null
    const r = acc > 0 && risk > 0 ? pnl / ((acc * risk) / 100) : null
    return { closed: true, res: resOf(t, pnl), pnl, r, netPct }
  }
  const entry = Number(t.entry)
  const exit = t.exit === '' || t.exit == null ? null : Number(t.exit)
  const size = Number(t.size)
  const fees = Number(t.fees) || 0
  const stop = t.stop === '' || t.stop == null ? null : Number(t.stop)
  const dir = t.side === 'short' ? -1 : 1

  if (exit == null || !isFinite(exit)) {
    return { closed: false, res: isMissed(t) ? 'missed' : null, pnl: null, r: null, netPct: null }
  }
  const gross = (exit - entry) * size * dir
  const pnl = gross - fees

  let r = null
  if (stop != null && isFinite(stop) && stop !== entry) {
    const risk = Math.abs(entry - stop) * size
    if (risk > 0) r = pnl / risk
  }
  return { closed: true, res: resOf(t, pnl), pnl, r, netPct: null }
}

export function summarize(all) {
  const trades = all.filter((t) => !isMissed(t))
  const closed = trades
    .map((t) => ({ ...t, ...calcTrade(t) }))
    .filter((t) => t.closed)
    .sort((a, b) => (a.closedAt || a.openedAt) - (b.closedAt || b.openedAt) || (a.createdAt || 0) - (b.createdAt || 0))

  const wins = closed.filter((t) => t.res === 'win')
  const losses = closed.filter((t) => t.res === 'loss')
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
    if (t.res === 'win') {
      winStreak += 1
      lossStreak = 0
    } else if (t.res === 'loss') {
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

  // Винрейт по направлению и среднее время в позиции
  const rate = (side) => {
    const a = closed.filter((t) => (t.side === 'short' ? 'short' : 'long') === side)
    const d = a.filter((t) => t.res !== 'be') // безубыточные в винрейт не входят
    return d.length ? (d.filter((t) => t.res === 'win').length / d.length) * 100 : null
  }
  const holds = closed.filter((t) => t.openedAt && t.closedAt && t.closedAt >= t.openedAt).map((t) => t.closedAt - t.openedAt)

  // Проценты от размера счёта (только сделки, у которых размер счёта известен)
  const pct = closed.filter((t) => t.netPct != null)
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  let pe = 0
  let pPeak = 0
  let maxDdPct = 0
  pct.forEach((t) => {
    pe += t.netPct
    pPeak = Math.max(pPeak, pe)
    maxDdPct = Math.max(maxDdPct, pPeak - pe)
  })

  return {
    count: closed.length,
    total: trades.length,
    missed: all.length - trades.length,
    open: trades.length - closed.length,
    winCount: wins.length,
    lossCount: losses.length,
    beCount: closed.length - wins.length - losses.length,
    winrateLong: rate('long'),
    winrateShort: rate('short'),
    avgHold: holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : null,
    pctTotal: pct.length ? pe : null,
    avgWinPct: mean(pct.filter((t) => t.res === 'win').map((t) => t.netPct)),
    avgLossPct: mean(pct.filter((t) => t.res === 'loss').map((t) => t.netPct)),
    maxDdPct: pct.length ? maxDdPct : null,
    winrate: wins.length + losses.length ? (wins.length / (wins.length + losses.length)) * 100 : null, // без BE
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

// Кривая роста в % от размера счёта: у каждой сделки результат делится на размер её счёта,
// дальше проценты суммируются. since — с какой даты (мс) считать; кривая всегда стартует с нуля.
export function pctCurve(all, since = 0) {
  const trades = all.filter((t) => !isMissed(t))
  const closed = trades
    .map((t) => ({ ...t, ...calcTrade(t) }))
    .filter((t) => t.closed && (t.closedAt || t.openedAt) >= since)
    .sort((a, b) => (a.closedAt || a.openedAt) - (b.closedAt || b.openedAt) || (a.createdAt || 0) - (b.createdAt || 0))
  let eq = 0
  let withPct = 0
  const curve = [{ n: 0, equity: 0, date: null }]
  closed.forEach((t, i) => {
    if (t.netPct != null) {
      eq += t.netPct
      withPct += 1
    }
    curve.push({ n: i + 1, equity: Number(eq.toFixed(2)), date: t.closedAt || t.openedAt })
  })
  return { curve, count: closed.length, withPct }
}

// Среднее время в позиции: «1 д 0 ч»
export const fmtHold = (ms) => {
  const h = Math.round((ms || 0) / 3600000)
  return `${Math.floor(h / 24)} д ${h % 24} ч`
}

export const fmt = (n, d = 2) =>
  n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d })
