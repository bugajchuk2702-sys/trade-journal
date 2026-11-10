import React, { useState } from 'react'
import { useCloud, connect, disconnect, syncNow, dashboardConnection, DEFAULT_REPO } from '../../cloud.js'

export const CLOUD_LABEL = {
  local: 'Только на этом устройстве',
  saving: 'Сохраняется…',
  synced: 'Сохранено',
  pending: 'Ждёт интернета',
  error: 'Ошибка сохранения',
}
export const CLOUD_DOT = { local: '', saving: 'warn', synced: 'ok', pending: 'warn', error: 'off' }

const when = (t) => (t ? new Date(t).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '')

export default function Cloud() {
  const c = useCloud()
  const dash = dashboardConnection()
  const [repo, setRepo] = useState(DEFAULT_REPO)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (r, t) => {
    setBusy(true)
    setError('')
    const res = await connect(r, t)
    setBusy(false)
    if (res.ok) setToken('')
    else setError(res.message)
  }
  const submit = (e) => { e.preventDefault(); run(repo, token) }
  const connected = c.status !== 'local'

  return (
    <section className="card cloud">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Облако</h2>
        <span className="cloud-state"><span className={'dot ' + CLOUD_DOT[c.status]} />{CLOUD_LABEL[c.status]}</span>
      </div>

      {!connected ? (
        <>
          <p className="cloud-lead">
            Сейчас записи лежат только в этом браузере: если его почистить или сломается ноутбук, они пропадут.
            Подключи приватный репозиторий GitHub — журнал будет сам сохранять в него всё через несколько секунд после правки,
            а каждое сохранение останется в истории версий.
          </p>
          <form className="acc-form" onSubmit={submit}>
            <label className="acc-wide">Приватный репозиторий (владелец/название)
              <input value={repo} autoComplete="off" spellCheck={false} placeholder="имя/репозиторий" onChange={(e) => setRepo(e.target.value)} />
            </label>
            <label className="acc-wide">Токен GitHub
              <input type="password" value={token} autoComplete="off" spellCheck={false} placeholder="github_pat_…" onChange={(e) => setToken(e.target.value)} />
            </label>
            <div className="acc-form-btns">
              <button type="submit" disabled={busy || !token.trim()}>{busy ? 'Проверяю…' : 'Подключить'}</button>
              {dash && (
                <button type="button" className="ghost" disabled={busy} onClick={() => run(dash.repo, dash.token)} title={'Репозиторий ' + dash.repo}>
                  Взять подключение из дашборда
                </button>
              )}
            </div>
            {error && <div className="acc-error">{error}</div>}
          </form>
          <details className="cloud-how">
            <summary>Как получить токен</summary>
            <ol>
              <li>GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li>
              <li>Repository access → Only select repositories → выбери свой приватный репозиторий для данных.</li>
              <li>Permissions → Repository permissions → Contents → Read and write.</li>
              <li>Сгенерируй, скопируй токен и вставь выше. Он останется только в этом браузере.</li>
            </ol>
          </details>
        </>
      ) : (
        <>
          <dl className="cloud-info">
            <div><dt>Репозиторий</dt><dd>{c.repo}</dd></div>
            <div><dt>Файл</dt><dd>trade-journal-data.json (скриншоты — в папке images)</dd></div>
            {c.lastSync > 0 && <div><dt>Последнее сохранение</dt><dd>{when(c.lastSync)}</dd></div>}
          </dl>
          {c.message && <div className="acc-error cloud-msg">{c.message}</div>}
          <div className="acc-form-btns cloud-btns">
            <button type="button" onClick={syncNow} disabled={c.status === 'saving'}>Сохранить сейчас</button>
            <button type="button" className="ghost" onClick={() => confirm('Отключить облако? Данные останутся и в браузере, и в репозитории, но новые правки сохраняться не будут.') && disconnect()}>Отключить</button>
          </div>
          <p className="acc-note cloud-foot">Правки уходят в репозиторий сами. На новом устройстве достаточно подключить тот же репозиторий — всё подтянется.</p>
        </>
      )}
    </section>
  )
}
