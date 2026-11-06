import React, { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'

// Параметры сделки: у каждого свой список вариантов. Список можно пополнять и чистить прямо в выпадашке,
// он хранится в базе (meta) и общий для всех сделок.
export const PARAMS = [
  { key: 'pointA', label: 'Point A', defaults: ['Weekly High', 'Weekly Low', 'Daily High', 'Daily Low', 'Previous Day High', 'Previous Day Low', 'Asia High', 'Asia Low', 'London High', 'London Low'] },
  { key: 'pointB', label: 'Point B', defaults: ['Weekly High', 'Weekly Low', 'Daily High', 'Daily Low', 'Previous Day High', 'Previous Day Low', 'Asia High', 'Asia Low', 'London High', 'London Low'] },
  { key: 'positionType', label: 'Position Type', defaults: ['Scalp', 'Intraday', 'Swing'] },
  { key: 'priceDelivery', label: 'Price Delivery', defaults: ['Bullish', 'Bearish', 'Expansion', 'Retracement', 'Reversal', 'Consolidation'] },
  { key: 'entryModel', label: 'Entry Model', defaults: ['FVG', 'Order Block', 'Breaker', 'MSS', 'Liquidity Sweep', 'Retest', 'Breakout'] },
  { key: 'entryTf', label: 'Entry TF', defaults: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'] },
]

const META_KEY = 'paramOptions'

export function useParamOptions() {
  const row = useLiveQuery(() => db.meta.get(META_KEY), [], undefined)
  const saved = row?.value || {}
  const get = (p) => saved[p.key] || p.defaults
  const save = (key, list) => db.meta.put({ key: META_KEY, value: { ...saved, [key]: list } })
  return { get, save }
}

function ParamPicker({ label, value, options, onChange, onAdd, onRemove }) {
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
