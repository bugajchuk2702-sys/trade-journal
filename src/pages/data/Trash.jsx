import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db.js'
import { weekLabel } from '../../week.js'

// Корзина: удалённое лишь помечается флагом, поэтому его можно вернуть
const when = (t) => (t ? new Date(t).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '')
const day = (ms) => (ms ? new Date(ms).toLocaleDateString('ru-RU') : '')

const KINDS = [
  { table: 'plans', label: 'План недели', name: (r) => `${r.symbol || '—'} · ${r.weekStart ? weekLabel(r.weekStart) : ''}` },
  { table: 'trades', label: 'Трейд', name: (r) => `${r.symbol || '—'} · ${r.side || ''} · ${day(r.openedAt)}` },
  { table: 'notes', label: 'Заметка', name: (r) => r.title || (r.body || '').slice(0, 60) || 'Без названия' },
  { table: 'payouts', label: 'Выплата', name: (r) => `${r.account || ''} · ${r.date || ''}` },
]

export default function Trash() {
  const rows = useLiveQuery(async () => {
    const out = []
    for (const k of KINDS) {
      const list = await db[k.table].filter((r) => r.deleted).toArray()
      for (const r of list) out.push({ k, r })
    }
    return out.sort((a, b) => (b.r.updatedAt || 0) - (a.r.updatedAt || 0))
  }, [])

  const restore = (k, r) => db[k.table].update(r.id, { deleted: 0, updatedAt: Date.now(), synced: 0 })

  return (
    <section className="card">
      <h3>Корзина</h3>
      <div className="hint" style={{ marginBottom: 10 }}>Удалённые планы, трейды, заметки и выплаты. «Вернуть» кладёт запись обратно на место.</div>
      {rows == null ? null : rows.length === 0 ? (
        <div className="hint">Корзина пуста.</div>
      ) : (
        <div className="trash-list">
          {rows.map(({ k, r }) => (
            <div className="trash-row" key={k.table + r.id}>
              <span className="trash-kind">{k.label}</span>
              <span className="trash-name">{k.name(r)}</span>
              <span className="hint">удалено {when(r.updatedAt)}</span>
              <button type="button" onClick={() => restore(k, r)}>Вернуть</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
