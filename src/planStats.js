import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db.js'
import { calcTrade, isMissed } from './stats.js'

// Сделки каждого плана: всего, прибыльные, убыточные, безубыток, открытые, missed (отдельно)
export function usePlanStats() {
  return useLiveQuery(
    () =>
      db.trades
        .filter((t) => !t.deleted && t.planId)
        .toArray()
        .then((a) =>
          a.reduce((m, t) => {
            const c = calcTrade(t)
            const x = (m[t.planId] ||= { total: 0, win: 0, loss: 0, be: 0, open: 0, missed: 0, long: 0, short: 0 })
            if (t.side === 'short') x.short += 1
            else x.long += 1
            if (isMissed(t)) { x.missed += 1; return m } // Missed показываем отдельно, в итог они не входят
            x.total += 1
            if (!c.closed) x.open += 1
            else if (c.res === 'win') x.win += 1
            else if (c.res === 'loss') x.loss += 1
            else x.be += 1
            return m
          }, {})
        ),
    [],
    {}
  )
}
