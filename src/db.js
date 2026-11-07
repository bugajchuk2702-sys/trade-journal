import Dexie from 'dexie'

// Локальная база. Все записи имеют uuid, updatedAt и флаг deleted,
// чтобы позже подключить облачную синхронизацию без переделки схемы.
export const db = new Dexie('trade-journal')

db.version(1).stores({
  trades: 'id, openedAt, symbol, side, updatedAt, deleted, synced',
  meta: 'key',
})

db.version(2).stores({
  trades: 'id, openedAt, symbol, side, updatedAt, deleted, synced',
  meta: 'key',
  plans: 'id, weekStart, updatedAt, deleted, synced',
  notes: 'id, updatedAt, deleted, synced',
})

// v3: планы теперь по инструментам (несколько планов на одну неделю)
db.version(3).stores({
  plans: 'id, weekStart, symbol, updatedAt, deleted, synced',
})

// v4: выплаты по счетам (Data → Accounts → Payouts)
db.version(4).stores({
  payouts: 'id, date, account, updatedAt, deleted, synced',
})

export const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)

/* ---------- Сделки ---------- */

export async function addTrade(data) {
  const now = Date.now()
  const trade = {
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    deleted: 0,
    synced: 0, // 0 = ждёт отправки в облако
    ...data,
  }
  await db.trades.add(trade)
  return trade
}

export async function updateTrade(id, data) {
  await db.trades.update(id, { ...data, updatedAt: Date.now(), synced: 0 })
}

// Мягкое удаление: запись остаётся, чтобы удаление тоже синхронизировалось
export async function removeTrade(id) {
  await db.trades.update(id, { deleted: 1, updatedAt: Date.now(), synced: 0 })
}

/* ---------- Недельные планы (по инструментам: BTC, EUR/USD и т.д.) ---------- */

export async function createPlan(weekStart, symbol) {
  const now = Date.now()
  const plan = {
    id: uuid(),
    weekStart, // понедельник недели, YYYY-MM-DD
    symbol,
    bias: '',
    focus: '',
    levels: '',
    rules: '',
    goals: '',
    review: '',
    checklist: [],
    createdAt: now,
    updatedAt: now,
    deleted: 0,
    synced: 0,
  }
  await db.plans.add(plan)
  return plan
}

export async function savePlan(id, data) {
  await db.plans.update(id, { ...data, updatedAt: Date.now(), synced: 0 })
}

export async function removePlan(id) {
  await db.plans.update(id, { deleted: 1, updatedAt: Date.now(), synced: 0 })
}

/* ---------- Заметки ---------- */

// Заметка: date — дата заметки, archived — в архиве, tradeIds / planIds — к каким трейдам и планам привязана
export async function addNote(data = {}) {
  const now = Date.now()
  const d = new Date(now)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  const note = {
    id: uuid(), title: '', body: '',
    date: d.toISOString().slice(0, 10), archived: false, tradeIds: [], planIds: [],
    createdAt: now, updatedAt: now, deleted: 0, synced: 0,
    ...data,
  }
  await db.notes.add(note)
  return note
}

export async function updateNote(id, data) {
  await db.notes.update(id, { ...data, updatedAt: Date.now(), synced: 0 })
}

export async function removeNote(id) {
  await db.notes.update(id, { deleted: 1, updatedAt: Date.now(), synced: 0 })
}

/* ---------- Выплаты ---------- */

export async function addPayout(data) {
  const now = Date.now()
  await db.payouts.add({ id: uuid(), createdAt: now, updatedAt: now, deleted: 0, synced: 0, ...data })
}

export async function updatePayout(id, data) {
  await db.payouts.update(id, { ...data, updatedAt: Date.now(), synced: 0 })
}

export async function removePayout(id) {
  await db.payouts.update(id, { deleted: 1, updatedAt: Date.now(), synced: 0 })
}

/* ---------- Хранилище и резервные копии ---------- */

// Просим браузер не удалять данные при нехватке места
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist()
    }
  } catch {
    /* ignore */
  }
  return false
}

export async function exportJson() {
  const [trades, plans, notes, payouts, accRow] = await Promise.all([
    db.trades.toArray(), db.plans.toArray(), db.notes.toArray(), db.payouts.toArray(), db.meta.get('accounts'),
  ])
  return JSON.stringify({ version: 3, exportedAt: Date.now(), trades, plans, notes, payouts, accounts: accRow?.value || [] }, null, 2)
}

export async function importJson(text) {
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.trades)) {
    throw new Error('Неверный формат файла')
  }
  const mark = (arr) => (Array.isArray(arr) ? arr.map((x) => ({ ...x, synced: 0 })) : [])
  await db.transaction('rw', db.trades, db.plans, db.notes, db.payouts, db.meta, async () => {
    await db.trades.bulkPut(mark(parsed.trades))
    await db.plans.bulkPut(mark(parsed.plans))
    await db.notes.bulkPut(mark(parsed.notes))
    await db.payouts.bulkPut(mark(parsed.payouts))
    // Счета объединяем с уже имеющимися: совпавшие по названию берутся из файла
    if (Array.isArray(parsed.accounts) && parsed.accounts.length) {
      const cur = (await db.meta.get('accounts'))?.value || []
      const names = new Set(parsed.accounts.map((a) => a.name))
      await db.meta.put({ key: 'accounts', value: [...cur.filter((a) => !names.has(a.name)), ...parsed.accounts] })
    }
  })
  return parsed.trades.length + (parsed.plans?.length || 0) + (parsed.notes?.length || 0) + (parsed.payouts?.length || 0)
}
