// Cut-real 2 · voz → texto (Whisper vía Groq). Requiere el secreto GROQ_API_KEY. Motor intercambiable: ver docs/VOICE.md
import { corsHeaders, errorResponse, HttpError, json } from '../_shared/cors.ts'
import { authenticate, logUsage, rateLimit } from '../_shared/supabase.ts'

const MAX_BYTES = 20 * 1024 * 1024

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Método no permitido.')
    const ctx = await authenticate(req)
    const key = Deno.env.get('GROQ_API_KEY')
    if (!key) throw new HttpError(503, 'stt_not_configured', 'La transcripción de voz todavía no está configurada en el servidor (falta GROQ_API_KEY).')
    await rateLimit(ctx.db, `stt:${ctx.userId}`, 20)
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'bad_request', 'Falta el audio.')
    if (file.size > MAX_BYTES) throw new HttpError(413, 'too_large', 'El audio supera los 20 MB.')
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/webm')) throw new HttpError(415, 'unsupported', 'Formato de audio no soportado.')
    const lang = String(form?.get('language') ?? 'es').slice(0, 5)
    const out = new FormData()
    out.append('file', file, file.name || 'audio.webm')
    out.append('model', Deno.env.get('STT_MODEL') ?? 'whisper-large-v3-turbo')
    out.append('language', /^[a-z]{2}$/.test(lang) ? lang : 'es')
    out.append('response_format', 'json')
    const t0 = Date.now()
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: out })
    if (!res.ok) {
      await logUsage(ctx.db, { userId: ctx.userId, kind: 'stt', status: 'error', errorCode: `http_${res.status}`, latencyMs: Date.now() - t0 })
      throw new HttpError(res.status === 429 ? 429 : 502, 'stt_failed', res.status === 429 ? 'Límite de transcripción alcanzado. Probá en un momento.' : 'No se pudo transcribir el audio.')
    }
    const j = await res.json()
    await logUsage(ctx.db, { userId: ctx.userId, kind: 'stt', status: 'ok', latencyMs: Date.now() - t0 })
    return json(req, { text: String(j.text ?? '').trim() })
  } catch (e) { return errorResponse(req, e) }
})
