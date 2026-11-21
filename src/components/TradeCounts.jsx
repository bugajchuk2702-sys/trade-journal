import React from 'react'

// «4 Trades | 4 / 0 / 0 / 0 / 0» — всего, прибыльные, убыточные, безубыток, открытые, missed (серый, в «всего» не входит).
// short — только win / loss / BE
// compact — только счётчики, без «N Trades |»
export default function TradeCounts({ total = 0, win = 0, loss = 0, be = 0, open = 0, missed = 0, compact, short }) {
  return (
    <div className="tt-row">
      {!compact && (
        <>
          <b>{total} Trades</b>
          <span className="tt-sep">|</span>
        </>
      )}
      <span className="tt-g" title="Прибыльные">{win}</span>
      <span className="tt-sl">/</span>
      <span className="tt-r" title="Убыточные">{loss}</span>
      <span className="tt-sl">/</span>
      <span className="tt-o" title="Безубыток">{be}</span>
      {!short && (
        <>
          <span className="tt-sl">/</span>
          <span className="tt-b" title="Открытые">{open}</span>
          <span className="tt-sl">/</span>
          <span className="tt-m" title="Missed: упущенные, в статистику не входят">{missed}</span>
        </>
      )}
    </div>
  )
}
