import React, { useEffect } from 'react'
import { TradeForm } from '../pages/Trades.jsx'

// Окно создания / правки сделки поверх страницы (например, из плана недели)
export default function TradeModal({ title, initial, onSave, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="card modal" role="dialog" aria-label={title}>
        <div className="shot-head">
          <h2>{title}</h2>
          <span className="spacer" />
          <button type="button" className="ghost small" onClick={onClose} title="Закрыть (Esc)">✕</button>
        </div>
        <TradeForm hidePlan initial={initial} onSave={onSave} onClose={onClose} />
      </section>
    </div>
  )
}
