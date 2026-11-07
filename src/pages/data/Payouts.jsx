import React, { useMemo, useState } from 'react'
import { addPayout, updatePayout, removePayout } from '../../db.js'
import { fmt, toNum } from '../../stats.js'
import { money } from './ui.jsx'
import DateInput from '../../components/DateInput.jsx'

const today = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}
const showDate = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('.') : s || '—')
const monthKey = (s) => (s || '').slice(0, 7)
const monthLabel = (k) => {
  const [y, m] = k.split('-').map(Number)
  if (!y || !m) return 'Без даты'
  const t = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const plural = (n) => {
  const m10 = n % 10, m100 = n % 100
  const w = m10 === 1 && m100 !== 11 ? 'выплата' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'выплаты' : 'выплат'
  return n + ' ' + w
}
const emptyForm = () => ({ date: today(), title: '', account: '', amount: '', link: '' })

function LinkCell({ href }) {
  if (!href) return <span className="acc-note">—</span>
  if (!/^https?:\/\//i.test(href)) return <span className="pay-link-text" title={href}>{href}</span>
  let host = href
  try { host = new URL(href).hostname.replace(/^www\./, '') } catch { /* оставляем как есть */ }
  return <a className="pay-link" href={href} target="_blank" rel="noopener noreferrer">{host}</a>
}

export default function Payouts({ accounts, payouts }) {
  const [view, setView] = useState('all') // all | month
  const [form, setForm] = useState(null) // { id, f }
  const [error, setError] = useState('')

  const sorted = useMemo(
    () => [...payouts].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)),
    [payouts]
  )
  const sum = (arr) => arr.reduce((s, p) => s + (toNum(p.amount) || 0), 0)
  const groups = useMemo(() => {
    const m = new Map()
    for (const p of sorted) {
      const k = monthKey(p.date)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(p)
    }
    return [...m.entries()]
  }, [sorted])

  const set = (k) => (e) => setForm({ ...form, f: { ...form.f, [k]: e.target.value } })
  const openNew = () => { setForm({ id: null, f: { ...emptyForm(), account: accounts[0]?.name || '' } }); setError('') }
  const openEdit = (p) => {
    setForm({ id: p.id, f: { date: p.date || today(), title: p.title || '', account: p.account || '', amount: String(p.amount ?? ''), link: p.link || '' } })
    setError('')
  }
  const submit = async (e) => {
    e.preventDefault()
    const f = form.f
    const amount = toNum(f.amount)
    if (!(amount > 0)) { setError('Укажи сумму выплаты больше нуля'); return }
    if (!f.date) { setError('Укажи дату'); return }
    const data = { date: f.date, title: f.title.trim(), account: f.account, amount, link: f.link.trim() }
    if (form.id) await updatePayout(form.id, data)
    else await addPayout(data)
    setForm(null)
    setError('')
  }

  const row = (p) => (
    <tr key={p.id}>
      <td className="left">{showDate(p.date)}</td>
      <td className="left">{p.title || 'Payout'}</td>
      <td className="left">{p.account ? <span className="tag">{p.account}</span> : <span className="acc-note">—</span>}</td>
      <td className="pos">{money(toNum(p.amount), 2)}</td>
      <td className="left"><LinkCell href={p.link} /></td>
      <td>
        <button type="button" className="ghost small" onClick={() => openEdit(p)}>Изм.</button>{' '}
        <button type="button" className="danger small" aria-label="Удалить выплату" onClick={() => confirm('Удалить выплату?') && removePayout(p.id)}>✕</button>
      </td>
    </tr>
  )

  return (
    <section className="card">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Payouts</h2>
        <div className="chips period-chips">
          {[['all', 'All'], ['month', 'By Month']].map(([k, label]) => (
            <button key={k} type="button" className={'chip' + (view === k ? ' active' : '')} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
        <span className="spacer" />
        {form ? <button type="button" className="ghost" onClick={() => setForm(null)}>Закрыть</button> : <button type="button" onClick={openNew}>+ Новая выплата</button>}
      </div>

      {form && (
        <form className="acc-form" onSubmit={submit}>
          <label>Дата<DateInput value={form.f.date} onChange={set('date')} /></label>
          <label>Название<input value={form.f.title} placeholder="Payout" autoComplete="off" onChange={set('title')} /></label>
          <label>Счёт
            <select value={form.f.account} onChange={set('account')}>
              <option value="">Не выбран</option>
              {accounts.map((a) => <option key={a.name} value={a.name}>{a.name}{a.archived ? ' (архив)' : ''}</option>)}
            </select>
          </label>
          <label>Сумма, $<input value={form.f.amount} placeholder="1500" inputMode="decimal" autoComplete="off" onChange={set('amount')} /></label>
          <label className="acc-wide">Подтверждение (ссылка)<input value={form.f.link} placeholder="https://…" autoComplete="off" onChange={set('link')} /></label>
          <div className="acc-form-btns">
            <button type="submit">{form.id ? 'Сохранить' : 'Добавить выплату'}</button>
            <button type="button" className="ghost" onClick={() => setForm(null)}>Отмена</button>
          </div>
          {error && <div className="acc-error">{error}</div>}
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="empty">Выплат пока нет</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th className="left">Date</th>
                <th className="left">Payout</th>
                <th className="left">Account</th>
                <th>Amount</th>
                <th className="left">Confirmation</th>
                <th />
              </tr>
            </thead>
            {view === 'all' ? (
              <tbody>{sorted.map(row)}</tbody>
            ) : (
              groups.map(([k, items]) => (
                <tbody key={k}>
                  <tr className="grp">
                    <td className="left" colSpan={3}>{monthLabel(k)}</td>
                    <td className="pos">{money(sum(items), 2)}</td>
                    <td className="left" colSpan={2}><span className="acc-note">{plural(items.length)}</span></td>
                  </tr>
                  {items.map(row)}
                </tbody>
              ))
            )}
            <tfoot>
              <tr>
                <td className="left" colSpan={3}><span className="foot-l">Count</span> {sorted.length}</td>
                <td><span className="foot-l">Sum</span> {money(sum(sorted), 2)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
