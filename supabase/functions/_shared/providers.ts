// Capa central de proveedores. Para sumar uno nuevo con API distinta: implementá ProviderAdapter y registralo en ADAPTERS.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './cors.ts'
import { parseOpenAIStream, type StreamEvent } from './sse.ts'

export interface ProviderRow { id: string; slug: string; name: string; kind: string; base_url: string; api_key_env: string; enabled: boolean; rpm_limit: number | null; daily_request_limit: number | null }
export interface ModelRow { id: string; provider_id: string; model_key: string; display_name: string; enabled: boolean; supports_vision: boolean; context_window: number | null; max_output_tokens: number | null; user_rpm_limit: number }
export type ChatPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string | ChatPart[] }
export interface StreamArgs { provider: ProviderRow; apiKey: string; model: ModelRow; messages: ChatMessage[]; maxTokens?: number; temperature?: number; signal: AbortSignal }

export interface ProviderAdapter { stream(a: StreamArgs): AsyncGenerator<StreamEvent> }

/** Errores del proveedor => código estable + mensaje seguro para el usuario. */
export class ProviderError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message) }
}
export function classifyProviderStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('provider_auth', 'El proveedor rechazó la credencial del servidor. Avisá a un administrador.')
  if (status === 429) return new ProviderError('provider_rate_limited', 'El proveedor alcanzó su límite de uso. Probá con otro modelo o esperá un momento.', 429)
  if (status === 400 || status === 404 || status === 422) return new ProviderError('provider_bad_request', 'El proveedor no aceptó la solicitud (modelo no disponible o contenido inválido).')
  return new ProviderError('provider_unavailable', 'El proveedor no está disponible en este momento.')
}

async function retryDelay(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('La solicitud fue cancelada.', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function fetchProviderResponse(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) throw new DOMException('La solicitud fue cancelada.', 'AbortError')
    try {
      const res = await fetch(url, { ...init, signal })
      if (res.ok && res.body) return res
      const retryable = (res.status >= 500 && res.status <= 599) || (res.ok && !res.body)
      await res.body?.cancel().catch(() => {})
      if (!retryable || attempt === 2) throw classifyProviderStatus(res.status)
    } catch (error) {
      if (signal.aborted || error instanceof ProviderError || (error as Error)?.name === 'AbortError') throw error
      if (attempt === 2) {
        throw new ProviderError('provider_unavailable', 'El proveedor no respondió después de tres intentos. Probá nuevamente en unos segundos.')
      }
    }
    await retryDelay(350 * (attempt + 1), signal)
  }
  throw new ProviderError('provider_unavailable', 'El proveedor no respondió después de tres intentos. Probá nuevamente en unos segundos.')
}

const openAICompatible: ProviderAdapter = {
  async *stream({ provider, apiKey, model, messages, maxTokens, temperature, signal }) {
    const res = await fetchProviderResponse(`${provider.base_url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model.model_key, messages, stream: true, stream_options: { include_usage: true },
        max_tokens: Math.min(maxTokens ?? model.max_output_tokens ?? 4096, model.max_output_tokens ?? 4096),
        temperature: temperature ?? 0.7,
      }),
    }, signal)
    yield* parseOpenAIStream(res.body!)
  },
}
const ADAPTERS: Record<string, ProviderAdapter> = { openai_compatible: openAICompatible }

export async function loadModel(db: SupabaseClient, modelId: string): Promise<{ model: ModelRow; provider: ProviderRow; apiKey: string }> {
  const { data: model } = await db.from('cr_models').select('*').eq('id', modelId).maybeSingle()
  if (!model || !model.enabled) throw new HttpError(400, 'model_unavailable', 'Ese modelo no está disponible.')
  const { data: provider } = await db.from('cr_providers').select('*').eq('id', model.provider_id).maybeSingle()
  if (!provider || !provider.enabled) throw new HttpError(400, 'model_unavailable', 'El proveedor de ese modelo está deshabilitado.')
  const apiKey = Deno.env.get(provider.api_key_env)
  if (!apiKey) throw new HttpError(503, 'provider_not_configured', `El proveedor ${provider.name} todavía no tiene su clave configurada en el servidor.`)
  return { model, provider, apiKey }
}

export function streamFromProvider(a: StreamArgs): AsyncGenerator<StreamEvent> {
  const adapter = ADAPTERS[a.provider.kind]
  if (!adapter) throw new ProviderError('provider_unsupported', 'Tipo de proveedor no soportado.')
  return adapter.stream(a)
}

/** Límites globales del proveedor (por minuto y por día). */
export async function checkProviderLimits(db: SupabaseClient, provider: ProviderRow) {
  if (provider.rpm_limit) {
    const { data } = await db.rpc('cr_rate_limit', { p_key: `prov:${provider.id}`, p_limit: provider.rpm_limit, p_window_seconds: 60 })
    if (data === false) throw new HttpError(429, 'provider_rate_limited', 'El proveedor está al límite de solicitudes por minuto. Probá de nuevo en un momento.')
  }
  if (provider.daily_request_limit) {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0)
    const { count } = await db.from('cr_usage_events').select('id', { count: 'exact', head: true })
      .eq('provider_id', provider.id).in('kind', ['chat', 'api']).gte('created_at', since.toISOString())
    if ((count ?? 0) >= provider.daily_request_limit) throw new HttpError(429, 'provider_daily_limit', 'Se alcanzó el límite diario configurado para este proveedor.')
  }
}
