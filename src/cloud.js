// Облачное автосохранение: данные журнала уходят в приватный репозиторий GitHub.
// Как в дашборде: токен хранится только в этом браузере, правки отправляются через 4 секунды,
// без интернета копятся и уходят позже, каждое сохранение — версия файла в истории репозитория.
//
// В репозитории:
//   trade-journal-data.json — все записи (без картинок)
//   images/<хеш>.png|jpg    — скриншоты, каждый загружается один раз
// Слияние по записям: побеждает та, у которой updatedAt новее (у всех записей есть id и updatedAt).
import { useSyncExternalStore } from 'react'
import { db } from './db.js'

const KEY = 'trade-journal-gh' // { repo, token }
const DASH_KEY = 'my-dashboard-gh' // подключение дашборда (тот же сайт, тот же токен)
const DIRTY_KEY = 'trade-journal-gh-dirty'
const PATH = 'trade-journal-data.json'
const IMG_DIR = 'images/'
export const DEFAULT_REPO = 'bugajchuk2702-sys/dashboard-data'
const API = (typeof window !== 'undefined' && window.GH_API) || 'https://api.github.com'
const TABLES = ['trades', 'plans', 'notes', 'payouts']
const IMG_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }

let gh = read(KEY)
let state = { status: gh ? 'saving' : 'local', lastSync: 0, message: '', repo: gh ? gh.repo : '' }
const subs = new Set()
const emit = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()) }
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
export const getState = () => state
export const useCloud = () => useSyncExternalStore(subscribe, getState)

let pushT = null
let pushing = false
let pushAgain = false
let retryT = null
let remoteSha = null
let lastBody = null
let lastPull = 0
let uploaded = new Set(gh ? read('trade-journal-gh-imgs:' + gh.repo) || [] : [])

const isDirty = () => localStorage.getItem(DIRTY_KEY) === '1'
const setDirty = (v) => { try { v ? localStorage.setItem(DIRTY_KEY, '1') : localStorage.removeItem(DIRTY_KEY) } catch { /* ignore */ } }
const markUploaded = (name) => { uploaded.add(name); if (gh) write('trade-journal-gh-imgs:' + gh.repo, [...uploaded]) }

/* ---------- GitHub API ---------- */

const b64e = (t) => { let x = ''; new TextEncoder().encode(t).forEach((c) => { x += String.fromCharCode(c) }); return btoa(x) }
const b64d = (t) => new TextDecoder().decode(Uint8Array.from(atob(t.replace(/\s/g, '')), (c) => c.charCodeAt(0)))
const bufToB64 = (buf) => {
  const a = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000))
  return btoa(s)
}

async function ghFetch(method, path, body, accept) {
  const r = await fetch(API + '/repos/' + gh.repo + path, {
    method,
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + gh.token, Accept: accept || 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) {
    const e = new Error('HTTP ' + r.status)
    e.status = r.status
    let msg = ''
    try { msg = (await r.json()).message || '' } catch { /* ignore */ }
    // 403/429 с упоминанием лимита — это не «нет прав», а просьба подождать
    if (r.status === 429 || (r.status === 403 && (/rate limit|abuse|retry/i.test(msg) || r.headers.get('retry-after') || r.headers.get('x-ratelimit-remaining') === '0'))) e.limit = true
    throw e
  }
  return r
}
const ghApi = async (method, path, body) => (await ghFetch(method, path, body)).json()
const ghRaw = (path) => ghFetch('GET', '/contents/' + path, null, 'application/vnd.github.raw+json')

async function readRemote() {
  let j
  try { j = await ghApi('GET', '/contents/' + PATH) } catch (e) { if (e.status === 404) { remoteSha = null; return null } throw e }
  remoteSha = j.sha
  const text = j.content && j.encoding === 'base64' ? b64d(j.content) : await (await ghRaw(PATH)).text() // файл >1 МБ приходит без content
  return JSON.parse(text)
}

/* ---------- картинки: data URL <-> файлы в репозитории ---------- */

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Заменяет data URL картинок на ссылки «gh-img:имя», сами картинки собирает в uploads
async function externalize(v, uploads) {
  if (typeof v === 'string') {
    const m = IMG_RE.exec(v)
    if (!m) return v
    const name = (await sha256(v)) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1])
    uploads.set(name, v)
    return 'gh-img:' + name
  }
  if (Array.isArray(v)) return Promise.all(v.map((x) => externalize(x, uploads)))
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v)) o[k] = await externalize(v[k], uploads)
    return o
  }
  return v
}

async function fetchImg(name) {
  const buf = await (await ghRaw(IMG_DIR + name)).arrayBuffer()
  markUploaded(name)
  return `data:${MIME[name.split('.').pop()] || 'image/png'};base64,${bufToB64(buf)}`
}

