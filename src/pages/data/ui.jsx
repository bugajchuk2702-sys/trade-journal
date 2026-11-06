import React from 'react'
import { fmt } from '../../stats.js'

export const sign = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '')
export const signed = (n, d = 2, suffix = '') => (n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + fmt(n, d) + suffix)
export const money = (n, d = 0) => (n == null || !isFinite(n) ? '—' : fmt(n, d) + ' $')
export const pct = (n, d = 0) => (n == null || !isFinite(n) ? '—' : fmt(n, d) + '%')

export const StatusTag = ({ status }) => <span className={'st-tag st-' + status.toLowerCase()}>{status}</span>

// Кольцо winrate
export function Ring({ value, n }) {
  const r = 8
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <svg className={'ring ' + (n === 0 ? 'zero' : v >= 50 ? 'good' : 'bad')} width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle className="ring-track" cx="11" cy="11" r={r} />
      {v > 0 && <circle className="ring-val" cx="11" cy="11" r={r} strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 11 11)" />}
    </svg>
  )
}

// Мини-кривая капитала для карточки счёта
export function Spark({ curve }) {
  if (!curve || curve.length < 2) return null
  const vals = [0, ...curve.map((p) => p.equity)]
  const min = Math.min(...vals)
  const span = Math.max(...vals) - min || 1
  const W = 100
  const H = 34
  const d = vals
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * W).toFixed(2)} ${(H - 3 - ((v - min) / span) * (H - 6)).toFixed(2)}`)
    .join(' ')
  const up = vals[vals.length - 1] >= 0
  return (
    <svg className={'spark ' + (up ? 'up' : 'down')} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="spark-area" d={`${d} L${W} ${H} L0 ${H} Z`} />
      <path className="spark-line" d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
