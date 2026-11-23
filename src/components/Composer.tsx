import { useEffect, useRef, useState } from 'react'
import { ACCEPT, MAX_FILES_PER_MESSAGE, uploadAttachment, validateFile } from '../lib/files'
import { formatBytes } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Attachment } from '../lib/types'
import { MicSession, micErrorMessage, transcribe } from '../voice/recorder'
import { useAuth } from '../store/auth'
import { useUi } from '../store/ui'
import { ArrowUp, File, Globe, ImageSearch, Mic, Paperclip, Stop, Waves, X } from './icons'

interface Item { key: string; name: string; size: number; state: 'uploading' | 'ready' | 'error'; attachment?: Attachment; note?: string; previewUrl?: string }
interface Props {
  convId?: string; generating: boolean; seed?: { t: string; n: number }
  onSubmit(text: string, attachments: Attachment[], webSearch: boolean, imageSearch: boolean): Promise<boolean>
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
  const [images, setImages] = useState(false)
  const [rec, setRec] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [micLevel, setMicLevel] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const micRef = useRef<{ mic: MicSession; stop: () => void; done: Promise<Blob | null> } | null>(null)
  const previewUrls = useRef(new Set<string>())

  useEffect(() => { setWeb(webDefault) }, [webDefault])
  useEffect(() => { if (seed) { setText(seed.t); taRef.current?.focus() } }, [seed])
  useEffect(() => {
    const t = taRef.current; if (!t) return
    t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'
  }, [text])
  useEffect(() => () => {
    micRef.current?.mic.close()
    for (const url of previewUrls.current) URL.revokeObjectURL(url)
    previewUrls.current.clear()
  }, [])

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
      const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
      if (previewUrl) previewUrls.current.add(previewUrl)
      setItems((p) => [...p, { key, name: f.name, size: f.size, state: 'uploading', previewUrl }])
      uploadAttachment(f, me.userId, convId ?? null)
        .then(({ attachment, note }) => setItems((p) => p.map((i) => (i.key === key ? { ...i, state: 'ready', attachment, note } : i))))
        .catch((e) => { if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrls.current.delete(previewUrl) } toast('error', (e as Error).message); setItems((p) => p.filter((i) => i.key !== key)) })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function removeItem(i: Item) {
    setItems((p) => p.filter((x) => x.key !== i.key))
    if (i.previewUrl) { URL.revokeObjectURL(i.previewUrl); previewUrls.current.delete(i.previewUrl) }
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
    const draft = { text, items, web, images }
    setText(''); setItems([])
    const ok = await onSubmit(draft.text, ready, draft.web, draft.images)
    if (!ok) { setText(draft.text); setItems(draft.items) }
    else {
      for (const url of previewUrls.current) URL.revokeObjectURL(url)
      previewUrls.current.clear()
    }          // no se pierde lo escrito si falló
  }

  async function toggleRecording() {
    if (rec === 'recording') { micRef.current?.stop(); return }
    if (!MicSession.supported) return toast('error', 'Tu navegador no permite grabar audio.')
    const mic = new MicSession()
    try { await mic.open() } catch (e) { return toast('error', (e as Error).message || micErrorMessage(e)) }
    const r = mic.record({ vad: false, onLevel: (level) => setMicLevel(Math.min(1, level * 7)) })
    micRef.current = { mic, ...r }
    setRec('recording')
    const blob = await r.done
    mic.close(); micRef.current = null; setMicLevel(0)
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
        <div className="attachment-previews" aria-label="Archivos seleccionados">
          {items.map((i) => i.previewUrl ? (
            <div className="attachment-preview-card" key={i.key} title={i.name}>
              <img src={i.previewUrl} alt={i.name} />
              <div className="attachment-preview-meta"><span>{i.name}</span><small>{i.state === 'uploading' ? 'Subiendo…' : i.attachment?.status === 'processed' ? 'Lista para enviar' : (i.note ?? 'Imagen adjunta')}</small></div>
              <button className="icon-btn" onClick={() => removeItem(i)} aria-label={`Quitar ${i.name}`}><X className="sm" /></button>
            </div>
          ) : (
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
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData.files)
            const itemFiles = Array.from(e.clipboardData.items).filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter((file): file is File => !!file)
            const files = pasted.length ? pasted : itemFiles
            if (files.length) {
              e.preventDefault()
              const transfer = new DataTransfer()
              files.forEach((file) => transfer.items.add(file))
              void addFiles(transfer.files)
              toast('info', files.length === 1 ? 'Archivo pegado y adjuntado al mensaje.' : files.length + ' archivos pegados y adjuntados al mensaje.')
            }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() } }}
        />
        <div className="tools">
          <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <button className="icon-btn" title="Adjuntar archivos" aria-label="Adjuntar archivos" onClick={() => fileRef.current?.click()}><Paperclip /></button>
          <button className={`icon-btn${web ? ' on' : ''}`} title={web ? 'Búsqueda web activada' : 'Activar búsqueda web'} aria-pressed={web} aria-label="Búsqueda web" onClick={() => void toggleWebSearch()}><Globe /></button>
          <button className={`icon-btn${images ? ' on' : ''}`} title={images ? 'Búsqueda de imágenes activada' : 'Buscar imágenes (también se activa al pedirlas)' } aria-pressed={images} aria-label="Buscar imágenes" onClick={() => setImages((value) => !value)}><ImageSearch /></button>
          <button className={`icon-btn${rec === 'recording' ? ' on' : ''}`} title={rec === 'recording' ? 'Detener grabación' : 'Dictar por voz'} aria-label="Dictar por voz" disabled={rec === 'transcribing'} onClick={toggleRecording}><Mic /></button>
          {rec === 'recording' && <span className="rec"><span className="waveform reactive" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ height: `${Math.max(3, Math.round((0.12 + micLevel * (0.35 + ((i * 7) % 9) / 9)) * 22))}px` }} />)}</span>Grabando…</span>}
          {rec === 'transcribing' && <span className="rec" style={{ color: 'var(--muted)' }}>Transcribiendo…</span>}
          <span className="grow" />
          <button className="icon-btn" title="Conversación por voz" aria-label="Conversación por voz" onClick={onVoice}><Waves /></button>
          {generating
            ? <button className="send stop" onClick={onStop} title="Detener generación" aria-label="Detener generación"><Stop /></button>
            : <button className="send" onClick={submit} disabled={!canSend} title="Enviar" aria-label="Enviar mensaje"><ArrowUp /></button>}
        </div>
      </div>
      <p className="fine">{images ? "Búsqueda de imágenes activada · consulta imágenes existentes en Internet." : "Podés pedirle a Cut-real que busque fotos o imágenes en Internet; también podés activar esta búsqueda con el botón de imágenes. Verificá la información importante."}</p>
    </div>
  )
}
