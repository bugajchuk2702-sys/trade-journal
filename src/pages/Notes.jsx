import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addNote, updateNote, removeNote } from '../db.js'
import { weekLabel } from '../week.js'
import DateInput from '../components/DateInput.jsx'
import NotesCard from '../components/NotesCard.jsx'
import LinkPicker, { LinkRow } from '../components/LinkPicker.jsx'
import { toLocalDate } from './Trades.jsx'

const DAY = 86400000
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime() }
const shortDate = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

const tradeLabel = (t) => `${t.symbol || 'Без инструмента'} · ${t.side === 'long' ? 'Лонг' : 'Шорт'} · ${shortDate(t.openedAt)}`
const planLabel = (p) => `${p.symbol || 'Общий'} · ${weekLabel(p.weekStart).replace(/ \d{4}$/, '')}`
const planTs = (p) => Date.parse(p.weekStart + 'T12:00')

// Сколько дней назад: «сегодня», «вчера», «4 дн. назад»
const ago = (ts) => {
  const n = Math.max(0, Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY))
  return n === 0 ? 'сегодня' : n === 1 ? 'вчера' : `${n} дн. назад`
}

// Где используется заметка: привязанные трейды и планы, последнее использование
export function noteUsage(note, trades, plans) {
  const ts = trades.filter((t) => (note.tradeIds || []).includes(t.id))
  const ps = plans.filter((p) => (note.planIds || []).includes(p.id))
  const dates = [...ts.map((t) => t.closedAt || t.openedAt), ...ps.map(planTs)].filter((x) => x && !Number.isNaN(x))
  return { ts, ps, last: dates.length ? Math.max(...dates) : null }
}

// В каждой карточке: текст + скриншоты (вставка Ctrl+V прямо в поле), поля text / text+'Imgs'
const SECTIONS = [
  ['body', 'Описание', 'Что это и как работает'],
  ['important', 'Важно', 'На что обратить внимание, чего не делать'],
  ['example', 'Пример', 'Пример использования'],
].map(([key, title, ph]) => [key, title, ph + ' · Ctrl+V — вставить скриншот'])

function NoteEditor({ note, trades, plans, go, onDelete }) {
  // body — «Описание» (старый общий текст остаётся здесь), important — «Важно», example — «Пример»
  const [f, setF] = useState({
    title: note.title || '', body: note.body || '', important: note.important || '', example: note.example || '',
    bodyImgs: note.bodyImgs || [], importantImgs: note.importantImgs || [], exampleImgs: note.exampleImgs || [],
  })
  const latest = useRef(f)
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
    setF((x) => ({ ...x, ...patch }))
    latest.current = { ...latest.current, ...patch }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      updateNote(note.id, latest.current)
    }, 500)
  }

  const u = noteUsage(note, trades, plans)
  const tradeIds = note.tradeIds || []
  const planIds = note.planIds || []
  const freeTrades = trades.filter((t) => !tradeIds.includes(t.id)).sort((a, b) => b.openedAt - a.openedAt)
  const freePlans = plans.filter((p) => !planIds.includes(p.id)).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))

  return (
    <div className="note-col">
    <section className="card">
      <div className="toolbar">
        <input
          style={{ maxWidth: 'none', flex: 1, fontWeight: 600 }}
          value={f.title}
          placeholder="Заголовок"
          onChange={(e) => change({ title: e.target.value })}
        />
        <button className="danger" onClick={() => confirm('Удалить заметку?') && onDelete()}>Удалить</button>
      </div>

      <div className="nprops">
        <div className="nprop">
          <div className="k">Date</div>
          <div className="v">
            <DateInput value={note.date || toLocalDate(note.createdAt)} onChange={(e) => e.target.value && updateNote(note.id, { date: e.target.value })} />
          </div>
        </div>
        <div className="nprop">
          <div className="k">Popularity</div>
          <div className="v">
            {u.ts.length + u.ps.length === 0 ? (
              <span className="muted">Не используется</span>
            ) : (
              <>
                <span className="pt">В трейдах: {u.ts.length}</span>
                <span className="muted">/</span>
                <span className="pp">В планах: {u.ps.length}</span>
              </>
            )}
          </div>
        </div>
        <div className="nprop">
          <div className="k">Latest Usage</div>
          <div className="v">
            {u.last ? ago(u.last) : <span className="muted">—</span>}
          </div>
        </div>
        <div className="nprop">
          <div className="k">Archive</div>
          <div className="v">
            <label className="archchk">
              <input type="checkbox" checked={!!note.archived} onChange={(e) => updateNote(note.id, { archived: e.target.checked })} />
              <span>{note.archived ? 'В архиве' : 'Нет'}</span>
            </label>
          </div>
        </div>
      </div>

      <LinkRow
        label="Trades"
        chips={u.ts.sort((a, b) => b.openedAt - a.openedAt).map((t) => ({
          id: t.id,
          label: tradeLabel(t),
          onOpen: () => go('trades', { tradeId: t.id }),
          onRemove: () => updateNote(note.id, { tradeIds: tradeIds.filter((x) => x !== t.id) }),
        }))}
      >
        <LinkPicker
          label="+ Трейд"
          items={freeTrades.map((t) => ({ id: t.id, label: tradeLabel(t) }))}
          empty="Свободных трейдов нет"
          onPick={(i) => updateNote(note.id, { tradeIds: [...tradeIds, i.id] })}
        />
      </LinkRow>
      <LinkRow
        label="Plans"
        chips={u.ps.sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)).map((p) => ({
          id: p.id,
          label: planLabel(p),
          onOpen: () => go('plan', { weekStart: p.weekStart, planId: p.id }),
          onRemove: () => updateNote(note.id, { planIds: planIds.filter((x) => x !== p.id) }),
        }))}
      >
        <LinkPicker
          label="+ План"
          items={freePlans.map((p) => ({ id: p.id, label: planLabel(p) }))}
          empty="Свободных планов нет"
          onPick={(i) => updateNote(note.id, { planIds: [...planIds, i.id] })}
        />
      </LinkRow>

    </section>

    {SECTIONS.map(([key, title, ph]) => (
      <section className="card note-sec" key={key}>
        <div className="shot-head"><h2>{title}</h2></div>
        <NotesCard
          bare
          text={f[key]}
          imgs={f[key + 'Imgs']}
          placeholder={ph}
          onText={(v) => change({ [key]: v })}
          onAdd={(urls) => change({ [key + 'Imgs']: [...latest.current[key + 'Imgs'], ...urls] })}
          onRemoveAt={(i) => change({ [key + 'Imgs']: latest.current[key + 'Imgs'].filter((_, j) => j !== i) })}
        />
      </section>
    ))}
    <div className="hint">сохраняется автоматически</div>
    </div>
  )
}

