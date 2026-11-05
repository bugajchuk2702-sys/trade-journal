// Хелперы для недель. Неделя задаётся строкой-понедельником YYYY-MM-DD.
export const iso = (d) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

export const mondayOf = (date = new Date()) => {
  const x = new Date(date)
  x.setHours(12, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return iso(x)
}

export const shiftWeek = (ws, n) => {
  const [y, m, d] = ws.split('-').map(Number)
  return iso(new Date(y, m - 1, d + 7 * n, 12))
}

export const weekLabel = (ws) => {
  const [y, m, d] = ws.split('-').map(Number)
  const a = new Date(y, m - 1, d, 12)
  const b = new Date(y, m - 1, d + 6, 12)
  const f = (x) => x.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return `${f(a)} – ${f(b)} ${b.getFullYear()}`
}
