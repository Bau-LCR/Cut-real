// Cut-real 2 · API pública propia — /functions/v1/api/v1/...
// Autenticación: Authorization: Bearer crk_...  (claves creadas en el panel de administración)
// Desplegar con --no-verify-jwt (ver config.toml): la autenticación la hace este código.
import { corsHeaders, errorResponse, HttpError, json } from '../_shared/cors.ts'
import { hasScope, looksLikeApiKey, sha256Hex, type ApiScope } from '../_shared/apikeys.ts'
import { checkProviderLimits, loadModel, ProviderError, streamFromProvider } from '../_shared/providers.ts'
import { logUsage, rateLimit, serviceClient } from '../_shared/supabase.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const db = serviceClient()
    const secret = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!looksLikeApiKey(secret)) throw new HttpError(401, 'invalid_api_key', 'API key ausente o con formato inválido.')
    const { data: key } = await db.from('cr_api_keys').select('*').eq('key_hash', await sha256Hex(secret)).maybeSingle()
    if (!key || key.revoked_at || (key.expires_at && new Date(key.expires_at) < new Date()))
      throw new HttpError(401, 'invalid_api_key', 'API key inválida, revocada o vencida.')
    await rateLimit(db, `key:${key.id}`, key.rate_limit_per_minute)
    db.from('cr_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id).then(() => {})

    const need = (s: ApiScope) => { if (!hasScope(key.scopes, s)) throw new HttpError(403, 'insufficient_scope', `Esta clave no tiene el permiso ${s}.`) }
    const path = new URL(req.url).pathname.replace(/^.*\/api(?=\/v1)/, '')

    if (path === '/v1/me' && req.method === 'GET') return json(req, { name: key.name, scopes: key.scopes, rate_limit_per_minute: key.rate_limit_per_minute })

    if (path === '/v1/models' && req.method === 'GET') {
      need('models:read')
      const { data } = await db.from('cr_available_models').select('id, model_key, display_name, provider_slug, supports_vision, context_window').order('sort_order')
      return json(req, { object: 'list', data: (data ?? []).map((m: any) => ({ id: m.id, object: 'model', name: `${m.provider_slug}/${m.model_key}`, display_name: m.display_name, supports_vision: m.supports_vision, context_window: m.context_window })) })
    }

    if (path === '/v1/chat/completions' && req.method === 'POST') {
      need('chat:write')
      const b = await req.json().catch(() => null)
      if (!b || typeof b.model !== 'string' || !Array.isArray(b.messages) || b.messages.length < 1 || b.messages.length > 100)
        throw new HttpError(400, 'bad_request', 'Se requiere "model" y "messages" (1–100).')
      for (const m of b.messages) if (!['system', 'user', 'assistant'].includes(m?.role) || typeof m?.content !== 'string' || m.content.length > 50_000)
        throw new HttpError(400, 'bad_request', 'Cada mensaje necesita role válido y content de texto (máx. 50.000 caracteres).')
      // "model" acepta el UUID o "proveedor/modelo" (p. ej. groq/llama-3.3-70b-versatile)
      let modelId = b.model
      if (!UUID.test(modelId)) {
        const { data: av } = await db.from('cr_available_models').select('id, provider_slug, model_key')
        modelId = (av ?? []).find((m: any) => `${m.provider_slug}/${m.model_key}` === b.model)?.id
        if (!modelId) throw new HttpError(404, 'model_not_found', 'Modelo no encontrado o deshabilitado.')
      }
      const { model, provider, apiKey } = await loadModel(db, modelId)
      await checkProviderLimits(db, provider)
      const controller = new AbortController()
      req.signal.addEventListener('abort', () => controller.abort())
      const t0 = Date.now()
      const gen = streamFromProvider({ provider, apiKey, model, messages: b.messages, maxTokens: Number(b.max_tokens) || undefined, temperature: typeof b.temperature === 'number' ? b.temperature : undefined, signal: controller.signal })
      const id = `chatcmpl-${crypto.randomUUID()}`
      const created = Math.floor(Date.now() / 1000)
      const done = (status: 'ok' | 'error', code: string | null, usage?: any) =>
        logUsage(db, { apiKeyId: key.id, providerId: provider.id, modelId: model.id, kind: 'api', status, errorCode: code, promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens, latencyMs: Date.now() - t0 })

      if (b.stream === true) {
        const enc = new TextEncoder()
        const body = new ReadableStream<Uint8Array>({
          async start(c) {
            const chunk = (delta: object, finish: string | null = null) => enc.encode(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: b.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
            let usage: any
            try {
              c.enqueue(chunk({ role: 'assistant' }))
              for await (const ev of gen) { if (ev.delta) c.enqueue(chunk({ content: ev.delta })); if (ev.usage) usage = ev.usage }
              c.enqueue(chunk({}, 'stop')); c.enqueue(enc.encode('data: [DONE]\n\n')); await done('ok', null, usage)
            } catch (e) {
              const code = e instanceof ProviderError ? e.code : 'internal'
              c.enqueue(enc.encode(`data: ${JSON.stringify({ error: { code, message: e instanceof ProviderError ? e.message : 'Error interno.' } })}\n\n`)); await done('error', code)
            } finally { try { c.close() } catch { /* cerrado */ } }
          },
          cancel() { controller.abort() },
        })
        return new Response(body, { headers: { ...corsHeaders(req), 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
      }
      let content = '', usage: any, finish = 'stop'
      try { for await (const ev of gen) { if (ev.delta) content += ev.delta; if (ev.usage) usage = ev.usage; if (ev.finish) finish = ev.finish } }
      catch (e) { await done('error', e instanceof ProviderError ? e.code : 'internal'); throw e instanceof ProviderError ? new HttpError(e.status, e.code, e.message) : e }
      await done('ok', null, usage)
      return json(req, { id, object: 'chat.completion', created, model: b.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finish }], usage: usage ?? null })
    }
    throw new HttpError(404, 'not_found', 'Ruta no encontrada. Ver docs/API.md.')
  } catch (e) {
    return errorResponse(req, e)
  }
})
