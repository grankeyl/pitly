import type { Channel } from '../api/client'

/*
 * Ожидание подключения канала. Telegram может закрыть или перезапустить приложение, когда открывает выбор канала,
 * поэтому ожидание хранится в памяти телефона: после возврата приложение само находит новый канал и открывает его.
 */
const KEY = 'pitly_pending_connect'
const TTL = 15 * 60 * 1000

type Pending = { ids: number[]; since: string; at: number }

export function startPending(channels: Channel[]) {
  const since = channels.reduce((max, c) => (c.connectedAt > max ? c.connectedAt : max), '')
  try {
    localStorage.setItem(KEY, JSON.stringify({ ids: channels.map((c) => c.id), since, at: Date.now() } satisfies Pending))
  } catch {
    /* память недоступна — ожидание живёт только пока открыт экран */
  }
}

export function readPending(): Pending | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Pending
    if (!p || !Array.isArray(p.ids) || Date.now() - p.at > TTL) {
      localStorage.removeItem(KEY)
      return null
    }
    return p
  } catch {
    return null
  }
}

export function clearPending() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* нечего чистить */
  }
}

/** Канал, которого не было в момент начала ожидания, или тот, куда бота добавили заново. */
export function findConnected(channels: Channel[], p: Pending): Channel | undefined {
  return channels.find((c) => !p.ids.includes(c.id) || (p.since !== '' && c.connectedAt > p.since))
}
