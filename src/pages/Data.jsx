import React, { useEffect, useState } from 'react'
import Accounts from './data/Accounts.jsx'
import Metrics from './data/Metrics.jsx'
import Cloud from './data/Cloud.jsx'

// Раздел Data: справочники и сводки по данным журнала
const SECTIONS = [
  { id: 'accounts', label: 'Accounts', Page: Accounts },
  { id: 'metrics', label: 'Metrics', Page: Metrics },
  { id: 'cloud', label: 'Облако', Page: Cloud },
]

export default function Data({ params }) {
  const [section, setSection] = useState(params?.section || 'accounts')
  useEffect(() => { if (params?.section) setSection(params.section) }, [params])
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
