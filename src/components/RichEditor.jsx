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
          (el.tagName === 'DIV' && n === 'class' && (a.value === 'callout' || a.value === 're-gal')) ||
          (el.tagName === 'IMG' && n === 'src' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(a.value)) ||
          (el.tagName === 'IMG' && n === 'alt')
        if (!ok) el.removeAttribute(n)
      }
      if (el.tagName === 'IMG' && !el.getAttribute('src')) { el.remove(); continue }
      walk(el)
    }
  }
  walk(doc.body)
  groupImages(doc.body)
  return doc.body.innerHTML
}

// Галерея: картинки в строке подгоняем по пропорциям так, чтобы у обеих была одинаковая высота, а строка занимала всю ширину.
// Ширина ставится только в DOM (при сохранении стили вычищаются) — на лету, по реальным размерам картинок.
const GAP = 8.5
function balanceGalleries(root) {
  root.querySelectorAll('.re-gal').forEach((g) => {
    const imgs = [...g.children].filter((n) => n.tagName === 'IMG')
    for (let i = 0; i < imgs.length; i += 2) {
      const a = imgs[i]
      const b = imgs[i + 1]
      if (!b) { a.style.width = ''; continue }
      const ra = a.naturalWidth / a.naturalHeight
      const rb = b.naturalWidth / b.naturalHeight
      if (!(ra > 0 && rb > 0)) continue // ещё не загрузились — подгоним по событию load
      a.style.width = `calc((100% - ${GAP}px) * ${ra / (ra + rb)})`
      b.style.width = `calc((100% - ${GAP}px) * ${rb / (ra + rb)})`
    }
  })
}

// Скриншоты, идущие подряд (в том числе вставленные раньше по одному), собираем в галерею — они встают рядом
const onlyImgs = (n) => {
  if (n.nodeType === 3) return !n.textContent.trim()
  if (n.nodeType !== 1) return true
  if (n.tagName === 'IMG' || n.tagName === 'BR') return true
  if (n.tagName !== 'DIV' && n.tagName !== 'P') return false
  if (n.classList.contains('callout')) return false
  return [...n.childNodes].every(onlyImgs)
}
const isImgBlock = (n) => n.nodeType === 1 && (n.tagName === 'IMG' || n.querySelector('img')) && onlyImgs(n)
const isBlank = (n) => (n.nodeType === 3 && !n.textContent.trim()) || (n.nodeType === 1 && n.tagName !== 'IMG' && !n.querySelector('img') && !n.textContent.trim() && /^(DIV|P|BR)$/.test(n.tagName))
function groupImages(root) {
  const kids = [...root.childNodes]
  for (let i = 0; i < kids.length; i++) {
    const first = kids[i]
    if (!isImgBlock(first)) continue
    const run = [first]
    let j = i + 1
    // дальше берём картинки и пустые строки между ними; пустые строки в конце не трогаем
    let lastImg = i
    while (j < kids.length && (isImgBlock(kids[j]) || isBlank(kids[j]))) {
      if (isImgBlock(kids[j])) lastImg = j
      j++
    }
    for (let k = i + 1; k <= lastImg; k++) run.push(kids[k])
    const imgs = []
    for (const n of run) { if (n.tagName === 'IMG') imgs.push(n); else if (n.nodeType === 1) imgs.push(...n.querySelectorAll('img')) }
    const gal = root.ownerDocument.createElement('div')
    gal.className = 're-gal'
    first.before(gal)
    for (const im of imgs) gal.appendChild(im)
    for (const n of run) if (n.tagName !== 'IMG') n.remove()
    i = lastImg
  }
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
  const wrapRef = useRef(null)
  const [hov, setHov] = useState(null) // картинка под курсором: показываем на ней кнопку «убрать»

  // Подтягиваем значение извне (облако, другой день), пока пользователь не печатает
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const v = value || ''
    if (v === last.current) return
    if (document.activeElement === el && last.current !== '') return
    const c = cleanHtml(v)
    el.innerHTML = c
    last.current = c
  }, [value])

  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); push() } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const sched = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; balanceGalleries(el) }) }
    const mo = new MutationObserver(sched)
    mo.observe(el, { childList: true, subtree: true })
    el.addEventListener('load', sched, true)
    sched()
    return () => { mo.disconnect(); el.removeEventListener('load', sched, true); if (raf) cancelAnimationFrame(raf) }
  }, [])

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

  // Скриншоты идут в «галерею»: подряд вставленные картинки встают рядом (по две в ряд), а не друг под другом
  const isEmptyBlock = (n) => n && n.nodeType === 1 && !n.classList.contains('re-gal') && !n.querySelector('img') && !n.textContent.trim()
  const placeImage = (url) => {
    const root = ref.current
    if (!root) return
    root.focus()
    const img = document.createElement('img')
    img.src = url
    img.alt = 'Скриншот'
    // верхний блок редактора, в котором стоит курсор
    const sel = window.getSelection()
    let anchor = sel.rangeCount && root.contains(sel.anchorNode) && sel.anchorNode !== root ? sel.anchorNode : null
    while (anchor && anchor.parentNode !== root) anchor = anchor.parentNode
    let gal = null
    if (anchor && anchor.classList?.contains('re-gal')) gal = anchor
    else if (isEmptyBlock(anchor) && anchor.previousElementSibling?.classList.contains('re-gal')) gal = anchor.previousElementSibling
    if (!gal) {
      gal = document.createElement('div')
      gal.className = 're-gal'
      if (!anchor) root.appendChild(gal)
      else if (isEmptyBlock(anchor)) root.insertBefore(gal, anchor)
      else root.insertBefore(gal, anchor.nextSibling)
    }
    gal.appendChild(img)
    // под галереей всегда есть пустая строка для текста
    let tail = gal.nextElementSibling
    if (!isEmptyBlock(tail)) {
      tail = document.createElement('div')
      tail.appendChild(document.createElement('br'))
      root.insertBefore(tail, gal.nextSibling)
    }
    const r = document.createRange()
    r.setStart(tail, 0)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
  }
  const removeImage = (img) => {
    const g = img.parentNode
    img.remove()
    if (g?.classList?.contains('re-gal') && !g.querySelector('img')) g.remove()
    setHov(null)
    changed()
  }
  const onOver = (e) => {
    if (e.target.tagName !== 'IMG') return
    const w = wrapRef.current?.getBoundingClientRect()
    const r = e.target.getBoundingClientRect()
    if (w) setHov({ img: e.target, top: r.top - w.top + 8, left: r.right - w.left - 36 })
  }

  const insertImages = async (files) => {
    if (!files.length) return
    setBusy(true)
    try {
      for (const f of files) {
        const url = await toDataUrl(f)
        placeImage(url)
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
    <div className="re" ref={wrapRef} onMouseLeave={() => setHov(null)}>
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
        onMouseOver={onOver}
        onClick={(e) => { if (e.target.tagName === 'IMG') setBig(e.target.src) }}
      />
      {hov && <button type="button" className="re-imgdel" style={{ top: hov.top, left: hov.left }} title="Убрать скриншот" aria-label="Убрать скриншот" onMouseDown={(e) => e.preventDefault()} onClick={() => removeImage(hov.img)}>✕</button>}
      {big && <Lightbox src={big} onClose={() => setBig(null)} />}
    </div>
  )
}
