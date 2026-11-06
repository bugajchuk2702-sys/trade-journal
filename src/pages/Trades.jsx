import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addTrade, updateTrade, removeTrade, exportJson, importJson } from '../db.js'
import { calcTrade, fmt, hasResult } from '../stats.js'
import { SymbolInput, SymbolIcon } from '../components/Symbols.jsx'
import { weekLabel } from '../week.js'
import ShotCard from '../components/ShotCard.jsx'
import ParamsBlock, { StylePicker, AccountPicker, PlanPicker } from '../components/Params.jsx'

export const toLocalInput = (ts) => {
  const d = new Date(ts)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export const emptyForm = () => ({
  symbol: '',
  side: 'long',
  openedAt: toLocalInput(Date.now()),
  closedAt: '',
  planId: '',
  style: '',
  account: '',
  accountSize: '',
  riskPct: '',
  pnlUsd: '',
  params: {},
  w1: '',
  d1: '',
  h4: '',
  resultImg: '',
  conclusion: '',
})

const sign = (n) => (n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

// Данные сделки из базы -> значения полей формы
export const tradeToForm = (t) => ({
  ...emptyForm(),
  ...t,
  openedAt: toLocalInput(t.openedAt),
  closedAt: t.closedAt ? toLocalInput(t.closedAt) : '',
})

const signed = (n, d = 2, suffix = '') => (n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + fmt(n, d) + suffix)

export function TradeForm({ initial, onSubmit, onCancel, hidePlan }) {
  const [f, setF] = useState(initial || emptyForm())
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const net = calcTrade({ pnlUsd: f.pnlUsd, accountSize: f.accountSize, riskPct: f.riskPct })

  const submit = (e) => {
    e.preventDefault()
    onSubmit({
      symbol: f.symbol.trim().toUpperCase(),
      side: f.side,
      openedAt: f.openedAt ? new Date(f.openedAt).getTime() : Date.now(),
      closedAt: f.closedAt ? new Date(f.closedAt).getTime() : null,
      ...(hidePlan ? {} : { planId: f.planId || null }),
      style: f.style,
      account: f.account,
      accountSize: f.accountSize,
      riskPct: f.riskPct,
      pnlUsd: f.pnlUsd,
      params: f.params || {},
      w1: f.w1,
      d1: f.d1,
      h4: f.h4,
      resultImg: f.resultImg,
      conclusion: f.conclusion,
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
      <StylePicker value={f.style} onChange={(v) => setF((x) => ({ ...x, style: v }))} />
      <AccountPicker value={f.account} onChange={(name, size) => setF((x) => ({ ...x, account: name, accountSize: size }))} />
      <label>Risk, %
        <input type="text" inputMode="decimal" autoComplete="off" value={f.riskPct} onChange={set('riskPct')} placeholder="0.5" />
      </label>
      <label>PNL, $
        <input type="text" inputMode="decimal" autoComplete="off" value={f.pnlUsd} onChange={set('pnlUsd')} placeholder="0" />
      </label>
      <div className="netres">
        <span className="plabel">Net Result</span>
        <div className={'netres-val ' + (net.pnl > 0 ? 'pos' : net.pnl < 0 ? 'neg' : '')}>
          {signed(net.netPct, 2, '%')}
          <i>·</i>
          {net.r == null ? '—' : fmt(net.r, 2) + ' RR'}
        </div>
      </div>
      {!hidePlan && <PlanPicker value={f.planId} symbol={f.symbol} onChange={(v) => setF((x) => ({ ...x, planId: v }))} />}
      <ParamsBlock value={f.params} onChange={(v) => setF((x) => ({ ...x, params: v }))} />
      <div className="wide trade-shots">
        <ShotCard title="W1" img={f.w1} onImg={(v) => setF((x) => ({ ...x, w1: v }))} />
        <ShotCard title="D1" img={f.d1} onImg={(v) => setF((x) => ({ ...x, d1: v }))} />
        <ShotCard title="H4" img={f.h4} onImg={(v) => setF((x) => ({ ...x, h4: v }))} />
        <ShotCard title="Result" img={f.resultImg} onImg={(v) => setF((x) => ({ ...x, resultImg: v }))} />
      </div>
      <label className="wide">Conclusion
        <textarea value={f.conclusion} onChange={set('conclusion')} />
      </label>
      <div className="wide" style={{ display: 'flex', gap: 8 }}>
        <button type="submit">{initial ? 'Сохранить' : 'Добавить сделку'}</button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Отмена</button>}
      </div>
    </form>
  )
}

export default function Trades({ params = {}, go }) {
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState('')
  const fileRef = useRef(null)

  const plans = useLiveQuery(() => db.plans.filter((p) => !p.deleted).toArray(), [], [])
  const planOf = (t) => plans.find((p) => p.id === t.planId)

  // Пришли из плана по клику на сделку — сразу открываем её на правку
  useEffect(() => {
    if (!params.tradeId) return
    db.trades.get(params.tradeId).then((t) => t && !t.deleted && setEditing(t))
  }, [params.tradeId])

  const trades = useLiveQuery(() => db.trades.where('deleted').equals(0).reverse().sortBy('openedAt'), [], [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return trades
    return trades.filter((t) => `${t.symbol} ${t.conclusion || t.notes || ''}`.toLowerCase().includes(q))
  }, [trades, query])

  // Колонки PnL / R нужны только для старых сделок, где ещё были цены
  const hasNums = filtered.some(hasResult)

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
        <div className="shot-head">
          <h2>{editing ? 'Редактировать сделку' : 'Новая сделка'}</h2>
          <span className="spacer" />
          {params.back && go && (
            <button type="button" className="ghost small" onClick={() => go('plan', params.back)}>← К плану</button>
          )}
        </div>
        {editing ? (
          <TradeForm
            key={editing.id}
            initial={tradeToForm(editing)}
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
          <input placeholder="Поиск: тикер, заключение" value={query} onChange={(e) => setQuery(e.target.value)} />
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
                  <th className="left">План</th>
                  {hasNums && <th>PnL</th>}
                  {hasNums && <th>Net</th>}
                  {hasNums && <th>R</th>}
                  <th className="left">Скриншоты</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const c = calcTrade(t)
                  return (
                    <tr key={t.id} title={t.conclusion || t.notes || ''}>
                      <td className="left">{new Date(t.openedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="left"><span className="symcell"><SymbolIcon symbol={t.symbol} size={20} />{t.symbol}</span></td>
                      <td className={'left ' + t.side}>{t.side === 'long' ? 'Лонг' : 'Шорт'}</td>
                      <td className="left">{planOf(t) ? <span className="tag">{planOf(t).symbol} · {weekLabel(planOf(t).weekStart).replace(/ \d{4}$/, '')}</span> : <span className="subtle">—</span>}</td>
                      {hasNums && <td className={sign(c.pnl)}>{c.closed ? fmt(c.pnl) : '—'}</td>}
                      {hasNums && <td className={sign(c.netPct)}>{c.netPct == null ? '—' : signed(c.netPct, 2, '%')}</td>}
                      {hasNums && <td className={sign(c.r)}>{fmt(c.r)}</td>}
                      <td className="left">
                        {[['W1', t.w1], ['D1', t.d1], ['H4', t.h4], ['Result', t.resultImg]].filter(([, v]) => v).map(([k]) => (
                          <span className="tag" key={k}>{k}</span>
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
