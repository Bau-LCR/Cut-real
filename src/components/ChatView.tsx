import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isGenerating, useChat } from '../store/chat'
import { useUi } from '../store/ui'
import { Composer } from './Composer'
import { MessageItem } from './MessageItem'
import { Menu, X } from './icons'
import type { Attachment } from '../lib/types'

const STARTERS = [
  { t: 'Explicame un tema', d: 'Con ejemplos y un resumen al final', p: 'Explicame de forma clara y con ejemplos el tema: ' },
  { t: 'Armá un cuadro comparativo', d: 'En una tabla ordenada', p: 'Armá un cuadro comparativo entre: ' },
  { t: 'Practicá con un examen', d: 'Preguntas y corrección', p: 'Creá un examen de práctica de 8 preguntas sobre: ' },
  { t: 'Escribí o corregí código', d: 'Con explicación paso a paso', p: 'Escribí y explicá un programa que: ' },
]

export function ChatView({ convId }: { convId?: string }) {
  const nav = useNavigate()
  const open = useChat((s) => s.openConversation)
  const conv = useChat((s) => (convId ? s.conversations.find((c) => c.id === convId) : undefined))
  const msgs = useChat((s) => (convId ? s.messages[convId] : undefined))
  const hasOlder = useChat((s) => (convId ? s.olderHasMore[convId] : false))
  const loading = useChat((s) => (convId ? s.loadingConv[convId] : false))
  const generating = useChat((s) => isGenerating(s, convId))
  const error = useChat((s) => (convId ? s.errors[convId] : null))
  const models = useChat((s) => s.models)
  const modelId = useChat((s) => s.modelId)
  const { setModel, createConversation, send, regenerate, edit, cancel, loadOlder, dismissError } = useChat.getState()
  const setSidebar = useUi((s) => s.setSidebar)
  const setVoice = useUi((s) => s.setVoice)
  const [seed, setSeed] = useState<{ t: string; n: number }>()
  const threadRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => { if (convId) void open(convId) }, [convId, open])
  useEffect(() => { document.title = conv?.title && conv.title !== 'Nueva conversación' ? `${conv.title} · Cut-real` : 'Cut-real' }, [conv?.title])

  // Auto-scroll solo si la persona está al final (no la arrastra si está leyendo arriba).
  const onScroll = () => { const el = threadRef.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120 }
  useLayoutEffect(() => { const el = threadRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight }, [msgs, generating])
  useEffect(() => { stick.current = true }, [convId])

  const modelName = useMemo(() => Object.fromEntries(models.map((m) => [m.id, m.display_name])), [models])
  const lastId = msgs?.at(-1)?.id

  async function ensureConv() {
    if (convId) return convId
    const id = await createConversation()
    nav(`/c/${id}`, { replace: true })
    return id
  }
  async function onSubmit(text: string, attachments: Attachment[], webSearch: boolean, imageSearch: boolean) {
    try {
      const id = await ensureConv()
      stick.current = true
      const r = await send(id, text, { attachments, webSearch, imageSearch })
      return r.ok
    } catch (e) { useUi.getState().toast('error', (e as Error).message); return false }
  }

  const empty = !msgs?.length && !loading
  return (
    <div className="main">
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={() => setSidebar(true)} aria-label="Abrir menú"><Menu /></button>
        <div className="title">{conv?.title ?? 'Nueva conversación'}</div>
        <select className="field model-select" value={modelId ?? ''} onChange={(e) => setModel(e.target.value)} aria-label="Modelo">
          {models.length === 0 && <option value="">Sin modelos</option>}
          {models.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
      </div>

      <div className="thread" ref={threadRef} onScroll={onScroll}>
        {empty ? (
          <div className="empty">
            <img src={`${import.meta.env.BASE_URL}brand/Logo_Original.png`} alt="Cut-real" />
            <h1>¿Qué vamos a resolver hoy?</h1>
            <p>Estudio, código, documentos o ideas. Empezá escribiendo o elegí un punto de partida.</p>
            <div className="starters">
              {STARTERS.map((s) => <button key={s.t} onClick={() => setSeed({ t: s.p, n: Date.now() })}><b>{s.t}</b>{s.d}</button>)}
            </div>
          </div>
        ) : (
          <div className="thread-inner">
            {hasOlder && <button className="btn sm older" onClick={() => convId && loadOlder(convId)}>Cargar mensajes anteriores</button>}
            {loading && !msgs?.length && <div className="typing" role="status"><i /><i /><i /></div>}
            {msgs?.map((m) => (
              <MessageItem key={m.id} msg={m} isLast={m.id === lastId} busy={generating} modelName={m.model_id ? modelName[m.model_id] : undefined}
                onRegenerate={(id) => convId && regenerate(convId, id, false)} onEdit={(id, t) => convId && edit(convId, id, t)} />
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="composer" style={{ paddingBottom: 0 }}>
          <div className="notice error" role="alert" style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="grow">{error}</div>
            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => convId && dismissError(convId)} aria-label="Cerrar aviso"><X className="sm" /></button>
          </div>
        </div>
      )}
      <Composer convId={convId} generating={generating} seed={seed}
        onSubmit={onSubmit} onStop={() => convId && cancel(convId)} onVoice={() => setVoice(true)} />
    </div>
  )
}
