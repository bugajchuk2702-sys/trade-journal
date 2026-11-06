import React, { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addTrade, updateTrade, removeTrade, exportJson, importJson } from '../db.js'
import { calcTrade, fmt } from '../stats.js'
import { SymbolInput, SymbolIcon } from '../components/Symbols.jsx'

const toLocalInput = (ts) => {
  const d = new Date(ts)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const emptyForm = () => ({
  symbol: '',
  side: 'long',
  openedAt: toLocalInput(Date.now()),
  closedAt: '',
  entry: '',
  exit: '',
  size: '',
  stop: '',
  take: '',
  fees: '',
  tags: '',
  notes: '',
})

const sign = (n) => (n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

function TradeForm({ initial, onSubmit, onCancel }) {
  const [f, setF] = useState(initial || emptyForm())
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = (e) => {
    e.preventDefault()
    onSubmit({
      symbol: f.symbol.trim().toUpperCase(),
      side: f.side,
      openedAt: f.openedAt ? new Date(f.openedAt).getTime() : Date.now(),
      closedAt: f.closedAt ? new Date(f.closedAt).getTime() : null,
      entry: f.entry,
      exit: f.exit,
      size: f.size,
      stop: f.stop,
      take: f.take,
      fees: f.fees,
      tags: f.tags,
      notes: f.notes,
    })
    if (!initial) setF(emptyForm())
  }

  return (
    <form className="trade" onSubmit={submit}>
      <label>Инструмент
        <SymbolInput required value={f.symbol} onChange={(v) => set('symbol')({ target: { value: v } })} placeholder="Выбери" />
      </label>
      <label>Направление
        <select value={f.side} onChange={set('side')}>
          <option value="long">Лонг</option>
          <option value="short">Шорт</option>
        </select>
      </label>
      <label>Открыта
        <input type="datetime-local" value={f.openedAt} onChange={set('openedAt')} />
      </label>
      <label>Закрыта
        <input type="datetime-local" value={f.closedAt} onChange={set('closedAt')} />
      </label>
      <label>Цена входа
        <input required type="number" step="any" value={f.entry} onChange={set('entry')} />
      </label>
      <label>Цена выхода
        <input type="number" step="any" value={f.exit} onChange={set('exit')} placeholder="пусто = открыта" />
      </label>
      <label>Объём
        <input required type="number" step="any" value={f.size} onChange={set('size')} />
      </label>
      <label>Стоп
        <input type="number" step="any" value={f.stop} onChange={set('stop')} />
      </label>
      <label>Тейк
        <input type="number" step="any" value={f.take} onChange={set('take')} />
      </label>
      <label>Комиссии, всего
        <input type="number" step="any" value={f.fees} onChange={set('fees')} />
      </label>
      <label className="wide">Теги (через запятую)
        <input value={f.tags} onChange={set('tags')} placeholder="пробой, по тренду" />
      </label>
      <label className="wide">Заметки
        <textarea value={f.notes} onChange={set('notes')} />
      </label>
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button type="submit">{initial ? 'Сохранить' : 'Добавить сделку'}</button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Отмена</button>}
      </div>
    </form>
  )
}

export default function Trades() {
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState('')
  const fileRef = useRef(null)

  const trades = useLiveQuery(() => db.trades.where('deleted').equals(0).reverse().sortBy('openedAt'), [], [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return trades
    return trades.filter((t) => `${t.symbol} ${t.tags} ${t.notes}`.toLowerCase().includes(q))
  }, [trades, query])

  const doExport = async () => {
    const blob = new Blob([await exportJson()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `trade-journal-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const doImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const n = await importJson(await file.text())
      alert(`Импортировано записей: ${n}`)
    } catch (err) {
      alert('Ошибка импорта: ' + err.message)
    }
    e.target.value = ''
  }

  return (
    <>
      <section className="card">
        <h2>{editing ? 'Редактировать сделку' : 'Новая сделка'}</h2>
        {editing ? (
          <TradeForm
            key={editing.id}
            initial={{
              ...emptyForm(),
              ...editing,
              openedAt: toLocalInput(editing.openedAt),
              closedAt: editing.closedAt ? toLocalInput(editing.closedAt) : '',
            }}
            onSubmit={async (d) => {
              await updateTrade(editing.id, d)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <TradeForm onSubmit={addTrade} />
        )}
      </section>

      <section className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>Сделки</h2>
          <input placeholder="Поиск: тикер, тег, заметка" value={query} onChange={(e) => setQuery(e.target.value)} />
          <span className="spacer" />
          <button className="ghost small" onClick={doExport}>Экспорт JSON</button>
          <button className="ghost small" onClick={() => fileRef.current?.click()}>Импорт JSON</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={doImport} />
        </div>
        {filtered.length === 0 ? (
          <div className="empty">Пока нет сделок</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th className="left">Дата</th>
                  <th className="left">Инструмент</th>
                  <th className="left">Сторона</th>
                  <th>Вход</th>
                  <th>Выход</th>
                  <th>Объём</th>
                  <th>PnL</th>
                  <th>R</th>
                  <th className="left">Теги</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const c = calcTrade(t)
                  return (
                    <tr key={t.id} title={t.notes || ''}>
                      <td className="left">{new Date(t.openedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="left"><span className="symcell"><SymbolIcon symbol={t.symbol} size={20} />{t.symbol}</span></td>
                      <td className={'left ' + t.side}>{t.side === 'long' ? 'Лонг' : 'Шорт'}</td>
                      <td>{fmt(t.entry, 4)}</td>
                      <td>{c.closed ? fmt(t.exit, 4) : 'открыта'}</td>
                      <td>{fmt(t.size, 4)}</td>
                      <td className={sign(c.pnl)}>{fmt(c.pnl)}</td>
                      <td className={sign(c.r)}>{fmt(c.r)}</td>
                      <td className="left">
                        {(t.tags || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => (
                          <span className="tag" key={x}>{x}</span>
                        ))}
                      </td>
                      <td>
                        <button className="ghost small" onClick={() => { setEditing(t); document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' }) }}>Изм.</button>{' '}
                        <button className="danger small" onClick={() => confirm('Удалить сделку?') && removeTrade(t.id)}>✕</button>
                      </td>
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
