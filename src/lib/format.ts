import type { Conversation, Message } from './types'

/** Combina una lectura del historial con mensajes que llegaron mientras la consulta estaba en curso. */
export function mergeMessageSnapshot(fetched: Message[], current: Message[], preserveCurrent: boolean): Message[] {
  if (!preserveCurrent) return fetched
  const byId = new Map(fetched.map((message) => [message.id, message]))
  for (const message of current) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER))
}

export function groupConversations(list: Conversation[], now = new Date()): { label: string; items: Conversation[] }[] {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = startOf(now), day = 86_400_000
  const buckets: Record<string, Conversation[]> = { 'Fijadas': [], 'Hoy': [], 'Ayer': [], 'Últimos 7 días': [], 'Anteriores': [] }
  for (const c of list) {
    const t = startOf(new Date(c.last_message_at))
    const key = c.pinned ? 'Fijadas' : t >= today ? 'Hoy' : t >= today - day ? 'Ayer' : t >= today - 7 * day ? 'Últimos 7 días' : 'Anteriores'
    buckets[key].push(c)
  }
  return Object.entries(buckets).filter(([, v]) => v.length).map(([label, items]) => ({ label, items }))
}

export const formatBytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`

export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'ahora'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/** Mensaje "generating" sin actividad hace > 3 min => se considera interrumpido. */
export const STALE_MS = 180_000
