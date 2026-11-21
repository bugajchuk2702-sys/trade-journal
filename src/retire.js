import { db } from './db.js'
import { norm } from './components/Symbols.jsx'

// Разовая уборка: планы по GER40 уходят в Корзину (Data → Корзина, оттуда их можно вернуть).
// Трейды по паре не трогаем — на них держится статистика.
export async function retireGer40() {
  const KEY = 'tj-retire-ger40-v1'
  try { if (localStorage.getItem(KEY)) return } catch { return }
  const plans = await db.plans.where('deleted').equals(0).toArray()
  const gone = plans.filter((p) => norm(p.symbol) === 'GER40').map((p) => ({ ...p, deleted: 1, updatedAt: Date.now(), synced: 0 }))
  if (gone.length) await db.plans.bulkPut(gone)
  try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
}
