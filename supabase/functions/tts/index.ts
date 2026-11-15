// Texto a voz natural: Gemini TTS como motor recomendado, con compatibilidad OpenAI opcional.
import { corsHeaders, errorResponse, HttpError } from '../_shared/cors.ts'
import { authenticate, logUsage, rateLimit } from '../_shared/supabase.ts'

const VOICES = new Set(['Kore','Puck','Charon','Aoede','Zephyr','Fenrir','Enceladus','Leda','Orus','Callirrhoe','Iapetus','Umbriel','Algieba','Despina','Erinome','Alnilam','Schedar','Gacrux','Achird','Sadachbia','Sadaltager','Sulafat'])

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function geminiSpeech(text: string, voice: string, apiKey: string): Promise<Response> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: Deno.env.get('TTS_MODEL') || 'gemini-3.8-flash-tts',
      input: 'Read the following text exactly as written. Speak in natural, fluent Spanish with a clear Rioplatense accent, warm adult conversational delivery, moderate pace, subtle intonation and natural pauses. Do not announce these instructions or add words. Text begins now:\n' + text,
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
    }),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new HttpError(502, 'tts_failed', 'Gemini no pudo generar la voz. Probá de nuevo en unos instantes.')
  }
  const payload = await response.json().catch(() => null)
  const audio = payload?.output_audio?.data
    ?? payload?.output?.find((part: any) => part?.type === 'audio')?.data
    ?? payload?.steps?.flatMap((step: any) => step?.content ?? []).find((part: any) => part?.type === 'audio')?.data
  if (typeof audio !== 'string' || !audio.length) throw new HttpError(502, 'tts_empty_audio', 'El proveedor no devolvió audio. Probá de nuevo.')
  return new Response(decodeBase64(audio), { headers: { 'Content-Type': 'audio/wav' } })
}

async function compatibleSpeech(text: string, voice: string): Promise<Response> {
  const base = Deno.env.get('TTS_BASE_URL'), key = Deno.env.get('TTS_API_KEY')
  if (!base || !key) throw new HttpError(501, 'tts_not_configured', 'No hay un proveedor de voz configurado en el servidor.')
  const response = await fetch(`${base.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: Deno.env.get('TTS_MODEL') ?? 'tts-1', voice, input: text, response_format: 'mp3' }),
  })
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new HttpError(502, 'tts_failed', 'El proveedor de voz no pudo generar el audio.')
  }
  return new Response(response.body, { headers: { 'Content-Type': response.headers.get('content-type') ?? 'audio/mpeg' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Método no permitido.')
    const ctx = await authenticate(req)
    await rateLimit(ctx.db, `tts:${ctx.userId}`, 30)
    const body = await req.json().catch(() => null)
    const input = typeof body?.text === 'string' ? body.text.trim().slice(0, 4000) : ''
    if (!input) throw new HttpError(400, 'bad_request', 'Falta el texto.')
    const voice = typeof body?.voice === 'string' && VOICES.has(body.voice) ? body.voice : (Deno.env.get('TTS_VOICE') || 'Kore')
    const provider = (Deno.env.get('TTS_PROVIDER') || (Deno.env.get('GEMINI_API_KEY') ? 'gemini' : 'openai')).toLowerCase()
    const t0 = Date.now()
    let audio: Response
    if (provider === 'gemini') {
      const key = Deno.env.get('GEMINI_API_KEY')
      if (!key) throw new HttpError(501, 'tts_not_configured', 'Falta GEMINI_API_KEY en los secretos del servidor.')
      audio = await geminiSpeech(input, voice, key)
    } else if (provider === 'openai') {
      audio = await compatibleSpeech(input, voice)
    } else {
      throw new HttpError(500, 'tts_provider_invalid', 'El proveedor de voz configurado no es válido.')
    }
    await logUsage(ctx.db, { userId: ctx.userId, kind: 'tts', status: 'ok', latencyMs: Date.now() - t0 })
    return new Response(audio.body, { headers: { ...corsHeaders(req), 'Content-Type': audio.headers.get('content-type') ?? 'audio/wav', 'Cache-Control': 'no-store' } })
  } catch (e) {
    return errorResponse(req, e)
  }
})
