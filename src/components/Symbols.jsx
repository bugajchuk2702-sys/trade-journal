import React, { useEffect, useId, useMemo, useRef, useState } from 'react'

// Инструменты, которые торгуются. Для каждого — свой значок.
// «Совпадение» считаем без разделителей: EUR/USD = EURUSD = eur-usd.
export const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9А-ЯЁ]/g, '')

// ---- Круглые флаги (упрощённые, нарисованы вручную) ----
const Flag = ({ id, children }) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
    <defs><clipPath id={id}><circle cx="12" cy="12" r="12" /></clipPath></defs>
    <g clipPath={`url(#${id})`}>{children}</g>
  </svg>
)

const FLAGS = {
  US: (id) => (
    <Flag id={id}>
      <rect width="24" height="24" fill="#fff" />
      {[0, 2, 4, 6].map((i) => <rect key={i} y={(i * 24) / 7} width="24" height={24 / 7} fill="#d22f3c" />)}
      <rect width="12.5" height={(24 / 7) * 4} fill="#2b3f8c" />
      {[[3, 3], [6.5, 3], [10, 3], [4.8, 6], [8.2, 6], [3, 9], [6.5, 9], [10, 9], [4.8, 12], [8.2, 12]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.75" fill="#fff" />)}
    </Flag>
  ),
  EU: (id) => (
    <Flag id={id}>
      <rect width="24" height="24" fill="#2147a8" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return <circle key={i} cx={12 + Math.cos(a) * 7} cy={12 + Math.sin(a) * 7} r="1.2" fill="#f7d32c" />
      })}
    </Flag>
  ),
  GB: (id) => (
    <Flag id={id}>
      <rect width="24" height="24" fill="#243b8f" />
      <path d="M0 0L24 24M24 0L0 24" stroke="#fff" strokeWidth="4.5" />
      <path d="M0 0L24 24M24 0L0 24" stroke="#cf2b3d" strokeWidth="1.6" />
      <path d="M12 0V24M0 12H24" stroke="#fff" strokeWidth="7" />
      <path d="M12 0V24M0 12H24" stroke="#cf2b3d" strokeWidth="3.8" />
    </Flag>
  ),
  DE: (id) => (
    <Flag id={id}>
      <rect width="24" height="8" y="0" fill="#1a1a1a" />
      <rect width="24" height="8" y="8" fill="#d6252b" />
      <rect width="24" height="8" y="16" fill="#f5c400" />
    </Flag>
  ),
  JP: (id) => (
    <Flag id={id}>
      <rect width="24" height="24" fill="#f4f4f4" />
      <circle cx="12" cy="12" r="6" fill="#c8102e" />
    </Flag>
  ),
  AU: (id) => (
    <Flag id={id}>
      <rect width="24" height="24" fill="#1c2f7a" />
      <rect width="12" height="12" fill="#243b8f" />
      <path d="M0 0L12 12M12 0L0 12" stroke="#fff" strokeWidth="2.2" />
      <path d="M6 0V12M0 6H12" stroke="#fff" strokeWidth="3.4" />
      <path d="M6 0V12M0 6H12" stroke="#cf2b3d" strokeWidth="1.8" />
      {[[18, 6], [17, 17], [8, 19], [21, 13]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.3" fill="#fff" />)}
    </Flag>
  ),
}

const Gold = ({ id }) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffe27a" />
        <stop offset="1" stopColor="#c98a12" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="12" fill={`url(#${id})`} />
    <circle cx="12" cy="12" r="9" fill="none" stroke="#a46d08" strokeOpacity=".55" strokeWidth="1" />
    <text x="12" y="15.6" textAnchor="middle" fontSize="9.5" fontWeight="700" fontFamily="Arial, sans-serif" fill="#7a4d00">Au</text>
  </svg>
)

const Bitcoin = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#f7931a" />
    <g fill="#fff">
      <path d="M8.6 6.8h4.1c1.9 0 3 .9 3 2.4 0 1-.6 1.8-1.5 2.1 1.2.3 1.9 1.2 1.9 2.4 0 1.7-1.3 2.7-3.3 2.7H8.6V6.8zm2 1.7v2.2h1.7c.8 0 1.3-.4 1.3-1.1s-.5-1.1-1.3-1.1h-1.7zm0 3.8v2.4h2c.9 0 1.4-.5 1.4-1.2s-.5-1.2-1.4-1.2h-2z" />
      <rect x="10.2" y="5" width="1.3" height="2.2" rx=".4" />
      <rect x="12.6" y="5" width="1.3" height="2.2" rx=".4" />
      <rect x="10.2" y="16.8" width="1.3" height="2.2" rx=".4" />
      <rect x="12.6" y="16.8" width="1.3" height="2.2" rx=".4" />
    </g>
  </svg>
)

