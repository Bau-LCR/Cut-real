import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { callFn, FnError, streamChat } from '../lib/functions'
import { mergeMessageSnapshot, STALE_MS } from '../lib/format'
import type { Attachment, Conversation, Message, ModelInfo, MsgStatus } from '../lib/types'
import { useAuth } from './auth'
import { useUi } from './ui'
import { useSpeech } from './speech'

const CONV_PAGE = 25
const MSG_PAGE = 40

interface Gen { controller: AbortController; assistantId: string | null }
export interface SendResult { ok: boolean; content?: string; status?: MsgStatus; error?: string }
export interface SendOpts { webSearch?: boolean; imageSearch?: boolean; attachments?: Attachment[]; silent?: boolean; ephemeral?: boolean; taskMode?: 'programming' }

interface ChatState {
  models: ModelInfo[]; modelId: string | null
  conversations: Conversation[]; convHasMore: boolean; convLoading: boolean; convLoaded: boolean
  messages: Record<string, Message[]>; olderHasMore: Record<string, boolean>; loadingConv: Record<string, boolean>
  attachments: Record<string, Attachment[]>              // por id de mensaje
  gens: Record<string, Gen>                              // generaciones locales activas, una por conversación
  errors: Record<string, string | null>
  searchResults: Conversation[] | null
  init(): Promise<void>
  reset(): void
  setModel(id: string): void
  loadConversations(more?: boolean): Promise<void>
  openConversation(id: string): Promise<void>
  loadOlder(id: string): Promise<void>
  createConversation(ephemeral?: boolean): Promise<string>
  rename(id: string, title: string): Promise<void>
  pin(id: string, pinned: boolean): Promise<void>
  remove(id: string): Promise<void>
  search(q: string): Promise<void>
  send(convId: string, text: string, opts?: SendOpts): Promise<SendResult>
  regenerate(convId: string, assistantId: string, webSearch?: boolean): Promise<SendResult>
  edit(convId: string, messageId: string, text: string): Promise<SendResult>
  cancel(convId: string): Promise<void>
  dismissError(convId: string): void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const recovering = new Set<string>()
const bySeq = (a: Message, b: Message) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER)
const byRecent = (a: Conversation, b: Conversation) => +new Date(b.last_message_at) - +new Date(a.last_message_at)
let channel: ReturnType<typeof supabase.channel> | null = null

