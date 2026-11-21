// Периоды для страниц Performance и Weekly Plan: неделя, месяц, квартал, год, всё время, свой диапазон
export const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

// [с, по) — «по» не включается
export function rangeOf(mode, anchor, custom = {}) {
  const a = dayStart(anchor)
  if (mode === 'week') {
    const s = new Date(a); s.setDate(a.getDate() - ((a.getDay() + 6) % 7))
    const e = new Date(s); e.setDate(s.getDate() + 7)
    return [s, e]
  }
  if (mode === 'month') return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 1)]
  if (mode === 'quarter') { const q = Math.floor(a.getMonth() / 3) * 3; return [new Date(a.getFullYear(), q, 1), new Date(a.getFullYear(), q + 3, 1)] }
  if (mode === 'year') return [new Date(a.getFullYear(), 0, 1), new Date(a.getFullYear() + 1, 0, 1)]
  if (mode === 'all') return [new Date(1970, 0, 1), new Date(2100, 0, 1)]
  const s = custom.from ? fromIso(custom.from) : a
  const e = custom.to ? fromIso(custom.to) : s
  const [lo, hi] = s <= e ? [s, e] : [e, s]
  const end = new Date(hi); end.setDate(hi.getDate() + 1)
  return [lo, end]
}

export function shift(mode, anchor, n) {
  const x = new Date(anchor)
  if (mode === 'week') x.setDate(x.getDate() + 7 * n)
  else if (mode === 'month') x.setMonth(x.getMonth() + n, 1)
  else if (mode === 'year') x.setFullYear(x.getFullYear() + n, 0, 1)
  else x.setMonth(x.getMonth() + 3 * n, 1)
  return x
}

// Номер недели по ISO (как в «Неделя 47 · 2026»)
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return [Math.ceil(((t - y0) / 864e5 + 1) / 7), t.getUTCFullYear()]
}

export function labelOf(mode, from, to) {
  if (mode === 'week') { const [w, y] = isoWeek(from); return `Неделя ${w} · ${y}` }
  if (mode === 'month') return from.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '').replace(/^./, (c) => c.toUpperCase())
  if (mode === 'quarter') return `Q${Math.floor(from.getMonth() / 3) + 1} · ${from.getFullYear()}`
  if (mode === 'year') return String(from.getFullYear())
  if (mode === 'all') return 'Всё время'
  const last = new Date(to); last.setDate(to.getDate() - 1)
  const f = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${f(from)} – ${f(last)}`
}

// Планы недель, пересекающихся с периодом
export const planInRange = (weekStart, from, to) => {
  const lo = new Date(from); lo.setDate(lo.getDate() - 6)
  const w = fromIso(weekStart)
  return w >= lo && w < to
}
