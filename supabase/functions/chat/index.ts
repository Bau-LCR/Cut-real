// Cut-real 2 · /functions/v1/chat
// Una generación por conversación, independientes entre sí. El mensaje del asistente se guarda en la base
// mientras se genera: si el navegador se desconecta, la respuesta sigue y se recupera por Realtime/recarga.
import { corsHeaders, errorResponse, HttpError, json } from '../_shared/cors.ts'
import { authenticate, logUsage, rateLimit, type AuthContext } from '../_shared/supabase.ts'
import { checkProviderLimits, loadModel, ProviderError, streamFromProvider, type ChatMessage, type ChatPart, type ModelRow } from '../_shared/providers.ts'
import { renderUserContent, searchContext, SYSTEM_PROMPT, titleFrom, trimHistory, type AttachmentCtx } from '../_shared/prompt.ts'
import { searchProvider, shouldSearchWeb, webSearch, type SearchResult } from '../_shared/search.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_CONTENT = 20_000
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

interface Body {
  mode: 'send' | 'regenerate' | 'edit' | 'cancel'
  conversationId: string
  modelId?: string
  content?: string
  messageId?: string
  attachmentIds?: string[]
  webSearch?: boolean
}

function readBody(raw: any): Body {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'bad_request', 'Solicitud inválida.')
  if (!['send', 'regenerate', 'edit', 'cancel'].includes(raw.mode)) throw new HttpError(400, 'bad_request', 'Modo inválido.')
  if (!UUID.test(raw.conversationId ?? '')) throw new HttpError(400, 'bad_request', 'conversationId inválido.')
  for (const k of ['modelId', 'messageId']) if (raw[k] != null && !UUID.test(raw[k])) throw new HttpError(400, 'bad_request', `${k} inválido.`)
  if (raw.content != null && (typeof raw.content !== 'string' || raw.content.length > MAX_CONTENT))
    throw new HttpError(400, 'content_too_long', `El mensaje no puede superar ${MAX_CONTENT} caracteres.`)
  const ids = raw.attachmentIds ?? []
  if (!Array.isArray(ids) || ids.length > 5 || !ids.every((i: unknown) => typeof i === 'string' && UUID.test(i)))
    throw new HttpError(400, 'bad_request', 'Adjuntos inválidos (máximo 5).')
  return { mode: raw.mode, conversationId: raw.conversationId, modelId: raw.modelId, content: raw.content?.trim(), messageId: raw.messageId, attachmentIds: ids, webSearch: !!raw.webSearch }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Método no permitido.')
    const ctx = await authenticate(req)
    const body = readBody(await req.json().catch(() => null))
    if (body.mode === 'cancel') {
      const { count } = await ctx.db.from('cr_messages').update({ status: 'cancelled' }, { count: 'exact' })
        .eq('conversation_id', body.conversationId).eq('user_id', ctx.userId).eq('status', 'generating')
      return json(req, { ok: true, cancelled: count ?? 0 })
    }
    return await generate(req, ctx, body)
  } catch (e) {
    return errorResponse(req, e)
  }
})