export const useChat = create<ChatState>((set, get) => {
  // ---------- utilidades de estado ----------
  const patchMsg = (convId: string, id: string, patch: Partial<Message>) =>
    set((s) => ({ messages: { ...s.messages, [convId]: (s.messages[convId] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)) } }))

  const upsertMsg = (m: Message) =>
    set((s) => {
      const list = s.messages[m.conversation_id] ?? []
      const tmp = m.role === 'user' ? list.find((x) => x.id.startsWith('tmp-') && x.content === m.content) : undefined
      const without = list.filter((x) => x.id !== m.id && x.id !== tmp?.id)
      return { messages: { ...s.messages, [m.conversation_id]: [...without, m].sort(bySeq) } }
    })

  const upsertConv = (c: Conversation) =>
    set((s) => ({ conversations: [c, ...s.conversations.filter((x) => x.id !== c.id)].sort(byRecent) }))

  const setGen = (convId: string, g: Gen | null) =>
    set((s) => { const gens = { ...s.gens }; if (g) gens[convId] = g; else delete gens[convId]; return { gens } })

  const setError = (convId: string, e: string | null) => set((s) => ({ errors: { ...s.errors, [convId]: e } }))

  // Agrupa deltas: un único re-render cada ~40 ms por conversación, sin importar cuántos chunks lleguen.
  const pending = new Map<string, { msgId: string; text: string; timer: number | null }>()
  const flush = (convId: string) => {
    const p = pending.get(convId); if (!p) return
    if (p.timer) clearTimeout(p.timer)
    pending.delete(convId)
    if (!p.text) return
    set((s) => ({ messages: { ...s.messages, [convId]: (s.messages[convId] ?? []).map((m) => (m.id === p.msgId ? { ...m, content: m.content + p.text } : m)) } }))
  }
  const queueDelta = (convId: string, msgId: string, text: string) => {
    const p = pending.get(convId) ?? { msgId, text: '', timer: null }
    p.text += text
    if (!p.timer) p.timer = window.setTimeout(() => flush(convId), 40)
    pending.set(convId, p)
  }

  async function fetchAttachments(msgIds: string[]) {
    if (!msgIds.length) return
    const { data } = await supabase.from('cr_attachments').select('id, conversation_id, message_id, storage_path, file_name, mime_type, size_bytes, status, extracted_text').in('message_id', msgIds)
    if (!data?.length) return
    set((s) => {
      const next = { ...s.attachments }
      for (const a of data as Attachment[]) next[a.message_id!] = [...(next[a.message_id!] ?? []).filter((x) => x.id !== a.id), a]
      return { attachments: next }
    })
  }

  /** Si la conexión se corta, el servidor igual termina y guarda la respuesta. Acá la recuperamos. */
  async function recover(convId: string, id: string) {
    if (recovering.has(id)) return
    recovering.add(id)
    const t0 = Date.now()
    try {
      while (Date.now() - t0 < 4 * 60_000) {
        await sleep(1500)
        const { data } = await supabase.from('cr_messages').select('*').eq('id', id).maybeSingle()
        if (!data) break
        upsertMsg(data as Message)
        if (data.status !== 'generating') break
      }
    } finally { recovering.delete(id) }
  }

  async function reload(convId: string) {
    const { data } = await supabase.from('cr_messages').select('*').eq('conversation_id', convId).order('seq', { ascending: false }).limit(MSG_PAGE)
    set((s) => ({ messages: { ...s.messages, [convId]: ((data ?? []) as Message[]).reverse() } }))
  }

  // ---------- generación (una por conversación, totalmente independientes) ----------
  async function run(convId: string, body: Record<string, unknown>, o: { optimisticId?: string; attachments?: Attachment[]; silent?: boolean; ephemeral?: boolean } = {}): Promise<SendResult> {
    const controller = new AbortController()
    setGen(convId, { controller, assistantId: null })
    setError(convId, null)
    // Feedback instantáneo: se muestra el indicador de escritura antes de que el servidor responda.
    const tmpAsst: Message = {
      id: `tmp-a-${crypto.randomUUID()}`, conversation_id: convId, role: 'assistant', content: '', status: 'generating', model_id: get().modelId, error: null,
      sources: [], web_search_used: !!body.webSearch || !!body.imageSearch, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    set((s) => ({ messages: { ...s.messages, [convId]: [...(s.messages[convId] ?? []), tmpAsst] } }))
    const dropTmp = () => set((s) => ({ messages: { ...s.messages, [convId]: (s.messages[convId] ?? []).filter((m) => m.id !== tmpAsst.id) } }))
    let assistantId: string | null = null
    let finalStatus: MsgStatus | null = null
    let finalError: string | null = null
    let content = ''
    try {
      await streamChat(body, (ev) => {
        switch (ev.type) {
          case 'meta': {
            assistantId = ev.assistantMessageId
            const real = ev.userMessage as Message | null
            set((s) => {
              let list = (s.messages[convId] ?? []).filter((m) => m.id !== tmpAsst.id)
              if (real) list = list.map((m) => (m.id === o.optimisticId ? real : m))
              const asst: Message = {
                id: ev.assistantMessageId, seq: ev.assistantSeq, conversation_id: convId, role: 'assistant', content: '', status: 'generating',
                model_id: (body.modelId as string) ?? s.modelId, error: null, sources: [], web_search_used: !!body.webSearch,
                created_at: ev.assistantCreatedAt, updated_at: new Date().toISOString(),
              }
              const attachments = real && o.attachments?.length ? { ...s.attachments, [real.id]: o.attachments } : s.attachments
              return { messages: { ...s.messages, [convId]: [...list, asst] }, attachments }
            })
            setGen(convId, { controller, assistantId })
            break
          }
          case 'sources': if (assistantId) patchMsg(convId, assistantId, { sources: ev.sources }); break
          case 'delta': if (assistantId) { content += ev.text; queueDelta(convId, assistantId, ev.text) } break
          case 'replace': if (assistantId) { flush(convId); content = String(ev.text ?? ''); patchMsg(convId, assistantId, { content }) } break
          case 'notice': useUi.getState().toast('info', ev.message); break
          case 'done':
            flush(convId)
            finalStatus = ev.status; finalError = ev.error ?? null
            if (assistantId) patchMsg(convId, assistantId, { status: ev.status, error: ev.error ?? null })
            break
        }
      }, controller.signal)
    } catch (e) {
      flush(convId)
      if ((e as Error).name === 'AbortError') {
        if (assistantId) patchMsg(convId, assistantId, { status: 'cancelled' }); else dropTmp()
        return { ok: true, content, status: 'cancelled' }
      }
      const err = e instanceof FnError ? e : new FnError('internal', 'Ocurrió un error inesperado.')
      if (err.code === 'stream_dropped' && assistantId) {
        void recover(convId, assistantId)                      // el servidor sigue; se recupera sola
        useUi.getState().toast('info', 'Se cortó la conexión. Seguimos buscando tu respuesta…')
        return { ok: true, content, status: 'generating' }
      }
      if (assistantId) patchMsg(convId, assistantId, { status: 'error', error: err.message })
      else {
        dropTmp()
        // Falló antes de empezar: se deshace el mensaje optimista y se avisa.
        set((s) => ({ messages: { ...s.messages, [convId]: (s.messages[convId] ?? []).filter((m) => m.id !== o.optimisticId) } }))
        if (body.mode !== 'send') void reload(convId)
      }
      setError(convId, err.message)
      if (err.code === 'search_not_configured') useUi.getState().toast('error', err.message)
      return { ok: false, error: err.message }
    } finally { setGen(convId, null) }
    // Título automático: refrescar la conversación al terminar.
    if (!o.ephemeral) void supabase.from('cr_conversations').select('*').eq('id', convId).maybeSingle().then(({ data }) => data && upsertConv(data as Conversation))
    // Lectura automática (si está activada y no estamos en el modo conversación por voz, que habla por su cuenta).
    if (finalStatus === 'done' && assistantId && content && !o.silent && useAuth.getState().voice.auto_read && !useUi.getState().voiceOpen) void useSpeech.getState().speak(assistantId, content)
    return { ok: finalStatus !== 'error', content, status: finalStatus ?? 'done', error: finalError ?? undefined }
  }

  const currentModel = () => get().modelId

  return {
    models: [], modelId: null, conversations: [], convHasMore: false, convLoading: false, convLoaded: false,
    messages: {}, olderHasMore: {}, loadingConv: {}, attachments: {}, gens: {}, errors: {}, searchResults: null,

    async init() {
      const me = useAuth.getState().me; if (!me) return
      const { data: models } = await supabase.from('cr_available_models').select('*').order('sort_order')
      const list = (models ?? []) as ModelInfo[]
      const pref = useAuth.getState().defaultModelId
      set({ models: list, modelId: list.find((m) => m.id === pref)?.id ?? list.find((m) => m.model_key === 'qwen/qwen3.8-27b')?.id ?? list.find((m) => m.model_key === 'openai/gpt-oss-20b')?.id ?? list[0]?.id ?? null })
      await get().loadConversations()
      channel?.unsubscribe()
      channel = supabase.channel(`cr-sync-${me.userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cr_messages', filter: `user_id=eq.${me.userId}` }, (p) => {
          if (p.eventType === 'DELETE') {
            const id = (p.old as { id?: string }).id
            if (id) set((s) => ({ messages: Object.fromEntries(Object.entries(s.messages).map(([k, v]) => [k, v.filter((m) => m.id !== id)])) }))
            return
          }
          const m = p.new as Message
          if (get().gens[m.conversation_id]) return           // si este dispositivo está generando, manda el stream local
          if (!(m.conversation_id in get().messages)) return
          upsertMsg(m)
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cr_conversations', filter: `user_id=eq.${me.userId}` }, (p) => {
          if (p.eventType === 'DELETE') { const id = (p.old as { id?: string }).id; if (id) set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) })); return }
          if ((p.new as Conversation & { is_ephemeral?: boolean }).is_ephemeral) return
          upsertConv(p.new as Conversation)
        })
        .subscribe()
    },

    reset() {
      Object.values(get().gens).forEach((g) => g.controller.abort())
      channel?.unsubscribe(); channel = null
      set({ conversations: [], messages: {}, gens: {}, attachments: {}, errors: {}, convLoaded: false, searchResults: null })
    },

    setModel(id) { set({ modelId: id }) },

    async loadConversations(more = false) {
      if (get().convLoading) return
      set({ convLoading: true })
      let q = supabase.from('cr_conversations').select('*').eq('is_ephemeral', false).order('last_message_at', { ascending: false }).limit(CONV_PAGE)
      const last = get().conversations.at(-1)
      if (more && last) q = q.lt('last_message_at', last.last_message_at)
      const { data } = await q
      const rows = (data ?? []) as Conversation[]
      set((s) => ({
        conversations: more ? [...s.conversations, ...rows.filter((r) => !s.conversations.some((c) => c.id === r.id))] : rows,
        convHasMore: rows.length === CONV_PAGE, convLoading: false, convLoaded: true,
      }))
    },

    async openConversation(id) {
      const s0 = get()
      const conv = s0.conversations.find((c) => c.id === id)
      if (conv?.model_id && s0.models.some((m) => m.id === conv.model_id)) set({ modelId: conv.model_id })
      if (!conv) {
        const { data } = await supabase.from('cr_conversations').select('*').eq('id', id).maybeSingle()
        if (data) upsertConv(data as Conversation)
      }
      if (s0.gens[id] && s0.messages[id]) return                // generación local en curso: ya tenemos todo
      const messagesAtStart = get().messages[id] ?? []
      set((s) => ({ loadingConv: { ...s.loadingConv, [id]: true } }))
      const { data } = await supabase.from('cr_messages').select('*').eq('conversation_id', id).order('seq', { ascending: false }).limit(MSG_PAGE)
      const rows = ((data ?? []) as Message[]).reverse()
      // La consulta puede haber comenzado justo antes de enviar un mensaje. No reemplazamos
      // el stream local con una fotografía antigua del historial al terminar la petición.
      set((s) => {
        const current = s.messages[id] ?? []
        const changedWhileLoading = current !== messagesAtStart
        const merged = mergeMessageSnapshot(rows, current, changedWhileLoading || !!s.gens[id])
        return {
          messages: { ...s.messages, [id]: merged },
          olderHasMore: { ...s.olderHasMore, [id]: (data?.length ?? 0) === MSG_PAGE },
          loadingConv: { ...s.loadingConv, [id]: false },
        }
      })
      void fetchAttachments(rows.filter((m) => m.role === 'user').map((m) => m.id))
      for (const m of rows) if (m.status === 'generating' && Date.now() - +new Date(m.updated_at) < STALE_MS) void recover(id, m.id)
    },

    async loadOlder(id) {
      const first = get().messages[id]?.[0]; if (!first?.seq) return
      const { data } = await supabase.from('cr_messages').select('*').eq('conversation_id', id).lt('seq', first.seq).order('seq', { ascending: false }).limit(MSG_PAGE)
      const rows = ((data ?? []) as Message[]).reverse()
      set((s) => ({ messages: { ...s.messages, [id]: [...rows, ...(s.messages[id] ?? [])] }, olderHasMore: { ...s.olderHasMore, [id]: (data?.length ?? 0) === MSG_PAGE } }))
      void fetchAttachments(rows.filter((m) => m.role === 'user').map((m) => m.id))
    },

    async createConversation(ephemeral = false) {
      const me = useAuth.getState().me!
      const { data, error } = await supabase.from('cr_conversations').insert({ user_id: me.userId, model_id: currentModel(), is_ephemeral: ephemeral }).select().single()
      if (error || !data) throw new Error('No se pudo crear la conversación.')
      set((s) => ({ messages: { ...s.messages, [data.id]: [] }, olderHasMore: { ...s.olderHasMore, [data.id]: false } }))
      if (!ephemeral) upsertConv(data as Conversation)
      return data.id as string
    },

    async rename(id, title) {
      const t = title.trim().slice(0, 200); if (!t) return
      const { error } = await supabase.from('cr_conversations').update({ title: t, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) return useUi.getState().toast('error', 'No se pudo renombrar la conversación.')
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title: t } : c)) }))
    },

    async pin(id, pinned) {
      const { error } = await supabase.from('cr_conversations').update({ pinned }).eq('id', id)
      if (!error) set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, pinned } : c)) }))
    },

    async remove(id) {
      get().gens[id]?.controller.abort()
      const { error } = await supabase.from('cr_conversations').delete().eq('id', id)
      if (error) return useUi.getState().toast('error', 'No se pudo eliminar la conversación.')
      set((s) => {
        const messages = { ...s.messages }; delete messages[id]
        return { conversations: s.conversations.filter((c) => c.id !== id), messages }
      })
    },

    async search(q) {
      if (q.trim().length < 2) return set({ searchResults: null })
      const { data } = await supabase.rpc('cr_search_conversations', { q })
      set({ searchResults: (data ?? []).filter((row: Conversation & { is_ephemeral?: boolean }) => !row.is_ephemeral) as Conversation[] })
    },

    async send(convId, text, opts = {}) {
      const tmp: Message = {
        id: `tmp-${crypto.randomUUID()}`, conversation_id: convId, role: 'user', content: text.trim(), status: 'done', model_id: null, error: null,
        sources: [], web_search_used: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      set((s) => ({ messages: { ...s.messages, [convId]: [...(s.messages[convId] ?? []), tmp] }, attachments: opts.attachments?.length ? { ...s.attachments, [tmp.id]: opts.attachments } : s.attachments }))
      return run(convId, { mode: 'send', conversationId: convId, modelId: currentModel(), content: text.trim(), attachmentIds: opts.attachments?.map((a) => a.id), webSearch: !!opts.webSearch, imageSearch: !!opts.imageSearch, taskMode: opts.taskMode }, { optimisticId: tmp.id, attachments: opts.attachments, silent: opts.silent, ephemeral: opts.ephemeral })
    },

    async regenerate(convId, assistantId, webSearch = false) {
      set((s) => {
        const list = s.messages[convId] ?? []
        const i = list.findIndex((m) => m.id === assistantId)
        return i < 0 ? s : { messages: { ...s.messages, [convId]: list.slice(0, i) } }
      })
      return run(convId, { mode: 'regenerate', conversationId: convId, modelId: currentModel(), messageId: assistantId, webSearch })
    },

    async edit(convId, messageId, text) {
      set((s) => {
        const list = s.messages[convId] ?? []
        const i = list.findIndex((m) => m.id === messageId)
        return i < 0 ? s : { messages: { ...s.messages, [convId]: [...list.slice(0, i), { ...list[i], content: text.trim() }] } }
      })
      return run(convId, { mode: 'edit', conversationId: convId, modelId: currentModel(), messageId, content: text.trim() })
    },

    async cancel(convId) {
      const g = get().gens[convId]
      const ask = () => callFn('chat', { mode: 'cancel', conversationId: convId }).catch(() => {})
      await ask()
      g?.controller.abort()
      // Si se canceló antes de que el servidor creara el mensaje, reintentamos un instante después.
      if (g && !g.assistantId) { setTimeout(ask, 1500); setTimeout(ask, 4000) }
      // Si la generación venía de otro dispositivo/recuperación, el cambio llega por Realtime/polling.
      set((s) => ({ messages: { ...s.messages, [convId]: (s.messages[convId] ?? []).map((m) => (m.status === 'generating' ? { ...m, status: 'cancelled' as MsgStatus } : m)) } }))
    },

    dismissError(convId) { setError(convId, null) },
  }
})

/** ¿Hay una generación activa (local o recuperándose desde el servidor) en esta conversación? */
export function isGenerating(s: Pick<ChatState, 'gens' | 'messages'>, convId: string | undefined): boolean {
  if (!convId) return false
  if (s.gens[convId]) return true
  return (s.messages[convId] ?? []).some((m) => m.status === 'generating' && Date.now() - +new Date(m.updated_at) < STALE_MS)
}
