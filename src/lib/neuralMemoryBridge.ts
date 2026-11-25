import { supabase } from './supabase'

const ENDPOINT = 'https://evrbaaeccuwaxclnpknk.supabase.co/functions/v1/neural-bridge'
const PUBLISHABLE_KEY = 'sb_publishable_m0BD0r3VtRdjNmDwFyHa2A_K8192MWF'
export const NEURAL_GLOBAL_USER = 'cutreal-neural-global'

export type NeuralMemoryRecord = {
  id: string
  external_user_id: string
  object_key: string
  object_category: string
  payload: Record<string, any>
  size_bytes: number
  created_at: string
  updated_at: string
}
export type NeuralMemoryStorage = { usedBytes: number; quotaBytes: number; percent: number }
type BridgeResult = { records: NeuralMemoryRecord[]; count: number; storage: NeuralMemoryStorage }

export async function neuralMemoryAction<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('No hay una sesión activa de Cut-real. Iniciá sesión nuevamente.')
  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...payload }),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new Error('No se pudo conectar con Memory Task. Comprobá la conexión e intentá nuevamente.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Memory Task respondió con HTTP ' + response.status + '.')
  return result as T
}

export async function readNeuralBrain(): Promise<{ brain: any | null; records: NeuralMemoryRecord[]; storage: NeuralMemoryStorage | null }> {
  const result = await neuralMemoryAction<BridgeResult>('list')
  const records = result.records ?? []
  const manifest = records.find(r => r.object_key === 'neural-architecture-main-manifest')
  if (!manifest) return { brain: null, records, storage: result.storage ?? null }
  const parts = records
    .filter(r => r.external_user_id === NEURAL_GLOBAL_USER && r.object_key.startsWith('neural-architecture-main-part-'))
    .sort((a, b) => a.object_key.localeCompare(b.object_key, undefined, { numeric: true }))
  const count = Math.max(0, Math.min(100, Number(manifest.payload?.parts) || parts.length))
  if (!count || parts.length < count) throw new Error('La arquitectura de Memory Task está incompleta; no se reemplazó la copia local.')
  const raw = parts.slice(0, count).map(r => String(r.payload?.content ?? '')).join('')
  const brain = JSON.parse(raw)
  return { brain, records, storage: result.storage ?? null }
}

export async function saveNeuralBrain(brain: unknown): Promise<BridgeResult> {
  const raw = JSON.stringify(brain)
  const chunks = raw.match(/[\\s\\S]{1,18000}/g) ?? ['']
  const records = chunks.map((content, index) => ({
    key: 'architecture-main-part-' + String(index).padStart(4, '0'),
    category: 'custom',
    shared: true,
    data: {
      title: 'Arquitectura neuronal · fragmento ' + (index + 1) + '/' + chunks.length,
      content,
      kind: 'architecture',
      source: 'Cut-real 2 · arquitectura principal',
    },
  }))
  records.push({
    key: 'architecture-main-manifest',
    category: 'custom',
    shared: true,
    data: {
      title: 'Arquitectura neuronal principal',
      content: 'Estado serializado de la red principal.',
      kind: 'architecture-manifest',
      parts: chunks.length,
      bytes: new TextEncoder().encode(raw).byteLength,
      updated_at: new Date().toISOString(),
      source: 'Cut-real 2 · Laboratorio neuronal',
    },
  })
  await neuralMemoryAction('put_batch', { records })
  const current = await neuralMemoryAction<BridgeResult>('list')
  const keep = new Set(records.map(r => 'neural-' + r.key))
  const stale = current.records.filter(r =>
    r.external_user_id === NEURAL_GLOBAL_USER &&
    r.object_key.startsWith('neural-architecture-main-part-') &&
    !keep.has(r.object_key),
  )
  for (const record of stale) await neuralMemoryAction('delete', { key: record.object_key, shared: true })
  return await neuralMemoryAction<BridgeResult>('list')
}
