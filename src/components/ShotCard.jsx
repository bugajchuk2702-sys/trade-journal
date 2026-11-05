import React, { useRef, useState } from 'react'

// Уменьшаем скриншот до 1600px по ширине и сохраняем как JPEG (строка data URL):
// так он весит сотни КБ, лежит прямо в записи плана и попадает в JSON-бэкап.
async function toDataUrl(file, maxW = 1600) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const k = Math.min(1, maxW / img.naturalWidth)
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k)
    c.height = Math.round(img.naturalHeight * k)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function imageFromClipboard(e) {
  const items = e.clipboardData?.items || []
  for (const it of items) {
    if (it.type.startsWith('image/')) return it.getAsFile()
  }
  return null
}

// Карточка: заголовок, скриншот, текст.
// Скриншот можно вставить Ctrl+V (когда курсор в карточке), перетащить файлом или выбрать.
export default function ShotCard({ title, subtitle, onRemove, img, text, onImg, onText, placeholder }) {
  const fileRef = useRef(null)
  const [big, setBig] = useState(false)
  const [busy, setBusy] = useState(false)

  const take = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setBusy(true)
    try {
      onImg(await toDataUrl(file))
    } catch {
      alert('Не удалось прочитать картинку')
    } finally {
      setBusy(false)
    }
  }

  const onPaste = (e) => {
    const f = imageFromClipboard(e)
    if (f) {
      e.preventDefault()
      take(f)
    }
  }

  return (
    <section className="card shotcard" onPaste={onPaste}>
      <div className="shot-head">
        <h2>{title}</h2>
        {subtitle && <span className="hint">{subtitle}</span>}
        <span className="spacer" />
        {onRemove && <button type="button" className="danger small" title="Удалить карточку" onClick={onRemove}>✕</button>}
      </div>
      <div
        className={'shot' + (img ? ' has' : '')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          take(e.dataTransfer.files?.[0])
        }}
      >
        {img ? (
          <>
            <img src={img} alt={title} onClick={() => setBig(true)} title="Нажми, чтобы открыть крупно" />
            <div className="shot-actions">
              <button className="ghost small" onClick={() => fileRef.current?.click()}>Заменить</button>
              <button className="danger small" onClick={() => onImg('')}>Убрать</button>
            </div>
          </>
        ) : (
          <div className="shot-empty" tabIndex={0}>
            <span>{busy ? 'Загружаю…' : 'Нажми сюда и вставь скриншот: Ctrl+V'}</span>
            <span className="hint">или перетащи файл сюда</span>
            <button type="button" className="ghost small" onClick={() => fileRef.current?.click()}>Выбрать файл</button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            take(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {onText && <textarea value={text} onChange={(e) => onText(e.target.value)} placeholder={placeholder} />}
      {big && img && (
        <div className="lightbox" onClick={() => setBig(false)}>
          <img src={img} alt={title} />
        </div>
      )}
    </section>
  )
}
