// Cut-real 2 · texto → voz con proveedor externo OpenAI-compatible (POST {TTS_BASE_URL}/audio/speech).
// Sin configuración devuelve 501 y el cliente usa el motor del navegador. Ver docs/VOICE.md.
import { corsHeaders, errorResponse, HttpError } from '../_shared/cors.ts'
import { authenticate, logUsage, rateLimit } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Método no permitido.')
    const ctx = await authenticate(req)
    const base = Deno.env.get('TTS_BASE_URL'), key = Deno.env.get('TTS_API_KEY')
    if (!base || !key) throw new HttpError(501, 'tts_not_configured', 'No hay un proveedor de voz configurado en el servidor.')
    await rateLimit(ctx.db, `tts:${ctx.userId}`, 30)
    const b = await req.json().catch(() => null)
    const input = typeof b?.text === 'string' ? b.text.trim().slice(0, 4000) : ''
    if (!input) throw new HttpError(400, 'bad_request', 'Falta el texto.')
    const t0 = Date.now()
    const res = await fetch(`${base.replace(/\/$/, '')}/audio/speech`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: Deno.env.get('TTS_MODEL') ?? 'tts-1', voice: Deno.env.get('TTS_VOICE') ?? 'onyx', input, response_format: 'mp3' }),
    })
    if (!res.ok || !res.body) {
      await logUsage(ctx.db, { userId: ctx.userId, kind: 'tts', status: 'error', errorCode: `http_${res.status}`, latencyMs: Date.now() - t0 })
      throw new HttpError(502, 'tts_failed', 'El proveedor de voz no pudo generar el audio.')
    }
    await logUsage(ctx.db, { userId: ctx.userId, kind: 'tts', status: 'ok', latencyMs: Date.now() - t0 })
    return new Response(res.body, { headers: { ...corsHeaders(req), 'Content-Type': res.headers.get('content-type') ?? 'audio/mpeg' } })
  } catch (e) { return errorResponse(req, e) }
})
