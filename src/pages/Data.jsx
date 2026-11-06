import React, { useState } from 'react'
import Accounts from './data/Accounts.jsx'
import Metrics from './data/Metrics.jsx'

// Раздел Data: справочники и сводки по данным журнала
const SECTIONS = [
  { id: 'accounts', label: 'Accounts', Page: Accounts },
  { id: 'metrics', label: 'Metrics', Page: Metrics },
]

export default function Data() {
  const [section, setSection] = useState('accounts')
  const { Page } = SECTIONS.find((s) => s.id === section)
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
      <Page />
    </>
  )
}
