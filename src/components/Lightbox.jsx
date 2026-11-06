import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

// Крупный просмотр скриншота поверх страницы. Закрывается кликом или клавишей Esc.
// Рисуется в body, чтобы карточка (срезанные углы) его не обрезала.
export default function Lightbox({ src, alt = '', onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="lightbox" onClick={onClose}>
      <img src={src} alt={alt} />
    </div>,
    document.body
  )
}
