import React, { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { toNum, summarize } from '../stats.js'
import { weekLabel } from '../week.js'
import { SymbolIcon, norm } from './Symbols.jsx'
import { FIX } from '../arrows.js'

// Параметры сделки: у каждого свой список вариантов. Список можно пополнять и чистить прямо в выпадашке,
// он хранится в базе (meta) и общий для всех сделок.
export const PARAMS = [
  { key: 'pointA', label: 'Point A', defaults: ['Fractal D1', 'FVG D1', '0.5 DR D1', 'IFVG D1', 'Пока не доказано обратное'] },
  { key: 'pointB', label: 'Point B', defaults: ['0.5 DR D1', 'Fractal D1', 'FVG D1', '0.5 W1'] },
  { key: 'positionType', label: 'Position Type', defaults: ['Reversal', 'Continuation'] },
  { key: 'priceDelivery', label: 'Price Delivery', defaults: ['1st POI', 'OF', 'SOF'] },
  { key: 'entryModel', label: 'Entry Model', defaults: ['DR H4 → SNR H4', 'DR H4 → SHIFT H4', 'SNR H4', 'SHIFT H4'] },
  { key: 'entryTf', label: 'Entry TF', defaults: ['D1', 'H4'] },
]

// Категории вариантов: у Entry Model варианты делятся на три группы. Сами варианты и сделки по-прежнему
// хранят просто название, а кто в какой категории — лежит отдельно (meta), поэтому ничего не мигрируется.
export const ENTRY_CATS = ['Continuation', 'Reversal', 'Retracement']
const CATS_KEY = 'paramCats.v1'
export const CAT_PARAMS = { entryModel: ENTRY_CATS }

export function useParamCats() {
  const row = useLiveQuery(() => db.meta.get(CATS_KEY), [], undefined)
  return row?.value || {}
}
export const catOf = (all, key, opt) => {
  const c = all?.[key]?.[opt]
  return (CAT_PARAMS[key] || []).includes(c) ? c : ''
}
export async function setCat(key, opt, cat) {
  const row = await db.meta.get(CATS_KEY)
  const value = { ...(row?.value || {}) }
  const m = { ...(value[key] || {}) }
  if (cat) m[opt] = cat
  else delete m[opt]
  value[key] = m
  await db.meta.put({ key: CATS_KEY, value })
}
const nextCat = (list, c) => list[(list.indexOf(c) + 1) % list.length]

// v2: списки по умолчанию заменены на настоящие; старые (черновые) варианты не подхватываются
const META_KEY = 'paramOptions.v2'

export function useParamOptions() {
  const row = useLiveQuery(() => db.meta.get(META_KEY), [], undefined)
  const saved = row?.value || {}
  const get = (p) => saved[p.key] || p.defaults
  const save = (key, list) => db.meta.put({ key: META_KEY, value: { ...saved, [key]: list } })
  return { get, save }
}

const valOf = (def, t) => (def.key === 'style' ? t.style : t.params?.[def.key])
const setVal = (def, t, v) => (def.key === 'style' ? { style: v } : { params: { ...(t.params || {}), [def.key]: v } })
const curList = async (def) => (await db.meta.get(META_KEY))?.value?.[def.key] || def.defaults
const saveList = async (def, list) => {
  const row = await db.meta.get(META_KEY)
  await db.meta.put({ key: META_KEY, value: { ...(row?.value || {}), [def.key]: list } })
}
const tradesWith = async (def, v) => (await db.trades.toArray()).filter((t) => valOf(def, t) === v)

// Сколько сделок (включая удалённые в корзину) используют вариант
export const countOption = async (def, v) => (await tradesWith(def, v)).length

// Переименовать вариант во всех сделках. Если такой вариант уже есть — варианты объединяются.
export async function renameOption(def, from, to) {
  const next = FIX((to || '').trim())
  if (!next || next === from) return false
  const list = await curList(def)
  const merge = list.includes(next)
  const used = await tradesWith(def, from)
  if (merge && !confirm(`Объединить «${from}» и «${next}»? Сделок, которые станут «${next}»: ${used.length}.`)) return false
  const out = merge ? list.filter((x) => x !== from) : list.includes(from) ? list.map((x) => (x === from ? next : x)) : [...list, next]
  await saveList(def, out)
  const oldCat = ((await db.meta.get(CATS_KEY))?.value || {})[def.key]?.[from]
  if (oldCat) {
    const have = ((await db.meta.get(CATS_KEY))?.value || {})[def.key]?.[next]
    if (!have) await setCat(def.key, next, oldCat)
    await setCat(def.key, from, '')
  }
  const now = Date.now()
  for (const t of used) await db.trades.update(t.id, { ...setVal(def, t, next), updatedAt: now, synced: 0 })
  return true
}

// Убрать вариант из списка. Если он уже стоит в сделках — они сохраняют значение («нет в списке»).
export async function dropOption(def, v) {
  const used = await tradesWith(def, v)
  if (used.length && !confirm(`«${v}» убирается из списка. В ${used.length} сделках значение останется (появится пометка «нет в списке»), его можно будет объединить с другим вариантом. Убрать?`)) return
  await saveList(def, (await curList(def)).filter((x) => x !== v))
}

// Стереть значение, которого нет в списке, из всех сделок
export async function clearOption(def, v) {
  const used = await tradesWith(def, v)
  if (!confirm(`Очистить «${v}» в ${used.length} сделках? Поле станет пустым.`)) return
  const now = Date.now()
  for (const t of used) await db.trades.update(t.id, { ...setVal(def, t, ''), updatedAt: now, synced: 0 })
}

export async function addOption(def, v, cat) {
  const x = FIX((v || '').trim())
  const list = await curList(def)
  if (x && !list.includes(x)) await saveList(def, [...list, x])
  if (x && cat) await setCat(def.key, x, cat)
}

export function ParamPicker({ label, value, options, onChange, onAdd, onRemove, cats }) {
  // cats: { list: ['Continuation', …], map: { вариант: категория }, onSet(вариант, категория) } — если есть, список делится на группы
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [newCat, setNewCat] = useState(cats?.list?.[0] || '')
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return
    const off = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc, true) }
  }, [open])

  const pick = (v) => { onChange(v); setOpen(false) }
  const add = () => {
    const v = draft.trim()
    if (!v) return
    onAdd(v, newCat)
    setDraft('')
    pick(v)
  }

  const row = (o, uncat) => (
    <div className="prow" key={o}>
      <button type="button" role="option" aria-selected={o === value} className={'popt' + (o === value ? ' sel' : '')} onClick={() => pick(o)}>{o}</button>
      {cats && !uncat && <button type="button" className="pdel pcat-mv" title="Сменить категорию" aria-label={'Сменить категорию: ' + o} onClick={() => cats.onSet(o, nextCat(cats.list, cats.map[o]))}>⇄</button>}
      <button type="button" className="pdel" title="Удалить вариант" aria-label={'Удалить ' + o} onClick={() => onRemove(o)}>✕</button>
    </div>
  )

  const groups = cats
    ? [{ c: '', items: options.filter((o) => !cats.list.includes(cats.map[o])) }, ...cats.list.map((c) => ({ c, items: options.filter((o) => cats.map[o] === c) }))]
    : null

  return (
    <div className="pbox" ref={wrap}>
      <span className="plabel">{label}</span>
      <button type="button" className={'pbtn' + (value ? ' set' : '')} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{value || 'Выбрать'}</span>
        <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="plist" role="listbox">
          <div className="plist-items">
            {value && <button type="button" className="popt clear" onClick={() => pick('')}>Очистить</button>}
            {groups
              ? groups.map((g) => (g.c || g.items.length) ? (
                <div className="pgroup" key={g.c || 'none'}>
                  <div className="pcat-h">{g.c || 'Без категории'}</div>
                  {g.items.map((o) => (g.c ? row(o) : (
                    <div className="prow pcat-pick" key={o}>
                      <button type="button" role="option" aria-selected={o === value} className={'popt' + (o === value ? ' sel' : '')} onClick={() => pick(o)}>{o}</button>
                      <span className="pcat-set" role="group" aria-label={'Категория: ' + o}>
                        {cats.list.map((c) => <button key={c} type="button" className="pcat-chip" title={'В категорию ' + c} onClick={() => cats.onSet(o, c)}>{c.slice(0, 3)}</button>)}
                      </span>
                      <button type="button" className="pdel" title="Удалить вариант" aria-label={'Удалить ' + o} onClick={() => onRemove(o)}>✕</button>
                    </div>
                  )))}
                  {g.c && g.items.length === 0 && <div className="pcat-empty">пусто</div>}
                </div>
              ) : null)
              : options.map((o) => row(o))}
          </div>
          <div className="padd">
            <input
              value={draft}
              placeholder="Новый вариант"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            />
            <button type="button" className="small" onClick={add} disabled={!draft.trim()}>+</button>
          </div>
          {cats && (
            <div className="pcat-new" role="group" aria-label="Категория нового варианта">
              {cats.list.map((c) => <button key={c} type="button" className={'pcat-chip wide' + (newCat === c ? ' on' : '')} onClick={() => setNewCat(c)}>{c}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ParamsBlock({ value, onChange }) {
  const { get, save } = useParamOptions()
  const allCats = useParamCats()
  const [fold, setFold] = useState(false)
  const v = value || {}
  return (
    <div className="wide params">
      <button type="button" className="params-head" onClick={() => setFold((x) => !x)} aria-expanded={!fold}>
        Parameters
        <svg viewBox="0 0 12 8" width="11" height="8" aria-hidden="true" style={{ transform: fold ? 'rotate(-90deg)' : 'none' }}><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {!fold && (
        <div className="params-grid">
          {PARAMS.map((p) => {
            const opts = get(p)
            return (
              <ParamPicker
                key={p.key}
                label={p.label}
                value={v[p.key] || ''}
                options={opts}
                onChange={(x) => onChange({ ...v, [p.key]: x })}
                onAdd={(x, c) => { if (!opts.includes(x)) save(p.key, [...opts, x]); if (c && CAT_PARAMS[p.key]) setCat(p.key, x, c) }}
                onRemove={(x) => save(p.key, opts.filter((o) => o !== x))}
                cats={CAT_PARAMS[p.key] ? { list: CAT_PARAMS[p.key], map: Object.fromEntries(opts.map((o) => [o, catOf(allCats, p.key, o)])), onSet: (o, c) => setCat(p.key, o, c) } : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// Стиль сделки — тот же выпадающий список, но вынесен в верхний ряд формы
export const STYLE = { key: 'style', label: 'Стиль', defaults: ['Swing', 'Intraweek'] }

export function StylePicker({ value, onChange }) {
  const { get, save } = useParamOptions()
  const opts = get(STYLE)
  return (
    <ParamPicker
      label={STYLE.label}
      value={value || ''}
      options={opts}
      onChange={onChange}
      onAdd={(x) => !opts.includes(x) && save(STYLE.key, [...opts, x])}
      onRemove={(x) => save(STYLE.key, opts.filter((o) => o !== x))}
    />
  )
}

// Проп-счета: название + размер. Размер нужен, чтобы считать Net Result в % и Risk Reward.
export const ACC_KEY = 'accounts'

export function AccountPicker({ value, onChange }) {
  const row = useLiveQuery(() => db.meta.get(ACC_KEY), [], undefined)
  const all = row?.value || []
  const list = all.filter((a) => !a.archived) // архивные счета в выбор не попадают
  const saveList = (v) => db.meta.put({ key: ACC_KEY, value: v })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [size, setSize] = useState('')
  const [alignRight, setAlignRight] = useState(false)
  const wrap = useRef(null)

  // Список шире колонки: если справа не хватает места внутри карточки — раскрываем влево
  const toggle = () => {
    if (!open && wrap.current) {
      const r = wrap.current.getBoundingClientRect()
      const box = wrap.current.closest('.card, .modal')
      const limit = box ? box.getBoundingClientRect().right : window.innerWidth
      setAlignRight(r.left + 330 > limit - 8)
    }
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const off = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc, true) }
  }, [open])

  const pick = (a) => { onChange(a ? a.name : '', a ? a.size : ''); setOpen(false) }
  const add = () => {
    const n = name.trim()
    const sz = toNum(size)
    if (!n || !(sz > 0)) return
    const old = all.find((a) => a.name === n)
    const acc = { ...(old || {}), name: n, size: sz, archived: false }
    saveList([...all.filter((a) => a.name !== n), acc])
    setName('')
    setSize('')
    pick(acc)
  }
  const fmtSize = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' $'

  // Сумма на счёте = размер счёта + результат всех его сделок (в том числе той, что правят сейчас).
  // Выше размера счёта — зелёная, ниже — красная.
  const trades = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray(), [], [])
  const balanceOf = (a) => {
    const size = toNum(a.size) || 0
    const bal = size + summarize(trades.filter((t) => t.account === a.name)).totalPnl
    return { bal, cls: bal > size + 0.005 ? 'up' : bal < size - 0.005 ? 'down' : '' }
  }
  const cur = value ? list.find((a) => a.name === value) : null
  const curBal = cur ? balanceOf(cur) : null

  return (
    <div className="pbox" ref={wrap}>
      <span className="plabel">Account</span>
      <button type="button" className={'pbtn' + (value ? ' set' : '')} onClick={toggle} aria-expanded={open}>
        <span>
          {value || 'Выбрать'}
          {curBal && <span className={'psub ' + curBal.cls}>{fmtSize(curBal.bal)}</span>}
        </span>
        <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className={'plist plist-wide' + (alignRight ? ' right' : '')} role="listbox">
          <div className="plist-items">
            {value && <button type="button" className="popt clear" onClick={() => pick(null)}>Очистить</button>}
            {list.length === 0 && <div className="pempty">Счетов пока нет. Добавь первый ниже.</div>}
            {list.map((a) => {
              const b = balanceOf(a)
              return (
              <div className="prow" key={a.name}>
                <button type="button" role="option" aria-selected={a.name === value} className={'popt' + (a.name === value ? ' sel' : '')} onClick={() => pick(a)}>
                  {a.name} <span className={'psub ' + b.cls} title={'Размер счёта: ' + fmtSize(a.size)}>{fmtSize(b.bal)}</span>
                </button>
                <button type="button" className="pdel" title="Удалить счёт" aria-label={'Удалить ' + a.name} onClick={() => saveList(all.filter((x) => x.name !== a.name))}>✕</button>
              </div>
              )
            })}
          </div>
          <div className="padd padd-acc">
            <input value={name} placeholder="Название" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
            <input value={size} placeholder="Размер, $" inputMode="decimal" onChange={(e) => setSize(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
            <button type="button" className="small" onClick={add} disabled={!name.trim() || !(toNum(size) > 0)}>+</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Привязка сделки к недельному плану: список планов, самые свежие недели сверху,
// планы по выбранному инструменту — выше остальных в своей неделе.
export function PlanPicker({ value, symbol, onChange }) {
  const plans = useLiveQuery(() => db.plans.filter((p) => !p.deleted).toArray(), [], [])
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return
    const off = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc, true) }
  }, [open])

  const toggle = () => {
    if (!open && wrap.current) {
      const r = wrap.current.getBoundingClientRect()
      const box = wrap.current.closest('.card, .modal')
      const limit = box ? box.getBoundingClientRect().right : window.innerWidth
      setAlignRight(r.left + 330 > limit - 8)
    }
    setOpen((o) => !o)
  }

  const q = norm(symbol || '')
  const sorted = [...plans].sort((a, b) => {
    if (a.weekStart !== b.weekStart) return a.weekStart < b.weekStart ? 1 : -1
    const am = q && norm(a.symbol) === q ? 0 : 1
    const bm = q && norm(b.symbol) === q ? 0 : 1
    return am - bm || (a.createdAt || 0) - (b.createdAt || 0)
  })
  const cur = plans.find((p) => p.id === value)
  const label = (p) => `${p.symbol || 'Общий план'}`

  return (
    <div className="pbox" ref={wrap}>
      <span className="plabel">План недели</span>
      <button type="button" className={'pbtn' + (cur ? ' set' : '')} onClick={toggle} aria-expanded={open}>
        <span>{cur ? `${label(cur)} · ${weekLabel(cur.weekStart).replace(/ \d{4}$/, '')}` : 'Без плана'}</span>
        <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className={'plist plist-wide' + (alignRight ? ' right' : '')} role="listbox">
          <div className="plist-items">
            {value && <button type="button" className="popt clear" onClick={() => { onChange(''); setOpen(false) }}>Отвязать от плана</button>}
            {sorted.length === 0 && <div className="pempty">Планов пока нет. Создай план на вкладке Weekly Plan.</div>}
            {sorted.map((p) => (
              <button
                type="button"
                key={p.id}
                role="option"
                aria-selected={p.id === value}
                className={'popt popt-plan' + (p.id === value ? ' sel' : '')}
                onClick={() => { onChange(p.id); setOpen(false) }}
              >
                {p.symbol && <SymbolIcon symbol={p.symbol} size={16} />}
                <span>{label(p)}</span>
                <span className="psub">{weekLabel(p.weekStart).replace(/ \d{4}$/, '')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