export default function Notes({ params, go }) {
  const notes = useLiveQuery(() => db.notes.where('deleted').equals(0).reverse().sortBy('updatedAt'), [], [])
  const trades = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray(), [], [])
  const plans = useLiveQuery(() => db.plans.where('deleted').equals(0).toArray(), [], [])
  const [selId, setSelId] = useState(params?.noteId || null)
  const [view, setView] = useState('active') // active | archive
  const [q, setQ] = useState('')

  // Пришли по ссылке с трейда / плана: открываем нужную заметку (и нужный список)
  // (каждый вызов go() даёт новый params — повторный клик по вкладке Notes возвращает к списку)
  useEffect(() => {
    setSelId(params?.noteId || null)
  }, [params])
  const loaded = notes.length > 0
  useEffect(() => {
    const n = params?.noteId && notes.find((x) => x.id === params.noteId)
    if (n) setView(n.archived ? 'archive' : 'active')
  }, [params?.noteId, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const archivedCount = notes.filter((n) => n.archived).length
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = notes.filter((n) => (view === 'archive' ? n.archived : !n.archived))
    return s ? list.filter((n) => `${n.title} ${n.body} ${n.important || ''} ${n.example || ''}`.toLowerCase().includes(s)) : list
  }, [notes, q, view])

  const selected = notes.find((n) => n.id === selId) || null

  const create = async () => {
    const n = await addNote()
    setView('active')
    setSelId(n.id)
  }

  // Открыта заметка: целая страница с кнопкой «назад»
  if (selected) {
    return (
      <>
        <div className="page-title">
          <h2>Notes</h2>
          <span className="spacer" />
          <button type="button" className="ghost" onClick={() => setSelId(null)}>← Все заметки</button>
        </div>
        <NoteEditor
          key={selected.id}
          note={selected}
          trades={trades}
          plans={plans}
          go={go}
          onDelete={async () => {
            await removeNote(selected.id)
            setSelId(null)
          }}
        />
      </>
    )
  }

  // Список заметок: заметка открывается по клику на строку
  return (
    <>
      <div className="page-title">
        <h2>Notes</h2>
      </div>
      <section className="card">
        <div className="toolbar">
          <input style={{ maxWidth: 'none', flex: 1 }} placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={create}>+ Новая заметка</button>
        </div>
        <div className="chips" style={{ margin: '12px 0 14px' }}>
          <button type="button" className={'chip' + (view === 'active' ? ' active' : '')} onClick={() => setView('active')}>Notes</button>
          <button type="button" className={'chip' + (view === 'archive' ? ' active' : '')} onClick={() => setView('archive')}>
            Archive{archivedCount > 0 && <span className="chip-n">{archivedCount}</span>}
          </button>
        </div>
        {filtered.length === 0 ? (
          <div className="empty">{view === 'archive' ? 'Архив пуст' : q ? 'Ничего не найдено' : 'Заметок пока нет. Нажми «+ Новая заметка»'}</div>
        ) : (
          <div className="tablewrap">
            <table className="notes-table">
              <thead>
                <tr>
                  <th className="left">Название</th>
                  <th className="left">Date</th>
                  <th className="left">Popularity</th>
                  <th className="left">Latest Usage</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((n) => {
                  const u = noteUsage(n, trades, plans)
                  const preview = (n.body || n.important || n.example || '').replace(/\s+/g, ' ').slice(0, 90)
                  return (
                    <tr key={n.id} tabIndex={0} onClick={() => setSelId(n.id)} onKeyDown={(e) => e.key === 'Enter' && setSelId(n.id)}>
                      <td className="left">
                        <div className="nt">{n.title || 'Без названия'}</div>
                        {preview && <div className="np">{preview}</div>}
                      </td>
                      <td className="left">{new Date(n.date ? n.date + 'T12:00' : n.updatedAt).toLocaleDateString('ru-RU')}</td>
                      <td className="left">
                        {u.ts.length + u.ps.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className="nprop"><span className="v">
                            <span className="pt">В трейдах: {u.ts.length}</span>
                            <span className="muted">/</span>
                            <span className="pp">В планах: {u.ps.length}</span>
                          </span></span>
                        )}
                      </td>
                      <td className="left">{u.last ? ago(u.last) : <span className="muted">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
