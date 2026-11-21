import React, { useEffect, useRef, useState } from 'react'
import Lightbox from './Lightbox.jsx'
import { toDataUrl } from './ShotCard.jsx'

// Небольшой редактор заметок: жирный, курсив, цвет, заголовки, списки, цитата, выноска
// и скриншоты прямо в тексте (Ctrl+V или перетаскивание). Хранит HTML.
const TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'DIV', 'P', 'BR', 'SPAN', 'FONT', 'IMG'])
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgb\([\d\s,.%]+\)|[a-z]{3,20})$/i

// Чистим HTML: только свои теги и безопасные атрибуты
export function cleanHtml(html) {
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html')
  const walk = (node) => {
    for (const el of [...node.children]) {
      if (!TAGS.has(el.tagName)) { el.replaceWith(...el.childNodes); continue }
      for (const a of [...el.attributes]) {
        const n = a.name
        const ok =
          (el.tagName === 'FONT' && n === 'color' && COLOR_RE.test(a.value)) ||
          (el.tagName === 'SPAN' && n === 'style' && /^color:\s*[^;]+;?$/i.test(a.value) && COLOR_RE.test(a.value.replace(/^color:\s*/i, '').replace(/;$/, ''))) ||
          (el.tagName === 'DIV' && n === 'class' && a.value === 'callout') ||
          (el.tagName === 'IMG' && n === 'src' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(a.value)) ||
          (el.tagName === 'IMG' && n === 'alt')
        if (!ok) el.removeAttribute(n)
      }
      if (el.tagName === 'IMG' && !el.getAttribute('src')) { el.remove(); continue }
      walk(el)
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}

const COLORS = [['Красный', '#e5484d'], ['Оранжевый', '#f5a524'], ['Зелёный', '#30a46c'], ['Синий', '#3b82f6'], ['Серый', '#8f98a8']]
const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

const Ico = ({ d }) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)

export default function RichEditor({ value, onChange, placeholder }) {
  const ref = useRef(null)
  const timer = useRef(null)
  const last = useRef('')
  const [big, setBig] = useState(null)
  const [colors, setColors] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  // Подтягиваем значение извне (облако, другой день), пока пользователь не печатает
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const v = value || ''
    if (v === last.current) return
    if (document.activeElement === el && last.current !== '') return
    el.innerHTML = cleanHtml(v)
    last.current = v
  }, [value])

  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); push() } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const push = () => {
    timer.current = null
    const el = ref.current
    if (!el) return
    let html = cleanHtml(el.innerHTML)
    if (!el.textContent.trim() && !el.querySelector('img')) html = ''
    if (html === last.current) return
    last.current = html
    onChange(html)
  }
  const changed = () => { clearTimeout(timer.current); timer.current = setTimeout(push, 600) }

  const cmd = (name, arg) => {
    ref.current?.focus()
    document.execCommand('styleWithCSS', false, false)
    document.execCommand(name, false, arg)
    changed()
  }
  const heading = (tag) => {
    const cur = document.queryCommandValue('formatBlock').toLowerCase()
    cmd('formatBlock', cur === tag ? 'div' : tag)
  }
  const quote = () => {
    const cur = document.queryCommandValue('formatBlock').toLowerCase()
    cmd('formatBlock', cur === 'blockquote' ? 'div' : 'blockquote')
  }
  const callout = () => {
    ref.current?.focus()
    const sel = window.getSelection().toString()
    document.execCommand('insertHTML', false, `<div class="callout" data-new="1">${sel ? esc(sel) : '<br>'}</div><div><br></div>`)
    // курсор — внутрь выноски, чтобы сразу писать в ней
    const c = ref.current?.querySelector('[data-new]')
    if (c) {
      c.removeAttribute('data-new')
      const r = document.createRange()
      r.selectNodeContents(c)
      r.collapse(!sel)
      const s2 = window.getSelection()
      s2.removeAllRanges()
      s2.addRange(r)
    }
    changed()
  }

  const insertImages = async (files) => {
    if (!files.length) return
    setBusy(true)
    try {
      for (const f of files) {
        const url = await toDataUrl(f)
        ref.current?.focus()
        document.execCommand('insertHTML', false, `<img src="${url}" alt="Скриншот"><div><br></div>`)
      }
      changed()
    } catch {
      alert('Не удалось прочитать картинку')
    } finally {
      setBusy(false)
    }
  }

  const onPaste = (e) => {
    const files = [...(e.clipboardData?.items || [])].filter((it) => it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean)
    if (files.length) { e.preventDefault(); insertImages(files); return }
    const text = e.clipboardData?.getData('text/plain')
    if (text != null) { e.preventDefault(); document.execCommand('insertText', false, text); changed() }
  }
  const onDrop = (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'))
    if (files.length) { e.preventDefault(); insertImages(files) }
  }

  const B = ({ title, onClick, children }) => (
    <button type="button" className="re-btn" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</button>
  )

  return (
    <div className="re">
      <div className="re-bar" role="toolbar" aria-label="Форматирование">
        <B title="Жирный" onClick={() => cmd('bold')}><b>B</b></B>
        <B title="Курсив" onClick={() => cmd('italic')}><i>I</i></B>
        <B title="Подчёркнутый" onClick={() => cmd('underline')}><u>U</u></B>
        <span className="re-pop">
          <B title="Цвет текста" onClick={() => setColors((c) => !c)}><Ico d={<><circle cx="12" cy="12" r="8.5" /><circle cx="8.5" cy="10" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="15.5" cy="10" r="1" /></>} /></B>
          {colors && (
            <span className="re-colors">
              {COLORS.map(([n, c]) => <button key={c} type="button" className="re-sw" title={n} aria-label={n} style={{ background: c }} onMouseDown={(e) => e.preventDefault()} onClick={() => { cmd('foreColor', c); setColors(false) }} />)}
              <button type="button" className="re-btn" title="Сбросить формат" aria-label="Сбросить формат" onMouseDown={(e) => e.preventDefault()} onClick={() => { cmd('removeFormat'); setColors(false) }}>✕</button>
            </span>
          )}
        </span>
        <B title="Заголовок 2" onClick={() => heading('h2')}>H<sub>2</sub></B>
        <B title="Заголовок 3" onClick={() => heading('h3')}>H<sub>3</sub></B>
        <B title="Список" onClick={() => cmd('insertUnorderedList')}><Ico d={<><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>} /></B>
        <B title="Нумерованный список" onClick={() => cmd('insertOrderedList')}><Ico d={<><path d="M10 6h10M10 12h10M10 18h10M4 5l1-1v4M3.5 14h2l-2 3h2" /></>} /></B>
        <B title="Цитата" onClick={quote}><Ico d={<path d="M7 7h4v5c0 2-1 3-3 3M15 7h4v5c0 2-1 3-3 3" />} /></B>
        <B title="Выноска" onClick={callout}><Ico d={<path d="M4 5h16v11H9l-5 4z" />} /></B>
        <B title="Вставить картинку" onClick={() => fileRef.current?.click()}><Ico d={<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M4 17l5-4 4 3 3-2 4 3" /></>} /></B>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { insertImages([...e.target.files]); e.target.value = '' }} />
      </div>
      {busy && <div className="hint" style={{ padding: '0 12px' }}>Добавляю скриншот…</div>}
      <div
        ref={ref}
        className="re-body"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={changed}
        onBlur={push}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={(e) => { if (e.target.tagName === 'IMG') setBig(e.target.src) }}
      />
      {big && <Lightbox src={big} onClose={() => setBig(null)} />}
    </div>
  )
}
