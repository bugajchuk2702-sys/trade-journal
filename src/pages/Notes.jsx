import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addNote, updateNote, removeNote } from '../db.js'

function NoteEditor({ note, onDelete }) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const latest = useRef({ title: note.title, body: note.body })
  const timer = useRef(null)

  useEffect(
    () => () => {
      // Сохраняем несохранённое при переключении заметки / страницы
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
        updateNote(note.id, latest.current)
      }
    },
    [note.id]
  )

  const change = (patch) => {
    latest.current = { ...latest.current, ...patch }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      updateNote(note.id, latest.current)
    }, 500)
  }

  return (
    <section className="card">
      <div className="toolbar">
        <input
          style={{ maxWidth: 'none', flex: 1, fontWeight: 600 }}
          value={title}
          placeholder="Заголовок"
          onChange={(e) => {
            setTitle(e.target.value)
            change({ title: e.target.value })
          }}
        />
        <button className="danger" onClick={() => confirm('Удалить заметку?') && onDelete()}>Удалить</button>
      </div>
      <textarea
        className="note-body"
        value={body}
        placeholder="Текст заметки"
        onChange={(e) => {
          setBody(e.target.value)
          change({ body: e.target.value })
        }}
      />
      <div className="hint" style={{ marginTop: 6 }}>сохраняется автоматически</div>
    </section>
  )
}

export default function Notes() {
  const notes = useLiveQuery(() => db.notes.where('deleted').equals(0).reverse().sortBy('updatedAt'), [], [])
  const [selId, setSelId] = useState(null)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? notes.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(s)) : notes
  }, [notes, q])

  const selected = notes.find((n) => n.id === selId) || null

  const create = async () => {
    const n = await addNote()
    setSelId(n.id)
  }

  return (
    <>
      <div className="page-title">
        <h2>Notes</h2>
      </div>
      <div className="notes-layout">
        <section className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
            <button onClick={create}>+ Новая</button>
          </div>
          <div className="notes-list">
            {filtered.length === 0 && <div className="empty">Заметок пока нет</div>}
            {filtered.map((n) => (
              <button key={n.id} className={'note-item' + (n.id === selId ? ' active' : '')} onClick={() => setSelId(n.id)}>
                <span className="t">{n.title || 'Без названия'}</span>
                <span className="s">
                  {new Date(n.updatedAt).toLocaleDateString('ru-RU')} · {(n.body || '').replace(/\s+/g, ' ').slice(0, 40) || 'пусто'}
                </span>
              </button>
            ))}
          </div>
        </section>

        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            onDelete={async () => {
              await removeNote(selected.id)
              setSelId(null)
            }}
          />
        ) : (
          <section className="card" style={{ margin: 0 }}>
            <div className="empty">Выбери заметку слева или создай новую</div>
          </section>
        )}
      </div>
    </>
  )
}