// code — как отображается, a/b — значки (пара валют = два флага)
export const SYMBOLS = [
  { code: 'EUR/USD', icons: ['EU', 'US'] },
  { code: 'GBP/USD', icons: ['GB', 'US'] },
  { code: 'GER40', icons: ['DE'] },
  { code: 'XAU/USD', icons: ['XAU', 'US'] },
  { code: 'BTC', icons: ['BTC'] },
  { code: 'JP225', icons: ['JP'] },
  { code: 'AUD/USD', icons: ['AU', 'US'] },
]

function One({ kind, uid }) {
  if (kind === 'XAU') return <Gold id={uid} />
  if (kind === 'BTC') return <Bitcoin />
  return FLAGS[kind](uid)
}

// Значок инструмента. Для неизвестного инструмента — серый кружок с буквами.
export function SymbolIcon({ symbol, size = 22 }) {
  const uid = useId().replace(/:/g, '')
  const known = SYMBOLS.find((s) => norm(s.code) === norm(symbol))
  const cls = { width: size, height: size }
  if (!known) {
    const t = String(symbol || '?').replace(/[^A-Za-zА-Яа-я0-9]/g, '').slice(0, 2).toUpperCase() || '?'
    return (
      <span className="sico sico-generic" style={{ ...cls, fontSize: size * 0.4 }} aria-hidden="true">{t}</span>
    )
  }
  if (known.icons.length === 1) {
    return <span className="sico" style={cls}><One kind={known.icons[0]} uid={uid + 'a'} /></span>
  }
  // пара: два перекрывающихся значка
  const w = size * 1.7
  return (
    <span className="sico-pair" style={{ width: w, height: size }} aria-hidden="true">
      <span className="sico" style={cls}><One kind={known.icons[0]} uid={uid + 'a'} /></span>
      <span className="sico second" style={{ ...cls, left: size * 0.7 }}><One kind={known.icons[1]} uid={uid + 'b'} /></span>
    </span>
  )
}

// Текстовое поле с выпадающим списком инструментов (можно и вписать свой).
export function SymbolInput({ value, onChange, placeholder, autoFocus, required, className, style }) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const wrap = useRef(null)

  const q = norm(value)
  const exact = SYMBOLS.some((s) => norm(s.code) === q)
  const list = useMemo(() => (!q || exact ? SYMBOLS : SYMBOLS.filter((s) => norm(s.code).includes(q))), [q, exact])

  useEffect(() => setHi(-1), [value, open])
  useEffect(() => {
    if (!open) return
    const off = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  const pick = (code) => {
    onChange(code)
    setOpen(false)
  }

  const onKey = (e) => {
    if (e.key === 'Escape') return setOpen(false)
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return setOpen(true)
    if (!list.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % list.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h <= 0 ? list.length - 1 : h - 1)) }
    else if (e.key === 'Enter' && open && hi >= 0) { e.preventDefault(); pick(list[hi].code) }
  }

  const pair = SYMBOLS.find((s) => norm(s.code) === q)?.icons.length === 2
  const iconW = pair ? 22 * 1.7 : 22

  return (
    <div className={'symbox ' + (className || '')} ref={wrap} style={style}>
      <span className="symbox-ico" style={{ width: iconW }}>
        {value ? <SymbolIcon symbol={value} size={22} /> : <span className="sico sico-empty" style={{ width: 22, height: 22 }} />}
      </span>
      <input
        autoFocus={autoFocus}
        required={required}
        autoComplete="off"
        style={{ paddingLeft: 20 + iconW }}
        value={value}
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
      />
      {open && list.length > 0 && (
        <ul className="symlist" role="listbox">
          {list.map((s, i) => (
            <li key={s.code}>
              <button
                type="button"
                role="option"
                className={'symopt' + (i === hi ? ' hi' : '') + (norm(s.code) === q ? ' sel' : '')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.code)}
              >
                <span className="symopt-ico"><SymbolIcon symbol={s.code} size={22} /></span>
                <span>{s.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
