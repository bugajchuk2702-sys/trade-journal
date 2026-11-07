import React, { useEffect, useRef, useState } from 'react'

// Кнопка с выпадающим списком и поиском: выбрать запись, чтобы привязать её
// (заметку к трейду или плану, трейд или план к заметке).
// items: [{ id, label, sub }]; onCreate — необязательная кнопка «создать новую».
export default function LinkPicker({ label, items, onPick, onCreate, createLabel, empty = 'Ничего нет' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const off = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc, true) }
  }, [open])

  const s = q.trim().toLowerCase()
  const shown = items.filter((i) => !s || `${i.label} ${i.sub || ''}`.toLowerCase().includes(s)).slice(0, 60)

  return (
    <div className="lpick" ref={wrap}>
      <button type="button" className="ghost small" aria-expanded={open} onClick={() => { setOpen((o) => !o); setQ('') }}>{label}</button>
      {open && (
        <div className="plist lpick-list" role="listbox">
          {items.length > 6 && (
            <input className="lpick-q" autoFocus placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          <div className="plist-items">
            {shown.length === 0 && <div className="pempty">{empty}</div>}
            {shown.map((i) => (
              <button type="button" role="option" className="popt popt-plan" key={i.id} onClick={() => { onPick(i); setOpen(false) }}>
                <span className="lpick-t">{i.label}</span>
                {i.sub && <span className="psub">{i.sub}</span>}
              </button>
            ))}
          </div>
          {onCreate && (
            <div className="padd">
              <button type="button" className="small" onClick={() => { onCreate(); setOpen(false) }}>{createLabel}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Ряд «название + чипы привязанных записей + кнопка добавления»
export function LinkRow({ label, chips, children }) {
  return (
    <div className="linkrow">
      <span className="plabel">{label}</span>
      <div className="linkchips">
        {chips.map((c) => (
          <span className="lchip" key={c.id}>
            <button type="button" className="lchip-t" onClick={c.onOpen} title={c.onOpen ? 'Открыть' : undefined}>{c.label}</button>
            <button type="button" className="lchip-x" onClick={c.onRemove} title="Убрать связь" aria-label={'Убрать ' + c.label}>✕</button>
          </span>
        ))}
        {children}
      </div>
    </div>
  )
}
