import React, { useState } from 'react'
import { toDataUrl } from './ShotCard.jsx'

const isImage = (f) => f && f.type && f.type.startsWith('image/')

// Карточка-заметка с «тихой» вставкой скриншотов: никакой видимой зоны загрузки.
// Нажми Ctrl+V прямо в текстовом поле (или перетащи картинку в него) — скриншот
// сохранится, а над полем появится кнопка «📎 Скриншоты: N», которая раскрывает галерею.
export default function NotesCard({ title, text, imgs, onText, onAdd, onRemoveAt, placeholder }) {
  const [open, setOpen] = useState(false)
  const [big, setBig] = useState(null)
  const [busy, setBusy] = useState(false)
  const list = imgs || []

  const take = async (files) => {
    if (!files.length) return
    setBusy(true)
    try {
      const urls = []
      for (const f of files) urls.push(await toDataUrl(f))
      onAdd(urls)
    } catch {
      alert('Не удалось прочитать картинку')
    } finally {
      setBusy(false)
    }
  }

  // Файлы достаём синхронно, пока событие живо
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.items || [])]
      .filter((it) => it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter(Boolean)
    if (files.length) {
      e.preventDefault()
      take(files)
    }
  }

  const onDrop = (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter(isImage)
    if (files.length) {
      e.preventDefault()
      take(files)
    }
  }

  return (
    <section className="card weeknotes">
      <div className="shot-head">
        <h2>{title}</h2>
        <span className="spacer" />
        {(list.length > 0 || busy) && (
          <button type="button" className="ghost small" onClick={() => setOpen((o) => !o)}>
            {busy ? 'Добавляю…' : `📎 Скриншоты: ${list.length} ${open ? '▴' : '▾'}`}
          </button>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        onPaste={onPaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        placeholder={placeholder}
      />

      {open && list.length > 0 && (
        <div className="gallery" style={{ marginTop: 10, marginBottom: 0 }}>
          {list.map((src, i) => (
            <div className="g-item" key={i}>
              <img src={src} alt={`Скриншот ${i + 1}`} onClick={() => setBig(src)} title="Нажми, чтобы открыть крупно" />
              <button type="button" className="g-x" title="Убрать скриншот" onClick={() => onRemoveAt(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {big && (
        <div className="lightbox" onClick={() => setBig(null)}>
          <img src={big} alt="" />
        </div>
      )}
    </section>
  )
}
