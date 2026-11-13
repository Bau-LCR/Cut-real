import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase'
import { readSSE } from './sse'

export class FnError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message) }
}

async function headers(extra: Record<string, string> = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new FnError('unauthenticated', 'Tu sesión expiró. Volvé a iniciar sesión.', 401)
  return { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY!, ...extra }
}

async function toError(res: Response): Promise<FnError> {
  const j = await res.json().catch(() => ({}))
  return new FnError(j.error ?? 'http_' + res.status, j.message ?? 'Ocurrió un error inesperado.', res.status)
}

async function doFetch(name: string, init: RequestInit): Promise<Response> {
  try { return await fetch(`${SUPABASE_URL}/functions/v1/${name}`, init) }
  catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new FnError('network', 'No hay conexión con el servidor. Revisá tu internet.')
  }
}

export async function callFn<T = any>(name: string, body: unknown): Promise<T> {
  const res = await doFetch(name, { method: 'POST', headers: await headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) })
  if (!res.ok) throw await toError(res)
  return res.json()
}

export async function callFnForm<T = any>(name: string, form: FormData): Promise<T> {
  const res = await doFetch(name, { method: 'POST', headers: await headers(), body: form })
  if (!res.ok) throw await toError(res)
  return res.json()
}

export async function callFnBlob(name: string, body: unknown): Promise<Blob> {
  const res = await doFetch(name, { method: 'POST', headers: await headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) })
  if (!res.ok) throw await toError(res)
  return res.blob()
}

export async function streamChat(body: unknown, onEvent: (ev: any) => void, signal: AbortSignal): Promise<void> {
  const res = await doFetch('chat', { method: 'POST', signal, headers: await headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) })
  if (!res.ok) throw await toError(res)
  try { await readSSE(res, onEvent) }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new FnError('stream_dropped', 'Se cortó la conexión durante la respuesta.') }
}
