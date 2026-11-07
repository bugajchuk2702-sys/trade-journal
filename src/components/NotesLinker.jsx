import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addNote, updateNote } from '../db.js'
import LinkPicker from './LinkPicker.jsx'

// Заметки, привязанные к трейду или плану недели, и добавление новых.
// Связь хранится в самой заметке (tradeIds / planIds), поэтому видна с обеих сторон.
export default function NotesLinker({ kind, id, go }) {
  const field = kind === 'trade' ? 'tradeIds' : 'planIds'
  const notes = useLiveQuery(() => db.notes.where('deleted').equals(0).toArray(), [], [])
  const has = (n) => (n[field] || []).includes(id)

  const linked = notes.filter(has).sort((a, b) => a.createdAt - b.createdAt)
  const free = notes
    .filter((n) => !n.archived && !has(n))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((n) => ({
      id: n.id,
      label: n.title || 'Без названия',
      sub: new Date(n.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      note: n,
    }))

  const link = (n) => updateNote(n.id, { [field]: [...(n[field] || []), id] })
  const unlink = (n) => updateNote(n.id, { [field]: (n[field] || []).filter((x) => x !== id) })
  // Новая заметка сразу привязана; открываем её, чтобы написать текст
  const create = async () => {
    const n = await addNote({ [field]: [id] })
    if (go) go('notes', { noteId: n.id })
  }

  const preview = (n) => (n.body || n.important || n.example || '').replace(/\s+/g, ' ').trim().slice(0, 110)

  return (
    <div className="nl-box">
      <div className="nl-head">
        <span className="nl-title">Заметки</span>
        {linked.length > 0 && <span className="nl-count">{linked.length}</span>}
        <LinkPicker
          label="+ Заметка"
          items={free}
          empty="Свободных заметок нет"
          onPick={(i) => link(i.note)}
          onCreate={create}
          createLabel="+ Создать новую заметку"
        />
      </div>
      {linked.length === 0 ? (
        <div className="nl-empty">К {kind === 'trade' ? 'этому трейду' : 'этому плану'} заметки не привязаны</div>
      ) : (
        <div className="nl-list">
          {linked.map((n) => (
            <div className="nl-item" key={n.id}>
              <button type="button" className="nl-open" onClick={go ? () => go('notes', { noteId: n.id }) : undefined} title="Открыть заметку">
                <span className="nl-name">{n.title || 'Без названия'}</span>
                {preview(n) && <span className="nl-prev">{preview(n)}</span>}
              </button>
              <button type="button" className="nl-x" onClick={() => unlink(n)} title="Убрать связь" aria-label={'Убрать ' + (n.title || 'заметку')}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
