import { db } from './db.js'
import { norm } from './components/Symbols.jsx'

// Разовый возврат: планы GER40, которые 21 ноября ушли в Корзину при уборке пары, снова в работе.
// Планы, удалённые раньше этого времени (самим пользователем), не трогаем.
const RETIRED_AFTER = Date.parse('2026-11-21T16:00:00Z')
export async function restoreGer40() {
  const KEY = 'tj-restore-ger40-v1'
  try { if (localStorage.getItem(KEY)) return } catch { return }
  const plans = await db.plans.where('deleted').equals(1).toArray()
  const back = plans
    .filter((p) => norm(p.symbol) === 'GER40' && (p.updatedAt || 0) >= RETIRED_AFTER)
    .map((p) => ({ ...p, deleted: 0, updatedAt: Date.now(), synced: 0 }))
  if (back.length) await db.plans.bulkPut(back)
  try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
}
