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

/* ---------- Недельные планы (одна запись на неделю) ---------- */

export async function savePlan(weekStart, data) {
  const id = 'plan-' + weekStart
  const existing = await db.plans.get(id)
  const now = Date.now()
  await db.plans.put({
    ...existing,
    ...data,
    id,
    weekStart,
    createdAt: existing?.createdAt ?? now,
    deleted: 0,
    updatedAt: now,
    synced: 0,
  })
}

/* ---------- Заметки ---------- */

export async function addNote() {
  const now = Date.now()
  const note = { id: uuid(), title: '', body: '', createdAt: now, updatedAt: now, deleted: 0, synced: 0 }
  await db.notes.add(note)
  return note
}

export async function updateNote(id, data) {
  await db.notes.update(id, { ...data, updatedAt: Date.now(), synced: 0 })
}

export async function removeNote(id) {
  await db.notes.update(id, { deleted: 1, updatedAt: Date.now(), synced: 0 })
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
  const [trades, plans, notes] = await Promise.all([db.trades.toArray(), db.plans.toArray(), db.notes.toArray()])
  return JSON.stringify({ version: 2, exportedAt: Date.now(), trades, plans, notes }, null, 2)
}

export async function importJson(text) {
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.trades)) {
    throw new Error('Неверный формат файла')
  }
  const mark = (arr) => (Array.isArray(arr) ? arr.map((x) => ({ ...x, synced: 0 })) : [])
  await db.transaction('rw', db.trades, db.plans, db.notes, async () => {
    await db.trades.bulkPut(mark(parsed.trades))
    await db.plans.bulkPut(mark(parsed.plans))
    await db.notes.bulkPut(mark(parsed.notes))
  })
  return parsed.trades.length + (parsed.plans?.length || 0) + (parsed.notes?.length || 0)
}
