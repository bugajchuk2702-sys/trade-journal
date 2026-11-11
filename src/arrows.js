// «->» в шрифте журнала выглядит как дефис со скобкой. Поэтому:
//  - при наборе «->» сразу превращается в «→», а «<->» в «↔»;
//  - уже написанные «->» один раз заменяются в сохранённых записях.
import { db } from './db.js'

const FIX = (s) => s.replace(/<-{1,2}>/g, '↔').replace(/-{1,2}>/g, '→')

export function initArrows() {
  document.addEventListener('input', (e) => {
    const el = e.target
    if (e.isComposing || e.inputType !== 'insertText' || e.data !== '>') return
    const field = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'search') && !el.inputMode)
    if (!field) return
    const pos = el.selectionStart
    if (pos == null || pos !== el.selectionEnd) return
    const before = el.value.slice(0, pos)
    const cut = Math.max(0, before.length - 4) // хватает хвоста из 4 символов: <-->
    const fixed = FIX(before.slice(cut))
    if (fixed === before.slice(cut)) return
    const next = before.slice(0, cut) + fixed
    // прямой вызов родного setter: React увидит изменение и вызовет onChange
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, next + el.value.slice(pos))
    el.setSelectionRange(next.length, next.length)
  }, true)
}

const deep = (v, st) => {
  if (typeof v === 'string') {
    if (v.startsWith('data:') || !v.includes('>')) return v
    const r = FIX(v)
    if (r !== v) st.changed = true
    return r
  }
  if (Array.isArray(v)) return v.map((x) => deep(x, st))
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v)) o[k] = deep(v[k], st)
    return o
  }
  return v
}

export async function migrateArrows() {
  const KEY = 'tj-arrows-v1'
  try { if (localStorage.getItem(KEY)) return } catch { return }
  for (const t of ['trades', 'plans', 'notes']) {
    const rows = await db[t].toArray()
    const fix = []
    for (const r of rows) {
      const st = { changed: false }
      const n = deep(r, st)
      if (st.changed) fix.push({ ...n, updatedAt: Date.now(), synced: 0 })
    }
    if (fix.length) await db[t].bulkPut(fix)
  }
  try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
}
