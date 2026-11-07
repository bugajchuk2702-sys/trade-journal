import React, { useEffect, useLayoutEffect, useRef } from 'react'

// Текстовое поле, которое растёт вместе с текстом: полосы прокрутки нет,
// карточка просто становится выше. Минимальную высоту задаёт CSS (min-height).
export default function AutoTextarea({ value, style, ...rest }) {
  const ref = useRef(null)

  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    // border-box: к высоте содержимого добавляем рамки
    el.style.height = el.scrollHeight + (el.offsetHeight - el.clientHeight) + 'px'
  }

  useLayoutEffect(fit, [value])

  // Ширина поля меняется (окно, раскладка, поле было скрыто) — переcчитываем высоту
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    let w = el.offsetWidth
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth !== w) {
        w = el.offsetWidth
        fit()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return <textarea ref={ref} value={value} rows={1} style={{ resize: 'none', overflowY: 'hidden', ...style }} {...rest} />
}
