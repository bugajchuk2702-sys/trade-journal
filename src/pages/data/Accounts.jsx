import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db.js'
import { toNum } from '../../stats.js'
import AnimNum from '../../AnimNum.jsx'
import { STATUSES, accountStats, byStatus, normAcc, useAccounts } from './accounts.js'
import { Spark, StatusTag, money, pct, sign, signed } from './ui.jsx'
import Payouts from './Payouts.jsx'

const VIEWS = [['relevant', 'Relevant'], ['status', 'By Status'], ['list', 'List']]
const emptyForm = () => ({ name: '', size: '', status: 'Ongoing', target: '', ddLimit: '' })
const initials = (n) => n.split(/[\s\-_]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
const num = (v) => (v == null ? '' : Number(v).toLocaleString('ru-RU'))
const toAcc = (r) => ({ name: r.name, size: r.size, status: r.status, target: r.target, ddLimit: r.ddLimit, archived: r.archived, createdAt: r.createdAt || Date.now() })

function AccCard({ r, onEdit, onArchive, onAdopt }) {
  const st = r.st
  const prog = r.target > 0 ? Math.max(0, Math.min(100, (st.pnlPct / r.target) * 100)) : null
  const ddWarn = r.ddLimit > 0 && st.ddPct != null && st.ddPct >= r.ddLimit * 0.8
  return (
    <article className={'acc-card' + (r.status === 'Failed' ? ' dim' : '')}>
      <header className="acc-head">
        <span className="acc-ava" aria-hidden="true">{initials(r.name)}</span>
        <h3 title={r.name}>{r.name}</h3>
      </header>
      <div className="acc-bal">{money(r.balance, 2)}</div>
      <div className="acc-meta">
        <StatusTag status={r.status} />
        {r.target > 0 && <span className="acc-note">цель {num(r.target)}%</span>}
        {!r.inList && <span className="acc-note">нет в списке</span>}
      </div>
      {prog != null && (
        <div className="acc-prog" title={`Прибыль ${signed(st.pnlPct, 2, '%')} из цели ${num(r.target)}%`}>
          <div className="acc-bar"><i style={{ width: prog + '%' }} /></div>
          <b>{pct(prog)}</b>
        </div>
      )}
      <div className="acc-wl">
        <div><b>{st.count}</b><span>Trades</span></div>
        <div className={st.wins ? 'pos' : ''}><b>{st.wins}</b><span>Win</span></div>
        <div className={st.losses ? 'neg' : ''}><b>{st.losses}</b><span>Loss</span></div>
        <div className={st.be ? 'be' : ''}><b>{st.be}</b><span>BE</span></div>
      </div>
      <dl className="acc-kv">
        <div><dt>Profit</dt><dd className={sign(st.pnl)}>{signed(st.pnlPct, 2, '%')} <i>·</i> {signed(st.pnl, 0)} $</dd></div>
        <div><dt>Winrate</dt><dd>{st.winrate == null ? '—' : pct(st.winrate, 0)}</dd></div>
        <div><dt>Risk Reward</dt><dd className={sign(st.rr)}>{st.avgR == null ? '—' : <>{signed(st.rr, 2)} RR <i>·</i> avg {signed(st.avgR, 2)}</>}</dd></div>
        <div><dt>Max Drawdown</dt><dd className={ddWarn ? 'neg' : ''}>{st.ddPct == null ? '—' : pct(st.ddPct, 2)}{r.ddLimit > 0 && <span className="acc-note"> / {num(r.ddLimit)}%</span>}</dd></div>
        {r.paid > 0 && <div><dt>Payouts</dt><dd className="pos">{money(r.paid, 2)}</dd></div>}
      </dl>
      <Spark curve={st.curve} />
      <footer className="acc-foot">
        <button type="button" className="ghost small" onClick={onEdit}>Изм.</button>
        {r.inList
          ? <button type="button" className="ghost small" onClick={onArchive}>В архив</button>
          : <button type="button" className="ghost small" onClick={onAdopt}>В список</button>}
      </footer>
    </article>
  )
}

export default function Accounts() {
  const { list, save } = useAccounts()
  const trades = useLiveQuery(() => db.trades.where('deleted').equals(0).toArray(), [], [])
  const payouts = useLiveQuery(() => db.payouts.where('deleted').equals(0).toArray(), [], [])

  const [view, setView] = useState('relevant')
  const [form, setForm] = useState(null) // { orig, f }
  const [error, setError] = useState('')
  const [showArchive, setShowArchive] = useState(false)

  // Счета из списка + счета, которые есть только в сделках (например, удалены из списка)
  const rows = useMemo(() => {
    const own = new Map()
    for (const t of trades) {
      if (!t.account) continue
      if (!own.has(t.account)) own.set(t.account, [])
      own.get(t.account).push(t)
    }
    const paid = new Map()
    for (const p of payouts) if (p.account) paid.set(p.account, (paid.get(p.account) || 0) + (toNum(p.amount) || 0))
    const make = (a, inList) => {
      const st = accountStats(own.get(a.name) || [], a.size)
      return { ...a, inList, st, paid: paid.get(a.name) || 0, balance: a.size + st.pnl }
    }
    const out = list.map((a) => make(a, true))
    for (const [n, arr] of own) {
      if (!list.some((a) => a.name === n)) out.push(make(normAcc({ name: n, size: toNum(arr[arr.length - 1].accountSize) || 0 }), false))
    }
    return out
  }, [list, trades, payouts])

  const active = useMemo(() => rows.filter((r) => !r.archived).sort(byStatus), [rows])
  const archived = rows.filter((r) => r.archived)

  const total = useMemo(() => {
    const balance = active.reduce((s, r) => s + r.balance, 0)
    const pnl = active.reduce((s, r) => s + r.st.pnl, 0)
    const paidAll = payouts.reduce((s, p) => s + (toNum(p.amount) || 0), 0)
    return { balance, pnl, paidAll }
  }, [active, payouts])

  /* ---------- действия ---------- */
  const upsert = (r, patch) => {
    const acc = { ...toAcc(r), ...patch }
    return list.some((a) => a.name === r.name) ? list.map((a) => (a.name === r.name ? { ...a, ...patch } : a)) : [...list, acc]
  }
  const openNew = () => { setForm({ orig: null, f: emptyForm() }); setError('') }
  const openEdit = (r) => {
    setForm({ orig: r, f: { name: r.name, size: String(r.size || ''), status: r.status, target: r.target ? String(r.target) : '', ddLimit: r.ddLimit ? String(r.ddLimit) : '' } })
    setError('')
  }
  const setF = (k) => (e) => setForm({ ...form, f: { ...form.f, [k]: e.target.value } })

  const submit = async (e) => {
    e.preventDefault()
    const f = form.f
    const name = f.name.trim()
    const size = toNum(f.size)
    if (!name || !(size > 0)) { setError('Нужны название и размер больше нуля'); return }
    if (list.some((a) => a.name === name && a.name !== form.orig?.name)) { setError('Счёт с таким названием уже есть'); return }
    const patch = {
      name, size, status: f.status,
      target: toNum(f.target) > 0 ? toNum(f.target) : null,
      ddLimit: toNum(f.ddLimit) > 0 ? toNum(f.ddLimit) : null,
    }
    if (form.orig) {
      // Переименование тянем в сделки и выплаты, иначе они «отвяжутся» от счёта
      if (form.orig.name !== name) {
        await db.trades.toCollection().filter((t) => t.account === form.orig.name).modify({ account: name, updatedAt: Date.now(), synced: 0 })
        await db.payouts.toCollection().filter((p) => p.account === form.orig.name).modify({ account: name, updatedAt: Date.now(), synced: 0 })
      }
      const base = list.some((a) => a.name === form.orig.name) ? list : [...list, toAcc(form.orig)]
      await save(base.map((a) => (a.name === form.orig.name ? { ...a, ...patch } : a)))
    } else {
      await save([...list, { ...patch, archived: false, createdAt: Date.now() }])
    }
    setForm(null)
    setError('')
  }

  const archive = (r, v) => save(upsert(r, { archived: v }))
  const remove = (r) => {
    const msg = r.st.count || r.paid ? `Удалить счёт «${r.name}» из списка? Сделки и выплаты по нему останутся.` : `Удалить счёт «${r.name}»?`
    if (confirm(msg)) save(list.filter((a) => a.name !== r.name))
  }

  const card = (r) => (
    <AccCard key={r.name} r={r} onEdit={() => openEdit(r)} onArchive={() => archive(r, true)} onAdopt={() => save(upsert(r, {}))} />
  )
  const addTile = (
    <button key="__new" type="button" className="acc-new" onClick={openNew}>+ Новый счёт</button>
  )

  const overview = [
    ['Accounts', String(active.length), ''],
    ['Balance', money(total.balance, 2), ''],
    ['PnL', signed(total.pnl, 2) + ' $', sign(total.pnl)],
    ['Payouts', money(total.paidAll, 2), total.paidAll > 0 ? 'pos' : ''],
  ]

  return (
    <>
      <section className="card">
        <div className="recap-metrics acc-overview">
          {overview.map(([label, value, cls]) => (
            <div className="m" key={label}>
              <div className="l">{label}</div>
              <div className={'v ' + cls}><AnimNum value={value} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>Accounts</h2>
          <div className="chips period-chips">
            {VIEWS.map(([k, label]) => (
              <button key={k} type="button" className={'chip' + (view === k ? ' active' : '')} onClick={() => setView(k)}>{label}</button>
            ))}
          </div>
          <span className="spacer" />
          {form ? <button type="button" className="ghost" onClick={() => setForm(null)}>Закрыть</button> : <button type="button" onClick={openNew}>+ Новый счёт</button>}
        </div>

        {form && (
          <form className="acc-form" onSubmit={submit}>
            <label>Название<input value={form.f.name} placeholder="FTMO 100k" autoComplete="off" autoFocus onChange={setF('name')} /></label>
            <label>Размер, $<input value={form.f.size} placeholder="100000" inputMode="decimal" autoComplete="off" onChange={setF('size')} /></label>
            <label>Статус
              <select value={form.f.status} onChange={setF('status')}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>Цель, %<input value={form.f.target} placeholder="8" inputMode="decimal" autoComplete="off" onChange={setF('target')} /></label>
            <label>Лимит просадки, %<input value={form.f.ddLimit} placeholder="10" inputMode="decimal" autoComplete="off" onChange={setF('ddLimit')} /></label>
            <div className="acc-form-btns">
              <button type="submit">{form.orig ? 'Сохранить' : 'Добавить счёт'}</button>
              <button type="button" className="ghost" onClick={() => setForm(null)}>Отмена</button>
            </div>
            {error && <div className="acc-error">{error}</div>}
          </form>
        )}

        {active.length === 0 && !form && <div className="empty">Счетов пока нет. Добавь первый — он появится в списке Account при создании сделки.</div>}

        {view === 'relevant' && active.length > 0 && <div className="acc-grid">{active.map(card)}{addTile}</div>}

        {view === 'status' && active.length > 0 && (
          <div className="acc-board">
            {STATUSES.map((s) => {
              const items = active.filter((r) => r.status === s)
              if (!items.length) return null
              return (
                <div className="acc-group" key={s}>
                  <div className="acc-group-h"><StatusTag status={s} /><span>{items.length}</span></div>
                  <div className="acc-stack">{items.map(card)}</div>
                </div>
              )
            })}
          </div>
        )}

        {view === 'list' && active.length > 0 && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th className="left">Счёт</th>
                  <th className="left">Статус</th>
                  <th>Размер</th>
                  <th>Сделок</th>
                  <th>Winrate</th>
                  <th>PnL</th>
                  <th>Profit</th>
                  <th>Avg R</th>
                  <th>Max DD</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.map((r) => (
                  <tr key={r.name}>
                    <td className="left">{r.name}{!r.inList && <span className="acc-note"> · нет в списке</span>}</td>
                    <td className="left"><StatusTag status={r.status} /></td>
                    <td>{r.size > 0 ? money(r.size) : '—'}</td>
                    <td>{r.st.count}</td>
                    <td>{r.st.winrate == null ? '—' : pct(r.st.winrate, 1)}</td>
                    <td className={sign(r.st.pnl)}>{r.st.count ? signed(r.st.pnl) + ' $' : '—'}</td>
                    <td className={sign(r.st.pnlPct)}>{r.st.count ? signed(r.st.pnlPct, 2, '%') : '—'}</td>
                    <td className={sign(r.st.avgR)}>{r.st.avgR == null ? '—' : signed(r.st.avgR)}</td>
                    <td>{r.st.ddPct == null || !r.st.count ? '—' : pct(r.st.ddPct, 2)}</td>
                    <td>
                      <button type="button" className="ghost small" onClick={() => openEdit(r)}>Изм.</button>{' '}
                      {r.inList
                        ? <button type="button" className="ghost small" onClick={() => archive(r, true)}>В архив</button>
                        : <button type="button" className="ghost small" onClick={() => save(upsert(r, {}))}>В список</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Payouts accounts={rows.map((r) => ({ name: r.name, archived: r.archived }))} payouts={payouts} />

      <section className="card">
        <div className="toolbar" style={showArchive && archived.length ? undefined : { marginBottom: 0 }}>
          <h2 style={{ margin: 0 }}>Archive</h2>
          <span className="acc-note">счета, убранные кнопкой «В архив»</span>
          <span className="spacer" />
          <button type="button" className="ghost small" onClick={() => setShowArchive((v) => !v)} disabled={archived.length === 0}>
            {showArchive ? 'Скрыть' : `Показать (${archived.length})`}
          </button>
        </div>
        {archived.length === 0 && <div className="empty empty-s" style={{ paddingBottom: 0 }}>В архиве пусто</div>}
        {showArchive && archived.length > 0 && (
          <div className="tablewrap">
            <table>
              <tbody>
                {archived.map((r) => (
                  <tr key={r.name}>
                    <td className="left">{r.name}</td>
                    <td className="left"><StatusTag status={r.status} /></td>
                    <td>{r.size > 0 ? money(r.size) : '—'}</td>
                    <td className={sign(r.st.pnl)}>{r.st.count ? signed(r.st.pnl, 2) + ' $' : '—'}</td>
                    <td>
                      <button type="button" className="ghost small" onClick={() => archive(r, false)}>Вернуть</button>{' '}
                      <button type="button" className="danger small" aria-label={'Удалить ' + r.name} onClick={() => remove(r)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
