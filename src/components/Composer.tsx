import { useEffect, useRef, useState } from 'react'
import { ACCEPT, MAX_FILES_PER_MESSAGE, uploadAttachment, validateFile } from '../lib/files'
import { formatBytes } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Attachment } from '../lib/types'
import { MicSession, micErrorMessage, transcribe } from '../voice/recorder'
import { useAuth } from '../store/auth'
import { useUi } from '../store/ui'
import { ArrowUp, File, Globe, Mic, Paperclip, Stop, Waves, X } from './icons'

interface Item { key: string; name: string; size: number; state: 'uploading' | 'ready' | 'error'; attachment?: Attachment; note?: string }
interface Props {
  convId?: string; generating: boolean; seed?: { t: string; n: number }
  onSubmit(text: string, attachments: Attachment[], webSearch: boolean): Promise<boolean>
  onStop(): void; onVoice(): void
}

export function Composer({ convId, generating, onSubmit, onStop, onVoice, seed }: Props) {
  const me = useAuth((s) => s.me)!
  const webDefault = useAuth((s) => s.webSearchDefault)
  const saveSettings = useAuth((s) => s.saveSettings)
  const toast = useUi((s) => s.toast)
  const [text, setText] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [web, setWeb] = useState(webDefault)
  const [rec, setRec] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const micRef = useRef<{ mic: MicSession; stop: () => void; done: Promise<Blob | null> } | null>(null)

  useEffect(() => { setWeb(webDefault) }, [webDefault])
  useEffect(() => { if (seed) { setText(seed.t); taRef.current?.focus() } }, [seed])
  useEffect(() => {
    const t = taRef.current; if (!t) return
    t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'
  }, [text])
  useEffect(() => () => micRef.current?.mic.close(), [])

  const uploading = items.some((i) => i.state === 'uploading')
  const ready = items.filter((i) => i.state === 'ready').map((i) => i.attachment!)
  const canSend = !generating && !uploading && rec === 'idle' && (text.trim().length > 0 || ready.length > 0)

  async function addFiles(list: FileList | null) {
    if (!list) return
    const files = Array.from(list)
    if (items.length + files.length > MAX_FILES_PER_MESSAGE) return toast('error', `Podés adjuntar hasta ${MAX_FILES_PER_MESSAGE} archivos por mensaje.`)
    for (const f of files) {
      const err = validateFile(f)
      if (err) { toast('error', err); continue }
      const key = crypto.randomUUID()
      setItems((p) => [...p, { key, name: f.name, size: f.size, state: 'uploading' }])
      uploadAttachment(f, me.userId, convId ?? null)
        .then(({ attachment, note }) => setItems((p) => p.map((i) => (i.key === key ? { ...i, state: 'ready', attachment, note } : i))))
        .catch((e) => { toast('error', (e as Error).message); setItems((p) => p.filter((i) => i.key !== key)) })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function removeItem(i: Item) {
    setItems((p) => p.filter((x) => x.key !== i.key))
    if (i.attachment) {
      await supabase.from('cr_attachments').delete().eq('id', i.attachment.id)
      await supabase.storage.from('cr-attachments').remove([i.attachment.storage_path])
    }
  }

  async function toggleWebSearch() {
    const next = !web
    setWeb(next)
    try {
      await saveSettings({ web_search_default: next })
    } catch {
      setWeb(!next)
      toast('error', 'No se pudo guardar tu preferencia de búsqueda web.')
    }
  }

  async function submit() {
    if (!canSend) return
    const draft = { text, items, web }
    setText(''); setItems([])
    const ok = await onSubmit(draft.text, ready, draft.web)
    if (!ok) { setText(draft.text); setItems(draft.items) }          // no se pierde lo escrito si falló
  }

  async function toggleRecording() {
    if (rec === 'recording') { micRef.current?.stop(); return }
    if (!MicSession.supported) return toast('error', 'Tu navegador no permite grabar audio.')
    const mic = new MicSession()
    try { await mic.open() } catch (e) { return toast('error', (e as Error).message || micErrorMessage(e)) }
    const r = mic.record({ vad: false })
    micRef.current = { mic, ...r }
    setRec('recording')
    const blob = await r.done
    mic.close(); micRef.current = null
    if (!blob || blob.size < 1200) { setRec('idle'); return toast('info', 'No se escuchó nada. Probá de nuevo.') }
    setRec('transcribing')
    try {
      const t = await transcribe(blob)
      if (t) { setText((p) => (p ? p.trimEnd() + ' ' : '') + t); taRef.current?.focus() } else toast('info', 'No se pudo entender el audio.')
    } catch (e) { toast('error', (e as Error).message) }
    setRec('idle')
  }

  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  return (
    <div className="composer">
      {items.length > 0 && (
        <div className="chips attach">
          {items.map((i) => (
            <span key={i.key} className={`chip ${i.attachment && i.attachment.status !== 'processed' ? 'warn' : ''}`} title={i.note}>
              <File className="sm" /><span className="n">{i.name}</span>
              <small>{i.state === 'uploading' ? 'subiendo…' : i.attachment?.status === 'processed' ? `${formatBytes(i.size)} · leído` : (i.note ?? 'solo adjunto')}</small>
              <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => removeItem(i)} aria-label={`Quitar ${i.name}`}><X className="sm" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-box">
        <textarea
          ref={taRef} rows={1} value={text} placeholder="Escribí tu mensaje…" aria-label="Mensaje" maxLength={20000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() } }}
        />
        <div className="tools">
          <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <button className="icon-btn" title="Adjuntar archivos" aria-label="Adjuntar archivos" onClick={() => fileRef.current?.click()}><Paperclip /></button>
          <button className={`icon-btn${web ? ' on' : ''}`} title={web ? 'Búsqueda web activada' : 'Activar búsqueda web'} aria-pressed={web} aria-label="Búsqueda web" onClick={() => void toggleWebSearch()}><Globe /></button>
          <button className={`icon-btn${rec === 'recording' ? ' on' : ''}`} title={rec === 'recording' ? 'Detener grabación' : 'Dictar por voz'} aria-label="Dictar por voz" disabled={rec === 'transcribing'} onClick={toggleRecording}><Mic /></button>
          {rec === 'recording' && <span className="rec"><i />Grabando…</span>}
          {rec === 'transcribing' && <span className="rec" style={{ color: 'var(--muted)' }}>Transcribiendo…</span>}
          <span className="grow" />
          <button className="icon-btn" title="Conversación por voz" aria-label="Conversación por voz" onClick={onVoice}><Waves /></button>
          {generating
            ? <button className="send stop" onClick={onStop} title="Detener generación" aria-label="Detener generación"><Stop /></button>
            : <button className="send" onClick={submit} disabled={!canSend} title="Enviar" aria-label="Enviar mensaje"><ArrowUp /></button>}
        </div>
      </div>
      <p className="fine">Cut-real puede equivocarse. Verificá la información importante.</p>
    </div>
  )
}
