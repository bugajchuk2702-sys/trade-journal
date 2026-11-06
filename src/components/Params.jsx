import React, { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { toNum } from '../stats.js'
import { weekLabel } from '../week.js'
import { SymbolIcon, norm } from './Symbols.jsx'

// Параметры сделки: у каждого свой список вариантов. Список можно пополнять и чистить прямо в выпадашке,
// он хранится в базе (meta) и общий для всех сделок.
export const PARAMS = [
  { key: 'pointA', label: 'Point A', defaults: ['Fractal D1', 'FVG D1', '0.5 DR D1', 'IFVG D1', 'Пока не доказано обратное'] },
  { key: 'pointB', label: 'Point B', defaults: ['0.5 DR D1', 'Fractal D1', 'FVG D1', '0.5 W1'] },
  { key: 'positionType', label: 'Position Type', defaults: ['Reversal', 'Continuation'] },
  { key: 'priceDelivery', label: 'Price Delivery', defaults: ['1st POI', 'OF', 'SOF'] },
  { key: 'entryModel', label: 'Entry Model', defaults: ['DR H4 -> SNR H4', 'DR H4 -> SHIFT H4', 'SNR H4', 'SHIFT H4'] },
  { key: 'entryTf', label: 'Entry TF', defaults: ['D1', 'H4'] },
]

// v2: списки по умолчанию заменены на настоящие; старые (черновые) варианты не подхватываются
const META_KEY = 'paramOptions.v2'

export function useParamOptions() {
  const row = useLiveQuery(() => db.meta.get(META_KEY), [], undefined)
  const saved = row?.value || {}
  const get = (p) => saved[p.key] || p.defaults
  const save = (key, list) => db.meta.put({ key: META_KEY, value: { ...saved, [key]: list } })
  return { get, save }
}

export function ParamPicker({ label, value, options, onChange, onAdd, onRemove }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
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
    onAdd(v)
    setDraft('')
    pick(v)
  }

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
            {options.map((o) => (
              <div className="prow" key={o}>
                <button type="button" role="option" aria-selected={o === value} className={'popt' + (o === value ? ' sel' : '')} onClick={() => pick(o)}>{o}</button>
                <button type="button" className="pdel" title="Удалить вариант" aria-label={'Удалить ' + o} onClick={() => onRemove(o)}>✕</button>
              </div>
            ))}
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
        </div>
      )}
    </div>
  )
}

export default function ParamsBlock({ value, onChange }) {
  const { get, save } = useParamOptions()
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
                onAdd={(x) => !opts.includes(x) && save(p.key, [...opts, x])}
                onRemove={(x) => save(p.key, opts.filter((o) => o !== x))}
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
  const fmtSize = (n) => Number(n).toLocaleString('ru-RU') + ' $'

  return (
    <div className="pbox" ref={wrap}>
      <span className="plabel">Account</span>
      <button type="button" className={'pbtn' + (value ? ' set' : '')} onClick={toggle} aria-expanded={open}>
        <span>{value || 'Выбрать'}</span>
        <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className={'plist plist-wide' + (alignRight ? ' right' : '')} role="listbox">
          <div className="plist-items">
            {value && <button type="button" className="popt clear" onClick={() => pick(null)}>Очистить</button>}
            {list.length === 0 && <div className="pempty">Счетов пока нет. Добавь первый ниже.</div>}
            {list.map((a) => (
              <div className="prow" key={a.name}>
                <button type="button" role="option" aria-selected={a.name === value} className={'popt' + (a.name === value ? ' sel' : '')} onClick={() => pick(a)}>
                  {a.name} <span className="psub">{fmtSize(a.size)}</span>
                </button>
                <button type="button" className="pdel" title="Удалить счёт" aria-label={'Удалить ' + a.name} onClick={() => saveList(all.filter((x) => x.name !== a.name))}>✕</button>
              </div>
            ))}
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
