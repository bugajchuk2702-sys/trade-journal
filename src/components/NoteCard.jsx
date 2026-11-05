import React, { useRef, useState } from 'react'
import { toDataUrl } from './ShotCard.jsx'

function imagesFromClipboard(e) {
  const out = []
  for (const it of e.clipboardData?.items || []) {
    if (it.type.startsWith('image/')) {
      const f = it.getAsFile()
      if (f) out.push(f)
    }
  }
  return out
}

// Карточка-вопрос: несколько скриншотов (галерея) и текст ответа.
// Скриншоты: Ctrl+V (когда курсор в карточке), перетаскивание или выбор файлов.
export default function NoteCard({ title, tone, imgs, text, onAdd, onRemoveAt, onText, placeholder }) {
  const fileRef = useRef(null)
  const [big, setBig] = useState(null)
  const [busy, setBusy] = useState(false)
  const list = imgs || []

  const take = async (files) => {
    const arr = [...files].filter((f) => f.type.startsWith('image/'))
    if (!arr.length) return
    setBusy(true)
    try {
      const urls = []
      for (const f of arr) urls.push(await toDataUrl(f))
      onAdd(urls)
    } catch {
      alert('Не удалось прочитать картинку')
    } finally {
      setBusy(false)
    }
  }

  const onPaste = (e) => {
    const files = imagesFromClipboard(e)
    if (files.length) {
      e.preventDefault()
      take(files)
    }
  }

  return (
    <section className={'card shotcard notecard ' + (tone || '')} onPaste={onPaste}>
      <h2 className="q">{title}</h2>

      <div
        className="gallery"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          take(e.dataTransfer.files || [])
        }}
      >
        {list.map((src, i) => (
          <div className="g-item" key={i}>
            <img src={src} alt={`Скриншот ${i + 1}`} onClick={() => setBig(src)} title="Нажми, чтобы открыть крупно" />
            <button type="button" className="g-x" title="Убрать скриншот" onClick={() => onRemoveAt(i)}>✕</button>
          </div>
        ))}
        <div className="g-add" tabIndex={0}>
          <span>{busy ? 'Загружаю…' : '+ Скриншот'}</span>
          <span className="hint">Ctrl+V или перетащи</span>
          <button type="button" className="ghost small" onClick={() => fileRef.current?.click()}>Выбрать файлы</button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files || [])
          e.target.value = ''
        }}
      />

      <textarea value={text} onChange={(e) => onText(e.target.value)} placeholder={placeholder} />

      {big && (
        <div className="lightbox" onClick={() => setBig(null)}>
          <img src={big} alt="" />
        </div>
      )}
    </section>
  )
}