// Обратно: ссылки «gh-img:имя» → data URL
async function inflate(v) {
  if (typeof v === 'string') return v.startsWith('gh-img:') ? fetchImg(v.slice(7)) : v
  if (Array.isArray(v)) return Promise.all(v.map(inflate))
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v)) o[k] = await inflate(v[k])
    return o
  }
  return v
}

async function uploadImages(uploads) {
  for (const [name, url] of uploads) {
    if (uploaded.has(name)) continue
    try {
      await ghApi('PUT', '/contents/' + IMG_DIR + name, { message: 'Скриншот ' + name.slice(0, 8), content: url.slice(url.indexOf(',') + 1) })
    } catch (e) {
      if (e.status !== 422) throw e // 422 — такой файл уже есть
    }
    markUploaded(name)
  }
}

/* ---------- слияние и отправка ---------- */

async function snapshot() {
  const [trades, plans, notes, payouts, meta] = await Promise.all([...TABLES.map((t) => db[t].toArray()), db.meta.toArray()])
  const uploads = new Map()
  const body = await externalize({ trades, plans, notes, payouts, meta }, uploads)
  return { body, uploads }
}

// Подтягивает из облака записи, которые там новее. Возвращает true, если у нас есть то, чего нет в облаке.
async function merge(remote) {
  let need = false
  const plan = []
  const upd = (x) => x.updatedAt || 0
  for (const t of TABLES) {
    const rem = Array.isArray(remote[t]) ? remote[t] : []
    const local = await db[t].toArray()
    const lm = new Map(local.map((x) => [x.id, x]))
    const rm = new Map(rem.map((x) => [x.id, x]))
    plan.push([db[t], 'id', rem.filter((r) => { const l = lm.get(r.id); return !l || upd(r) > upd(l) })])
    if (local.some((l) => { const r = rm.get(l.id); return !r || upd(l) > upd(r) })) need = true
  }
  // настройки (счета, списки параметров): по ключу, побеждает более новая
  const remMeta = Array.isArray(remote.meta) ? remote.meta : []
  const localMeta = await db.meta.toArray()
  const lmm = new Map(localMeta.map((x) => [x.key, x]))
  const rmm = new Map(remMeta.map((x) => [x.key, x]))
  plan.push([db.meta, 'key', remMeta.filter((r) => { const l = lmm.get(r.key); return !l || upd(r) > upd(l) })])
  if (localMeta.some((l) => { const r = rmm.get(l.key); return !r || upd(l) > upd(r) })) need = true

  // сначала качаем картинки (сеть), потом быстро пишем в базу одной транзакцией
  const ready = []
  for (const [tbl, pk, take] of plan) if (take.length) ready.push([tbl, pk, await inflate(take)])
  if (ready.length) {
    await db.transaction('rw', [...TABLES.map((t) => db[t]), db.meta], async (tx) => {
      tx.cloudApplying = true // хуки не считают это правкой пользователя
      for (const [tbl, pk, items] of ready) {
        const cur = await tbl.bulkGet(items.map((x) => x[pk]))
        // пока качали, пользователь мог успеть изменить запись — его версия новее, её не трогаем
        const fresh = items.filter((x, i) => !cur[i] || upd(x) > upd(cur[i]))
        await tbl.bulkPut(tbl === db.meta ? fresh : fresh.map((x) => ({ ...x, synced: 1 })))
      }
    })
  }
  return need
}

function failState(e) {
  if (!gh) return 'local'
  const s = e && e.status
  if (e && e.limit) {
    emit({ message: 'GitHub просит подождать (лимит запросов). Повторю сам.' })
    if (!retryT) retryT = setTimeout(() => { retryT = null; if (gh && state.status === 'pending' && navigator.onLine) pull() }, 60000)
    return 'pending'
  }
  if (s >= 400 && s < 500 && s !== 408 && s !== 429 && s !== 409 && s !== 422) {
    emit({
      message: s === 401 ? 'Токен не подходит или истёк.' : s === 403 ? 'У токена нет прав: нужен доступ Contents: Read and write к этому репозиторию.' : s === 404 ? 'Репозиторий не найден или у токена нет к нему доступа.' : 'Ошибка GitHub: ' + s,
    })
    return 'error'
  }
  if (!retryT) retryT = setTimeout(() => { retryT = null; if (gh && state.status === 'pending' && navigator.onLine) pull() }, 8000)
  return 'pending'
}

function schedulePush() {
  if (!gh) return
  setDirty(true)
  emit({ status: 'saving' })
  clearTimeout(pushT)
  pushT = setTimeout(() => push(), 4000)
}

