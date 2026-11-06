import React, { useLayoutEffect, useState } from 'react'

// Анимации включены только в стиле Hero и только если система не просит уменьшить движение.
export const heroMotion = () =>
  typeof document !== 'undefined' &&
  document.documentElement.dataset.style === 'ow' &&
  !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

// Число (с минусом/плюсом, пробелами-разделителями тысяч и десятичной запятой), как его выдаёт fmt()
const TOKEN = /[-−+]?\d[\d  ]*(?:,\d+)?/g

function at(text, t) {
  return text.replace(TOKEN, (tok) => {
    const sign = /^[-−+]/.test(tok) ? tok[0] : ''
    const body = tok.slice(sign.length)
    const dec = body.includes(',') ? body.split(',')[1].length : 0
    const n = parseFloat(body.replace(/[  ]/g, '').replace(',', '.'))
    if (!isFinite(n)) return tok
    return sign + (n * t).toLocaleString('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  })
}

// Значение «набегает» от нуля до итогового, как цифры на экране итогов матча.
// В конце всегда показывается исходная строка без изменений.
export default function AnimNum({ value, duration = 850 }) {
  const text = String(value)
  const [t, setT] = useState(() => (heroMotion() && /\d/.test(text) ? 0 : 1))

  useLayoutEffect(() => {
    if (!heroMotion() || !/\d/.test(text)) { setT(1); return }
    let raf, start
    setT(0)
    const step = (now) => {
      if (start == null) start = now
      const p = Math.min(1, (now - start) / duration)
      setT(1 - Math.pow(1 - p, 3))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, duration])

  return <>{t >= 1 ? text : at(text, t)}</>
}
