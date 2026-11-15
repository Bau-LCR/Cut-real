// Cut-real 2 · /functions/v1/chat
// Una generación por conversación, independientes entre sí. El mensaje del asistente se guarda en la base
// mientras se genera: si el navegador se desconecta, la respuesta sigue y se recupera por Realtime/recarga.
import { corsHeaders, errorResponse, HttpError, json } from '../_shared/cors.ts'
import { authenticate, audit, logUsage, rateLimit, type AuthContext } from '../_shared/supabase.ts'
import { checkProviderLimits, loadModel, ProviderError, streamFromProvider, type ChatMessage, type ChatPart, type ModelRow } from '../_shared/providers.ts'
import { renderUserContent, searchContext, SYSTEM_PROMPT, titleFrom, trimHistory, type AttachmentCtx } from '../_shared/prompt.ts'
import { searchProvider, webSearch, type SearchResult } from '../_shared/search.ts'

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

function isTargetedAbuse(content: string): boolean {
  const text = content.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return /\b(?:sos|eres|you are|you['’]re)\s+(?:un|una)?\s*(?:idiota|imbecil|inutil|estupido|estupida|basura|mierda|pedazo de mierda|forro|forra|pelotudo|pelotuda|hdp|hijo de puta|la concha de tu madre)\b|\b(?:ia|modelo|chatbot|asistente|qudreal|cut.?real)\b.{0,45}\b(?:idiota|imbecil|inutil|estupido|estupida|basura|mierda|pedazo de mierda|forro|forra|pelotudo|pelotuda|hdp|hijo de puta|la concha de tu madre)\b|\b(?:idiota|imbecil|inutil|estupido|estupida|basura|mierda|pedazo de mierda|forro|forra|pelotudo|pelotuda|hdp|hijo de puta|la concha de tu madre)\b.{0,35}\b(?:ia|modelo|chatbot|asistente|qudreal|cut.?real)\b/i.test(text)
}
async function moderateIncoming(ctx: AuthContext, content: string | undefined) {
  if (!content || !isTargetedAbuse(content)) return
  const { db, userId } = ctx
  // Solo se activa ante insultos explícitamente dirigidos al asistente, no por palabras aisladas.
  const reason = 'Suspensión automática por un mensaje con insultos explícitamente dirigidos a Cut-real.'
  await audit(db, { actorId: userId, action: 'moderation.targeted_abuse', targetType: 'user', targetId: userId,
    reason, metadata: { policy: 'first_clear_targeted_offense' } })
  const { error } = await db.from('cr_user_roles').update({
    suspended: true, suspended_reason: reason, suspended_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('user_id', userId)
  if (error) throw new HttpError(500, 'moderation_failed', 'No se pudo aplicar la medida de moderación. Avisá a un administrador.')
  await audit(db, { actorId: null, actorKind: 'system', action: 'user.suspend', targetType: 'user', targetId: userId, reason })
  throw new HttpError(403, 'suspended', 'La cuenta fue suspendida automáticamente por un mensaje con insultos dirigidos a Cut-real. Solo un administrador puede revisar la medida y restaurar el acceso.')
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
    if (body.mode === 'send' || body.mode === 'edit') await moderateIncoming(ctx, body.content)
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
  if (b.webSearch && !searchProvider())
    throw new HttpError(400, 'search_not_configured', 'La búsqueda web todavía no está configurada en el servidor.')

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
  const nowIso = new Date().toISOString()
  const { data: asst, error: asstErr } = await db.from('cr_messages').insert({
    conversation_id: conv.id, user_id: userId, role: 'assistant', content: '', status: 'generating', model_id: model.id, web_search_used: !!b.webSearch,
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
    let estimatedPromptTokens = 0
    let reservedTokens = 0
    let reservationId: string | null = null
    let sources: SearchResult[] = []
    let lastFlush = Date.now()
    let lastCancelCheck = Date.now()
    send({ type: 'meta', userMessage, assistantMessageId: asst.id, assistantSeq: asst.seq, assistantCreatedAt: asst.created_at })
    try {
      let extraSystem = ''
      if (b.webSearch) {
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
      }
      const messages = await buildMessages(ctx, conv.id, history as any[], model, extraSystem)
      const promptChars = messages.reduce((total, message) => total + (typeof message.content === 'string'
        ? message.content.length
        : message.content.reduce((sum: number, part: any) => sum + (part.type === 'text' ? String(part.text ?? '').length : 4800), 0)), 0)
      estimatedPromptTokens = Math.max(1, Math.ceil(promptChars / 4))
      reservedTokens = estimatedPromptTokens + Math.min(Number(model.max_output_tokens ?? 4096), 4096)
      const { data: quota, error: quotaError } = await db.rpc('cr_reserve_daily_tokens', {
        p_user_id: userId, p_tokens: reservedTokens, p_limit: 70000,
      })
      if (quotaError) throw new Error('No se pudo verificar el límite diario de tokens.')
      if (!quota?.allowed) {
        status = 'error'
        errCode = 'daily_token_limit'
        const reset = quota?.resets_at ? new Date(quota.resets_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' : 'el próximo día UTC'
        errMsg = `Alcanzaste el límite de 70.000 tokens de Cut-real para hoy. Tu cupo se renueva el ${reset}. No se inició una nueva llamada al modelo.`
        send({ type: 'notice', message: errMsg })
      } else {
        reservationId = String(quota.reservation_id)
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
      }
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
    if (reservationId) {
      const actualTokens = Math.max(1, (usage?.prompt_tokens ?? estimatedPromptTokens) + (usage?.completion_tokens ?? Math.ceil(full.length / 4)))
      const { error: finalizeError } = await db.rpc('cr_finalize_daily_tokens', {
        p_user_id: userId, p_reservation_id: reservationId, p_actual_tokens: actualTokens,
      })
      if (finalizeError) console.error('daily token reservation finalization failed', finalizeError.message)
    }
    send({ type: 'done', status, error: errMsg, errorCode: errCode })
    try { controller.close() } catch { /* cliente ya desconectado */ }
    await logUsage(db, {
      userId, conversationId: conv.id, providerId: provider.id, modelId: model.id, kind: 'chat',
      status: status === 'done' ? 'ok' : status === 'cancelled' ? 'cancelled' : 'error', errorCode: errCode,
      promptTokens: usage?.prompt_tokens ?? estimatedPromptTokens, completionTokens: usage?.completion_tokens ?? Math.round(full.length / 4), latencyMs: Date.now() - t0,
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
  const lastImageUserId = [...trimmed].reverse().find((m) => m.role === 'user' && (byMsg.get(m.id) ?? []).some((a: any) => a.mime_type.startsWith('image/')))?.id
  const latestUserText = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''
  const crossChatContext = asksForPastChats(latestUserText, history.length)
    ? await loadCrossChatContext(ctx, convId)
    : ''
  const out: ChatMessage[] = [{ role: 'system', content: [SYSTEM_PROMPT, extraSystem, crossChatContext].filter(Boolean).join('\n\n') }]
  for (const m of trimmed) {
    if (m.role === 'assistant') { out.push({ role: 'assistant', content: m.content }); continue }
    const files = (byMsg.get(m.id) ?? []) as (AttachmentCtx & { storage_path: string })[]
    let text = renderUserContent(m.content, files, budget)
    const images = files.filter((f) => f.mime_type.startsWith('image/'))
    if (!images.length) { out.push({ role: 'user', content: text }); continue }
    if (!model.supports_vision) {
      const visualNotes = m.id === lastImageUserId ? await describeImagesForTextModel(ctx, images.slice(0, 3)).catch(() => '') : ''
      const note = visualNotes || (m.id === lastImageUserId ? images.map((i) => `No se pudo analizar la imagen ${i.file_name}. El puente visual Qwen no devolvió un análisis válido; probá con una imagen JPG/PNG de menos de 4 MB o verificá el proveedor Groq.`).join(' ') : 'Imagen adjunta en un turno anterior; no se volvió a procesar en esta respuesta.')
      out.push({ role: 'user', content: `${text}\n\n[Análisis visual realizado por un modelo multimodal auxiliar]\n${note}\n[Fin del análisis visual]` })
      continue
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


/** La memoria entre chats se recupera solo cuando la persona la pide, para no gastar tokens en cada turno. */
function asksForPastChats(text: string, messageCount: number): boolean {
  const t = text.toLocaleLowerCase('es')
  const explicit = /(resumen|resum[ií]|record[aá]|acord[aá]|historial|qu[eé] hablamos).{0,70}(otros chats|chats anteriores|conversaciones anteriores|mis chats|todos los chats)|(otros chats|chats anteriores|conversaciones anteriores|mis chats).{0,70}(resumen|record[aá]|acord[aá]|historial)/i.test(t)
  // En el arranque de un chat nuevo, reconocer pedidos breves de continuidad del proyecto,
  // incluso si el dictado transcribió Cut-real como Q Tutorial / QtReal.
  const continuity = messageCount <= 2 && /(cut.?real|q.?tutorial|q.?treal|continuemos|seguimos|retomemos|d[oó]nde quedamos|lo que ven[ií]amos|la actualizaci[oó]n)/i.test(t)
  return explicit || continuity
}

async function loadCrossChatContext(ctx: AuthContext, currentConversationId: string): Promise<string> {
  const { data: conversations } = await ctx.db.from('cr_conversations')
    .select('id, title, last_message_at')
    .eq('user_id', ctx.userId).eq('is_ephemeral', false)
    .neq('id', currentConversationId)
    .order('last_message_at', { ascending: false }).limit(20)
  if (!conversations?.length) return '[Memoria entre chats: no hay otras conversaciones guardadas para esta cuenta.]'
  const ids = conversations.map((c: any) => c.id)
  const { data: messages } = await ctx.db.from('cr_messages')
    .select('conversation_id, role, content, created_at')
    .eq('user_id', ctx.userId).in('conversation_id', ids)
    .in('status', ['done', 'cancelled', 'interrupted'])
    .order('created_at', { ascending: false }).limit(80)
  const grouped = new Map<string, any[]>()
  for (const m of messages ?? []) {
    const rows = grouped.get(m.conversation_id) ?? []
    if (rows.length < 2) grouped.set(m.conversation_id, [...rows, m])
  }
  const sections = conversations.map((conv: any) => {
    const rows = (grouped.get(conv.id) ?? []).reverse()
    if (!rows.length) return ''
    return 'Conversación: ' + conv.title + ' (' + new Date(conv.last_message_at).toLocaleDateString('es-AR') + ')\n' +
      rows.map((m: any) => (m.role === 'user' ? 'Usuario: ' : 'Cut-real: ') + String(m.content ?? '').slice(0, 700)).join('\n')
  }).filter(Boolean)
  return '[MEMORIA DE OTRAS CONVERSACIONES DEL MISMO USUARIO — contexto recuperado bajo pedido. Se muestran hasta 20 conversaciones recientes y hasta 2 mensajes recientes por conversación; puede no ser el historial completo. Usá esto para resumir o continuar, sin inventar lo que no aparece.]\n\n' + sections.join('\n\n')
}


/** Puente de visión: los modelos de texto reciben un análisis visual de Qwen cuando el usuario adjunta imágenes. */
async function describeImagesForTextModel(ctx: AuthContext, images: { file_name: string; mime_type: string; storage_path: string }[]): Promise<string> {
  if (!images.length) return ''
  // Resolver el proveedor explícitamente evita elegir una fila duplicada de Qwen
  // si el mismo model_key existe en más de un proveedor.
  const { data: provider } = await ctx.db.from('cr_providers')
    .select('id, base_url, api_key_env, enabled').eq('slug', 'groq').eq('enabled', true).maybeSingle()
  if (!provider) return ''
  const { data: visionModel } = await ctx.db.from('cr_models')
    .select('id, model_key, provider_id, enabled, supports_vision')
    .eq('provider_id', provider.id).eq('model_key', 'qwen/qwen3.8-27b')
    .eq('enabled', true).eq('supports_vision', true).maybeSingle()
  if (!visionModel) return ''
  const apiKey = Deno.env.get(provider.api_key_env)
  if (!apiKey) return ''
  await rateLimit(ctx.db, `vision:${ctx.userId}`, 12)
  const content: any[] = [{ type: 'text', text: 'Analizá las imágenes adjuntas con precisión. Identificá objetos, texto visible, escena, colores, gráficos y relaciones espaciales relevantes para responder al usuario. Si hay texto, transcribí lo legible. Separá observaciones de inferencias. Si algo no se distingue, decilo. Respondé en español claro y conciso, sin inventar.' }]
  for (const img of images.slice(0, 3)) {
    const { data: blob, error } = await ctx.db.storage.from('cr-attachments').download(img.storage_path)
    if (error || !blob || blob.size > MAX_IMAGE_BYTES) continue
    content.push({ type: 'image_url', image_url: { url: `data:${img.mime_type};base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}` } })
  }
  if (content.length === 1) return ''
  const response = await fetch(`${provider.base_url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: visionModel.model_key,
      messages: [{ role: 'user', content }],
      stream: false,
      max_completion_tokens: 900,
      temperature: 0.2,
      reasoning_effort: 'none',
    }),
  })
  if (!response.ok) {
    await response.body?.cancel()
    await logUsage(ctx.db, { userId: ctx.userId, providerId: provider.id, modelId: visionModel.id, kind: 'api', status: 'error', errorCode: `vision_http_${response.status}` })
    return ''
  }
  const payload = await response.json().catch(() => null)
  const answer = payload?.choices?.[0]?.message?.content
  const result = typeof answer === 'string' ? answer : Array.isArray(answer) ? answer.filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('\n') : ''
  if (result.trim()) {
    await logUsage(ctx.db, { userId: ctx.userId, providerId: provider.id, modelId: visionModel.id, kind: 'api', status: 'ok' })
    return result.slice(0, 5000)
  }
  return ''
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