async function push(retry = 0) {
  pushT = null
  if (!gh) return
  if (!navigator.onLine) { emit({ status: 'pending' }); return }
  if (pushing) { pushAgain = true; return }
  pushing = true
  try {
    const { body, uploads } = await snapshot()
    const text = JSON.stringify(body)
    if (text !== lastBody || remoteSha == null) {
      await uploadImages(uploads)
      const payload = { message: 'Сохранение ' + new Date().toISOString(), content: b64e(JSON.stringify({ app: 'trade-journal', version: 4, savedAt: Date.now(), ...body })) }
      if (remoteSha) payload.sha = remoteSha
      const j = await ghApi('PUT', '/contents/' + PATH, payload)
      remoteSha = j.content.sha
      lastBody = text
    }
    setDirty(false)
    emit({ status: 'synced', lastSync: Date.now(), message: '' })
  } catch (e) {
    if ((e.status === 409 || e.status === 422) && retry < 3) { pushing = false; await pull(retry + 1); return }
    emit({ status: failState(e) })
  }
  pushing = false
  if (pushAgain) { pushAgain = false; push() }
}

async function pull(retry = 0) {
  if (!gh) return
  if (!navigator.onLine) { emit({ status: 'pending' }); return }
  if (pushing && retry === 0) return // идёт отправка — после неё всё и так сверится
  lastPull = Date.now()
  try {
    if (state.status !== 'saving') emit({ status: 'saving' })
    const remote = await readRemote()
    if (!remote) { await push(retry); return } // в облаке ещё пусто — отправляем всё
    const need = await merge(remote)
    if (need || isDirty()) { await push(retry); return }
    emit({ status: 'synced', lastSync: Date.now(), message: '' })
  } catch (e) {
    emit({ status: failState(e) })
  }
}

/* ---------- публичный интерфейс ---------- */

export const dashboardConnection = () => {
  const d = read(DASH_KEY)
  return d && d.repo && d.token ? d : null
}

export async function connect(repoIn, tokenIn) {
  const repo = String(repoIn || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '')
  const token = String(tokenIn || '').trim()
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return { ok: false, message: 'Введите репозиторий (владелец/название) и токен.' }
  const prev = gh
  gh = { repo, token }
  try {
    const info = await ghApi('GET', '')
    if (!info.private) {
      gh = prev
      return { ok: false, message: 'Этот репозиторий публичный: ваши данные видели бы все. Откройте его Settings → Danger Zone → Change visibility → Private и повторите.' }
    }
    write(KEY, gh)
    remoteSha = null
    lastBody = null
    uploaded = new Set(read('trade-journal-gh-imgs:' + repo) || [])
    emit({ status: 'saving', repo, message: '' })
    await pull()
    return { ok: state.status !== 'error', message: state.status === 'error' ? state.message : '' }
  } catch (e) {
    gh = prev
    return { ok: false, message: e.status === 401 ? 'Токен не подходит или истёк.' : e.status === 404 ? 'Репозиторий не найден или у токена нет к нему доступа.' : e instanceof TypeError ? 'Нет связи с интернетом.' : 'Ошибка: ' + e.message }
  }
}

export function disconnect() {
  gh = null
  clearTimeout(pushT)
  pushT = null
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  setDirty(false)
  emit({ status: 'local', repo: '', message: '' })
}

export const syncNow = () => pull()

// Запуск при старте приложения
let started = false
export function initCloud() {
  if (started) return
  started = true
  const mine = (tx) => !(tx && tx.cloudApplying)
  for (const t of [...TABLES, 'meta']) {
    // у настроек (meta) нет updatedAt — ставим сами, чтобы работало «побеждает новее»
    db[t].hook('creating', (pk, obj, tx) => { if (mine(tx)) { if (t === 'meta') obj.updatedAt = Date.now(); schedulePush() } })
    db[t].hook('updating', (mods, pk, obj, tx) => { if (mine(tx)) { schedulePush(); if (t === 'meta') return { updatedAt: Date.now() } } })
    db[t].hook('deleting', (pk, obj, tx) => { if (mine(tx)) schedulePush() })
  }
  window.addEventListener('online', () => gh && pull())
  document.addEventListener('visibilitychange', () => {
    if (!gh) return
    if (document.visibilityState === 'hidden' && pushT) { clearTimeout(pushT); push() } // ушли со вкладки: отправляем сразу
    else if (document.visibilityState === 'visible' && !pushT && !pushing && Date.now() - lastPull > 30000) pull()
  })
  setInterval(() => { if (gh && !pushT && !pushing && document.visibilityState === 'visible') pull() }, 5 * 60 * 1000)
  if (gh) pull()
}