async function generate(req: Request, ctx: AuthContext, b: Body): Promise<Response> {
  const { db, userId } = ctx
  const { data: conv } = await db.from('cr_conversations').select('id, title, model_id').eq('id', b.conversationId).eq('user_id', userId).maybeSingle()
  if (!conv) throw new HttpError(404, 'not_found', 'No encontramos esa conversación.')
  const modelId = b.modelId ?? conv.model_id
  if (!modelId) throw new HttpError(400, 'model_required', 'Elegí un modelo.')
  const { model, provider, apiKey } = await loadModel(db, modelId)

  await db.rpc('cr_sweep_stale_generations')
  const { count: active } = await db.from('cr_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conv.id).eq('status', 'generating')
  if (active) throw new HttpError(409, 'already_generating', 'Esta conversación ya está generando una respuesta.')

  await rateLimit(db, `chat:${userId}`, 40)
  await rateLimit(db, `chat:${userId}:${model.id}`, model.user_rpm_limit)
  await checkProviderLimits(db, provider)

  // --- 1. Preparar el historial según el modo ---------------------------------
  let userMessage: Record<string, unknown> | null = null
  if (b.mode === 'send') {
    if (!b.content && !b.attachmentIds?.length) throw new HttpError(400, 'empty', 'Escribí un mensaje.')
    const { data, error } = await db.from('cr_messages').insert({ conversation_id: conv.id, user_id: userId, role: 'user', content: b.content ?? '' }).select().single()
    if (error) throw new HttpError(500, 'internal', 'No se pudo guardar el mensaje.')
    userMessage = data
    if (b.attachmentIds?.length) await db.from('cr_attachments').update({ message_id: data.id, conversation_id: conv.id }).in('id', b.attachmentIds).eq('user_id', userId).is('message_id', null)
  } else {
    if (!b.messageId) throw new HttpError(400, 'bad_request', 'Falta messageId.')
    const { data: target } = await db.from('cr_messages').select('id, seq, role').eq('id', b.messageId).eq('conversation_id', conv.id).eq('user_id', userId).maybeSingle()
    if (!target) throw new HttpError(404, 'not_found', 'No encontramos ese mensaje.')
    if (b.mode === 'edit') {
      if (target.role !== 'user' || !b.content) throw new HttpError(400, 'bad_request', 'Solo se pueden editar mensajes propios con texto.')
      await db.from('cr_messages').update({ content: b.content, updated_at: new Date().toISOString() }).eq('id', target.id)
      await db.from('cr_messages').delete().eq('conversation_id', conv.id).gt('seq', target.seq)
    } else {
      if (target.role !== 'assistant') throw new HttpError(400, 'bad_request', 'Solo se regeneran respuestas de la IA.')
      await db.from('cr_messages').delete().eq('conversation_id', conv.id).gte('seq', target.seq)
    }
  }

  const { data: histRows } = await db.from('cr_messages').select('id, role, content, status').eq('conversation_id', conv.id)
    .in('status', ['done', 'cancelled', 'interrupted']).order('seq', { ascending: false }).limit(60)
  const history = (histRows ?? []).reverse().filter((m: any) => m.role !== 'assistant' || m.content)
  const lastUser = [...history].reverse().find((m: any) => m.role === 'user')
  if (!lastUser) throw new HttpError(400, 'empty', 'No hay un mensaje de usuario al que responder.')

  // --- 2. Mensaje del asistente (se actualiza mientras se genera) -------------
  const requestedSearch = b.webSearch || shouldSearchWeb(String((lastUser as any).content ?? ''))
  const useWebSearch = requestedSearch && !!searchProvider()
  const nowIso = new Date().toISOString()
  const { data: asst, error: asstErr } = await db.from('cr_messages').insert({
    conversation_id: conv.id, user_id: userId, role: 'assistant', content: '', status: 'generating', model_id: model.id, web_search_used: useWebSearch,
  }).select('id, seq, created_at').single()
  if (asstErr || !asst) throw new HttpError(500, 'internal', 'No se pudo iniciar la generación.')
  const convPatch: Record<string, unknown> = { last_message_at: nowIso, updated_at: nowIso, model_id: model.id }
  if (conv.title === 'Nueva conversación' && b.mode === 'send') convPatch.title = titleFrom(b.content || 'Archivo adjunto')
  await db.from('cr_conversations').update(convPatch).eq('id', conv.id)

  // --- 3. Streaming ------------------------------------------------------------
  const encoder = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let clientGone = false
  const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c }, cancel() { clientGone = true } })
  const send = (ev: unknown) => {
    if (clientGone) return
    try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`)) } catch { clientGone = true }
  }
  const abort = new AbortController()

  const run = (async () => {
    const t0 = Date.now()
    let full = ''
    let status: 'done' | 'error' | 'cancelled' = 'done'
    let errCode: string | null = null
    let errMsg: string | null = null
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
    let sources: SearchResult[] = []
    let lastFlush = Date.now()
    let lastCancelCheck = Date.now()
    send({ type: 'meta', userMessage, assistantMessageId: asst.id, assistantSeq: asst.seq, assistantCreatedAt: asst.created_at })
    try {
      let extraSystem = ''
      if (useWebSearch) {
        send({ type: 'status', status: 'searching' })
        try {
          sources = await webSearch((lastUser as any).content, abort.signal)
          extraSystem = searchContext(sources)
          await db.from('cr_messages').update({ sources }).eq('id', asst.id)
          send({ type: 'sources', sources })
          await logUsage(db, { userId, conversationId: conv.id, kind: 'search', status: 'ok' })
        } catch (e) {
          extraSystem = 'Se pidió búsqueda web pero FALLÓ: no tenés resultados. Respondé con tu conocimiento y aclaralo; no inventes fuentes ni enlaces.'
          send({ type: 'notice', message: 'La búsqueda web falló; la respuesta no incluye fuentes.' })
          await logUsage(db, { userId, conversationId: conv.id, kind: 'search', status: 'error', errorCode: String((e as Error).message).slice(0, 60) })
        }
      } else if (requestedSearch && !searchProvider()) {
        send({ type: 'notice', message: 'La búsqueda web se solicitó, pero todavía no está configurada. La respuesta no incluye fuentes.' })
      }
      const messages = await buildMessages(ctx, conv.id, history as any[], model, extraSystem)
      send({ type: 'status', status: 'generating' })
      for await (const ev of streamFromProvider({ provider, apiKey, model, messages, signal: abort.signal })) {
        if (ev.delta) {
          full += ev.delta
          send({ type: 'delta', text: ev.delta })
          if (Date.now() - lastFlush > 600) {
            lastFlush = Date.now()
            await db.from('cr_messages').update({ content: full, updated_at: new Date().toISOString() }).eq('id', asst.id)
          }
        }
        if (ev.usage) usage = ev.usage
        if (Date.now() - lastCancelCheck > 1000) {
          lastCancelCheck = Date.now()
          const { data: cur } = await db.from('cr_messages').select('status').eq('id', asst.id).maybeSingle()
          if (cur?.status === 'cancelled') { status = 'cancelled'; abort.abort(); break }
        }
      }
      if (status === 'done' && !full) { status = 'error'; errCode = 'empty_response'; errMsg = 'El modelo no devolvió contenido. Probá de nuevo o elegí otro modelo.' }
    } catch (e) {
      if (status !== 'cancelled') {
        status = 'error'
        if (e instanceof ProviderError) { errCode = e.code; errMsg = e.message }
        else if ((e as Error)?.name === 'AbortError') { errCode = 'aborted'; errMsg = 'La generación se interrumpió.' }
        else { errCode = 'internal'; errMsg = 'Ocurrió un error al generar la respuesta.'; console.error('generate failed', (e as Error)?.message) }
      }
    }
    // Estado final: puede haberse marcado "cancelled" desde otro request; se respeta.
    const { data: cur } = await db.from('cr_messages').select('status').eq('id', asst.id).maybeSingle()
    if (cur?.status === 'cancelled') status = 'cancelled'
    await db.from('cr_messages').update({ content: full, status, error: errMsg, updated_at: new Date().toISOString() }).eq('id', asst.id)
    await db.from('cr_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id)
    send({ type: 'done', status, error: errMsg, errorCode: errCode })
    try { controller.close() } catch { /* cliente ya desconectado */ }
    await logUsage(db, {
      userId, conversationId: conv.id, providerId: provider.id, modelId: model.id, kind: 'chat',
      status: status === 'done' ? 'ok' : status === 'cancelled' ? 'cancelled' : 'error', errorCode: errCode,
      promptTokens: usage?.prompt_tokens ?? null, completionTokens: usage?.completion_tokens ?? Math.round(full.length / 4), latencyMs: Date.now() - t0,
    })
  })()
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(run) // sigue aunque el cliente se desconecte

  return new Response(stream, {
    headers: { ...corsHeaders(req), 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  })
}

async function buildMessages(ctx: AuthContext, convId: string, history: { id: string; role: 'user' | 'assistant'; content: string }[], model: ModelRow, extraSystem: string): Promise<ChatMessage[]> {
  const trimmed = trimHistory(history, model.context_window)
  const ids = trimmed.filter((m) => m.role === 'user').map((m) => m.id)
  const { data: atts } = ids.length
    ? await ctx.db.from('cr_attachments').select('message_id, file_name, mime_type, status, extracted_text, storage_path').in('message_id', ids).eq('user_id', ctx.userId)
    : { data: [] as any[] }
  const byMsg = new Map<string, any[]>()
  for (const a of atts ?? []) byMsg.set(a.message_id, [...(byMsg.get(a.message_id) ?? []), a])

  const budget = { left: 60_000 }
  let imagesLeft = 4
  const out: ChatMessage[] = [{ role: 'system', content: [SYSTEM_PROMPT, extraSystem].filter(Boolean).join('\n\n') }]
  for (const m of trimmed) {
    if (m.role === 'assistant') { out.push({ role: 'assistant', content: m.content }); continue }
    const files = (byMsg.get(m.id) ?? []) as (AttachmentCtx & { storage_path: string })[]
    let text = renderUserContent(m.content, files, budget)
    const images = files.filter((f) => f.mime_type.startsWith('image/'))
    if (!images.length) { out.push({ role: 'user', content: text }); continue }
    if (!model.supports_vision) {
      text = `${images.map((i) => `[Imagen adjunta: ${i.file_name} — este modelo no puede ver imágenes; no la describas.]`).join('\n')}\n\n${text}`
      out.push({ role: 'user', content: text }); continue
    }
    const parts: ChatPart[] = [{ type: 'text', text: text || 'Describí la imagen adjunta.' }]
    for (const img of images) {
      if (imagesLeft-- <= 0) break
      const { data: blob } = await ctx.db.storage.from('cr-attachments').download(img.storage_path)
      if (!blob || blob.size > MAX_IMAGE_BYTES) { parts[0] = { type: 'text', text: `${(parts[0] as any).text}\n[Imagen ${img.file_name} omitida: supera 4 MB o no se pudo leer.]` }; continue }
      parts.push({ type: 'image_url', image_url: { url: `data:${img.mime_type};base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}` } })
    }
    out.push({ role: 'user', content: parts })
  }
  return out
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
