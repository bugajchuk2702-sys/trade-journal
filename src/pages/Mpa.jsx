import React from 'react'

// Заготовка страницы MPA — содержимое определим вместе
export default function Mpa() {
  return (
    <>
      <div className="page-title">
        <h2>MPA</h2>
      </div>
      <section className="card">
        <div className="empty">
          Раздел MPA пока пустой.
          <br />
          <span className="hint">Скажи, что здесь должно быть, и я наполню его.</span>
        </div>
      </section>
    </>
  )
}
