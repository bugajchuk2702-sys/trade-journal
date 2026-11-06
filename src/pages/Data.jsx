import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { ACC_KEY } from '../components/Params.jsx'
import { calcTrade, fmt, summarize, toNum } from '../stats.js'

// Раздел Data: справочники и сводки по данным журнала. Сейчас в нём один подраздел — Accounts.
const SECTIONS = [{ id: 'accounts', label: 'Accounts' }]

const sign = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '')
const signed = (n, d = 2, suffix = '') => (n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + fmt(n, d) + suffix)
const money = (n) => Number(n).toLocaleString('ru-RU') + ' $'

function Accounts() {
  const row = useLiveQuery(() => db.meta.get(ACC_KEY), [], undefined)
  const list = row?.value || []
  const trades = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray(), [], [])

  const [name, setName] = useState('')
  const [size, setSize] = useState('')
  const [editing, setEditing] = useState(null) // имя редактируемого счёта
  const [draft, setDraft] = useState({ name: '', size: '' })
  const [error, setError] = useState('')

  const saveList = (v) => db.meta.put({ key: ACC_KEY, value: v })

  // Счета из списка + счета, которые встречаются только в сделках (после удаления из списка)
  const rows = useMemo(() => {
    const by = new Map()
    for (const t of trades) {
      if (!t.account) continue
      if (!by.has(t.account)) by.set(t.account, [])
      by.get(t.account).push(t)
    }
    const make = (accName, accSize, inList) => {
      const own = by.get(accName) || []
      const s = summarize(own)
      const net = own.reduce((sum, t) => sum + (calcTrade(t).netPct || 0), 0)
      return { name: accName, size: accSize, inList, count: s.count, winrate: s.winrate, pnl: s.totalPnl, net, avgR: s.avgR, hasTrades: own.length > 0 }
    }
    const out = list.map((a) => make(a.name, a.size, true))
    for (const [n, own] of by) {
      if (!list.some((a) => a.name === n)) out.push(make(n, toNum(own[own.length - 1].accountSize), false))
    }
    return out
  }, [list, trades])

  const canAdd = name.trim() && toNum(size) > 0
  const add = async (e) => {
    e.preventDefault()
    if (!canAdd) return
    const n = name.trim()
    await saveList([...list.filter((a) => a.name !== n), { name: n, size: toNum(size) }])
    setName('')
    setSize('')
    setError('')
  }

  const startEdit = (r) => { setEditing(r.name); setDraft({ name: r.name, size: String(r.size ?? '') }); setError('') }
  const cancelEdit = () => { setEditing(null); setError('') }
  const saveEdit = async () => {
    const n = draft.name.trim()
    const sz = toNum(draft.size)
    if (!n || !(sz > 0)) { setError('Нужны название и размер больше нуля'); return }
    if (n !== editing && list.some((a) => a.name === n)) { setError('Счёт с таким названием уже есть'); return }
    // Переименование тянем за собой в сделки, иначе они «отвяжутся» от счёта
    if (n !== editing) {
      await db.trades.toCollection().filter((t) => t.account === editing).modify({ account: n, updatedAt: Date.now(), synced: 0 })
    }
    const next = list.some((a) => a.name === editing)
      ? list.map((a) => (a.name === editing ? { name: n, size: sz } : a))
      : [...list, { name: n, size: sz }]
    await saveList(next)
    setEditing(null)
    setError('')
  }
  const remove = (r) => {
    const msg = r.hasTrades
      ? `Удалить счёт «${r.name}» из списка? Сделки по нему останутся.`
      : `Удалить счёт «${r.name}»?`
    if (confirm(msg)) saveList(list.filter((a) => a.name !== r.name))
  }

  return (
    <>
      <section className="card">
        <form className="acc-add" onSubmit={add}>
          <label>Название
            <input value={name} placeholder="FTMO 100k" autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </label>
          <label>Размер, $
            <input value={size} placeholder="100000" inputMode="decimal" autoComplete="off" onChange={(e) => setSize(e.target.value)} />
          </label>
          <button type="submit" disabled={!canAdd}>+ Добавить счёт</button>
        </form>
      </section>

      <section className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>Счета</h2>
        </div>
        {error && <div className="acc-error">{error}</div>}
        {rows.length === 0 ? (
          <div className="empty">Счетов пока нет. Добавь первый выше — он появится в списке Account при создании сделки.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th className="left">Счёт</th>
                  <th>Размер</th>
                  <th>Сделок</th>
                  <th>Winrate</th>
                  <th>PnL, $</th>
                  <th>Net</th>
                  <th>Avg R</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isEdit = editing === r.name
                  const key = (e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } else if (e.key === 'Escape') cancelEdit() }
                  return (
                    <tr key={r.name}>
                      <td className="left">
                        {isEdit
                          ? <input className="acc-edit" value={draft.name} autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={key} />
                          : <>{r.name}{!r.inList && <span className="acc-note"> · нет в списке</span>}</>}
                      </td>
                      <td>
                        {isEdit
                          ? <input className="acc-edit acc-edit-size" value={draft.size} inputMode="decimal" onChange={(e) => setDraft({ ...draft, size: e.target.value })} onKeyDown={key} />
                          : r.size > 0 ? money(r.size) : '—'}
                      </td>
                      <td>{r.count}</td>
                      <td>{r.winrate == null ? '—' : fmt(r.winrate, 1) + '%'}</td>
                      <td className={sign(r.pnl)}>{r.count ? signed(r.pnl) : '—'}</td>
                      <td className={sign(r.net)}>{r.count && r.net ? signed(r.net, 2, '%') : '—'}</td>
                      <td className={sign(r.avgR)}>{fmt(r.avgR)}</td>
                      <td>
                        {isEdit ? (
                          <>
                            <button type="button" onClick={saveEdit}>Сохранить</button>{' '}
                            <button type="button" className="ghost small" onClick={cancelEdit}>Отмена</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="ghost small" onClick={() => startEdit(r)}>Изм.</button>{' '}
                            {r.inList && <button type="button" className="danger small" onClick={() => remove(r)} aria-label={'Удалить ' + r.name}>✕</button>}
                          </>
                        )}
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

export default function Data() {
  const [section, setSection] = useState('accounts')
  return (
    <>
      <div className="page-title">
        <h2>Data</h2>
      </div>
      <div className="chips">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={'chip' + (section === s.id ? ' active' : '')} onClick={() => setSection(s.id)}>{s.label}</button>
        ))}
      </div>
      {section === 'accounts' && <Accounts />}
    </>
  )
}
