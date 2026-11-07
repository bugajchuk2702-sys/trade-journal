import React, { useState } from 'react'
import Lightbox from './Lightbox.jsx'
import { toDataUrl } from './ShotCard.jsx'
import AutoTextarea from './AutoTextarea.jsx'

const isImage = (f) => f && f.type && f.type.startsWith('image/')

// Карточка-заметка с «тихой» вставкой скриншотов: никакой зоны загрузки.
// Нажми Ctrl+V прямо в текстовом поле (или перетащи картинку в него) —
// скриншот появится под текстом в среднем размере.
export default function NotesCard({ title, text, imgs, onText, onAdd, onRemoveAt, placeholder, bare }) {
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

  // bare — без своей карточки: поле и скриншоты кладутся внутрь чужой
  const Wrap = bare ? 'div' : 'section'
  return (
    <Wrap className={bare ? undefined : 'card weeknotes'}>
      {busy && <div className="hint" style={{ marginBottom: 8 }}>Добавляю скриншот…</div>}

      <AutoTextarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        onPaste={onPaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        placeholder={placeholder}
      />

      {list.length > 0 && (
        <div className="gallery-md">
          {list.map((src, i) => (
            <div className="g-item" key={i}>
              <img src={src} alt={`Скриншот ${i + 1}`} onClick={() => setBig(src)} title="Нажми, чтобы открыть крупно" />
              <button type="button" className="g-x" title="Убрать скриншот" onClick={() => onRemoveAt(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {big && <Lightbox src={big} onClose={() => setBig(null)} />}
    </Wrap>
  )
}
