import { memo, useEffect, useState } from 'react'
import type { Attachment, Message } from '../lib/types'
import { STALE_MS, formatBytes } from '../lib/format'
import { openAttachment } from '../lib/files'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useSpeech } from '../store/speech'
import { CopyButton, Markdown } from './Markdown'
import { callFnBlob } from '../lib/functions'
import { supabase } from '../lib/supabase'
import { Edit, File, Pause, Play, Refresh, Stop, Volume, X } from './icons'

const DOCUMENT_RE = /\[\[CUTREAL_DOCUMENT:(pdf|docx)\|([^\]\r\n]{1,160})\]\]\s*([\s\S]*?)\s*\[\[\/CUTREAL_DOCUMENT\]\]/i

function DocumentPreview({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<'pdf' | 'docx'>('pdf')
  const [loading, setLoading] = useState<'preview' | 'download' | null>(null)
  const [error, setError] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [wordReady, setWordReady] = useState(false)

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

  async function createFile(action: 'preview' | 'download') {
    if (loading || !content.trim()) return
    setLoading(action)
    setError('')
    try {
      const images = [...content.matchAll(/<!--CUTREAL_IMAGE:([0-9a-f-]{36})\|([^>]*)-->/gi)].map((match) => ({ id: match[1], alt: match[2].trim() })).slice(0, 8)
      const blob = await callFnBlob('generate-document', {
        format,
        title: title.trim() || 'Documento',
        content,
        images,
      })
      if (action === 'preview') {
        if (format === 'pdf') {
          const nextUrl = URL.createObjectURL(blob)
          setPdfUrl(previous => {
            if (previous) URL.revokeObjectURL(previous)
            return nextUrl
          })
          setWordReady(false)
        } else {
          setWordReady(true)
          setPdfUrl(previous => {
            if (previous) URL.revokeObjectURL(previous)
            return ''
          })
        }
        setOpen(true)
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = (title.trim() || 'Documento').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 70) + '.' + format
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1500)
      }
    } catch (e) {
      setError((e as Error).message || 'No se pudo generar el documento.')
    } finally {
      setLoading(null)
    }
  }

  function closePreview() {
    setOpen(false)
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    setPdfUrl('')
    setWordReady(false)
  }

  return (
    <section className="generated-document-preview">
      <div className="generated-document">
        <div className="generated-document-info">
          <b>{title}</b>
          <small>Documento generado · vista previa de solo lectura</small>
          {error && <small className="document-error">{error}</small>}
        </div>
        <div className="document-actions">
          <button className="btn sm" onClick={() => void createFile('preview')} disabled={!!loading}>
            {loading === 'preview' ? 'Preparando vista…' : 'Vista previa'}
          </button>
          <button className="btn primary sm" onClick={() => void createFile('download')} disabled={!!loading}>
            {loading === 'download' ? 'Preparando…' : 'Descargar ' + (format === 'docx' ? 'Word' : 'PDF')}
          </button>
          <select className="field document-format-select" value={format} onChange={e => setFormat(e.target.value as 'pdf' | 'docx')} aria-label="Formato del documento">
            <option value="pdf">PDF</option>
            <option value="docx">Word</option>
          </select>
        </div>
      </div>
      {open && (
        <div className="document-preview-backdrop" role="presentation" onClick={closePreview}>
          <aside className="document-preview-panel" role="dialog" aria-modal="true" aria-label={'Vista previa de ' + title} onClick={e => e.stopPropagation()}>
            <header className="document-preview-header">
              <div><b>{title}</b><small>{format === 'pdf' ? 'PDF original · vista previa' : 'Word · vista orientativa de solo lectura'}</small></div>
              <div className="document-preview-header-actions">
                {format === 'pdf' && pdfUrl && <a className="btn sm" href={pdfUrl} target="_blank" rel="noreferrer">Abrir PDF</a>}
                <button className="btn sm" onClick={closePreview}>Cerrar</button>
              </div>
            </header>
            <div className="document-preview-content">
              {format === 'pdf' && pdfUrl
                ? <iframe className="document-pdf-frame" src={pdfUrl} title={'Vista previa PDF: ' + title} />
                : wordReady || format === 'docx'
                  ? <article className="document-word-preview"><h1>{title}</h1><Markdown text={content} /></article>
                  : <div className="document-preview-empty">Preparando vista previa…</div>}
            </div>
            <footer className="document-preview-footer">
              <button className="btn primary" onClick={() => void createFile('download')} disabled={!!loading}>
                {loading === 'download' ? 'Preparando…' : 'Descargar ' + (format === 'docx' ? 'Word' : 'PDF')}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </section>
  )
}

const RATES = [1, 1.25, 1.5, 0.75]

function SpeakControls({ msg }: { msg: Message }) {
  const { activeId, paused, speak, pause, resume, stop } = useSpeech()
  const voice = useAuth((s) => s.voice)
  const saveSettings = useAuth((s) => s.saveSettings)
  const active = activeId === msg.id
  if (!active) return <button className="icon-btn" title="Escuchar respuesta" aria-label="Escuchar respuesta" onClick={() => speak(msg.id, msg.content)}><Volume /></button>
  const nextRate = RATES[(RATES.indexOf(voice.rate) + 1) % RATES.length]
  return (
    <>
      <button className="icon-btn on" title={paused ? 'Reanudar' : 'Pausar'} aria-label={paused ? 'Reanudar' : 'Pausar'} onClick={paused ? resume : pause}>{paused ? <Play /> : <Pause />}</button>
      <button className="icon-btn" title="Detener lectura" aria-label="Detener lectura" onClick={stop}><Stop /></button>
      <button className="btn ghost sm" title="Cambiar velocidad" onClick={() => saveSettings({ voice: { ...voice, rate: nextRate } }).catch(() => {})}>{voice.rate}×</button>
    </>
  )
}

function Chips({ list }: { list: Attachment[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Attachment | null>(null)
  const images = list.filter((item) => item.mime_type.startsWith('image/'))
  const otherFiles = list.filter((item) => !item.mime_type.startsWith('image/'))

  useEffect(() => {
    let active = true
    Promise.all(images.map(async (item) => {
      const { data } = await supabase.storage.from('cr-attachments').createSignedUrl(item.storage_path, 3600)
      return [item.id, data?.signedUrl ?? ''] as const
    })).then((entries) => {
      if (active) setUrls(Object.fromEntries(entries.filter(([, url]) => !!url)))
    })
    return () => { active = false }
  }, [list])

  useEffect(() => {
    if (!selected) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selected])

  return (
    <>
      {images.length > 0 && <div className="chat-image-attachments" aria-label="Imágenes adjuntas">
        {images.map((item) => urls[item.id] ? (
          <button className="chat-image-thumb" key={item.id} onClick={() => setSelected(item)} title="Ampliar imagen">
            <img src={urls[item.id]} alt={item.file_name} loading="lazy" />
            <span>{item.file_name}</span>
          </button>
        ) : (
          <span className="chat-image-loading" key={item.id}>{item.file_name} · cargando imagen…</span>
        ))}
      </div>}
      {otherFiles.length > 0 && <div className="chips">
        {otherFiles.map((a) => (
          <div className="attachment-chip-wrap" key={a.id}>
            <button className={'chip ' + (a.status !== 'processed' ? 'warn' : '')} onClick={() => openAttachment(a)} title="Abrir archivo">
              <File className="sm" /><span className="n">{a.file_name}</span>
              <small>{formatBytes(a.size_bytes)}{a.status === 'processed' ? ' · leído' : ' · sin analizar'}</small>
            </button>
          </div>
        ))}
      </div>}
      {selected && urls[selected.id] && (
        <div className="image-lightbox" role="presentation" onClick={() => setSelected(null)}>
          <div className="image-lightbox-panel" role="dialog" aria-modal="true" aria-label={selected.file_name} onClick={(event) => event.stopPropagation()}>
            <button className="image-lightbox-close" onClick={() => setSelected(null)} aria-label="Cerrar imagen"><X /></button>
            <img src={urls[selected.id]} alt={selected.file_name} />
            <span>{selected.file_name}</span>
          </div>
        </div>
      )}
    </>
  )
}
interface Props { msg: Message; isLast: boolean; busy: boolean; modelName?: string; onRegenerate(id: string): void; onEdit(id: string, text: string): void }

export const MessageItem = memo(function MessageItem({ msg, isLast, busy, modelName, onRegenerate, onEdit }: Props) {
  const files = useChat((s) => s.attachments[msg.id])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(msg.content)

  if (msg.role === 'user') {
    return (
      <div className="msg user">
        <div className="col">
          {files?.length ? <Chips list={files} /> : null}
          {editing ? (
            <div className="edit-box">
              <textarea className="field" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Editar mensaje" autoFocus />
              <div className="row end" style={{ margin: 0 }}>
                <button className="btn sm" onClick={() => { setEditing(false); setDraft(msg.content) }}>Cancelar</button>
                <button className="btn primary sm" disabled={!draft.trim()} onClick={() => { setEditing(false); onEdit(msg.id, draft) }}>Guardar y reenviar</button>
              </div>
            </div>
          ) : msg.content ? <div className="bubble">{msg.content}</div> : null}
          {!editing && !msg.id.startsWith('tmp-') && (
            <div className="actions">
              <CopyButton text={msg.content} label="Copiar mensaje" />
              <button className="icon-btn" title="Editar y reenviar" aria-label="Editar y reenviar" disabled={busy} onClick={() => { setDraft(msg.content); setEditing(true) }}><Edit /></button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const stale = msg.status === 'generating' && Date.now() - +new Date(msg.updated_at) > STALE_MS
  const status = stale ? 'interrupted' : msg.status
  const generating = status === 'generating'
  return (
    <div className={`msg assistant${isLast ? ' last' : ''}`}>
      <img className="mark" src={`${import.meta.env.BASE_URL}brand/Logo_Original.png`} alt="" />
      <div className="body">
        {generating && !msg.content ? <div className="typing" role="status" aria-label="La IA está respondiendo"><i /><i /><i /></div> : null}
        {msg.content ? (() => {
          const artifact = !generating ? DOCUMENT_RE.exec(msg.content) : null
          const visible = (artifact ? msg.content.replace(artifact[0], '') : msg.content).replace(/\[\[CUTREAL_GENERATE_IMAGE:[\s\S]*?(?:\]\]|$)/g, '').trim()
          return <>{visible && <Markdown text={visible} streaming={generating} />}{artifact && <DocumentPreview title={artifact[2].trim()} content={artifact[3].trim()} />}</>
        })() : null}
        {msg.sources?.length ? (
          <div className="sources" aria-label="Fuentes">
            {msg.sources.map((s, i) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"><b>[{i + 1}] {s.title}</b><small>{s.url}</small></a>)}
          </div>
        ) : null}
        {status === 'error' && <div className="notice error" role="alert"><div className="grow"><div className="t">No se pudo completar la respuesta</div>{msg.error}</div>{isLast && !busy && <button className="btn sm" onClick={() => onRegenerate(msg.id)}>Reintentar</button>}</div>}
        {status === 'interrupted' && <div className="notice" role="status"><div className="grow">La generación se interrumpió antes de terminar.</div>{isLast && !busy && <button className="btn sm" onClick={() => onRegenerate(msg.id)}>Reintentar</button>}</div>}
        {status === 'cancelled' && <div className="meta-line">Generación detenida.</div>}
        {!generating && msg.token_usage != null && (useAuth.getState().me?.role === 'admin' || useAuth.getState().me?.role === 'owner') && (
          <div className="meta-line" title="Tokens de entrada y salida informados por el proveedor; estimación cuando no hay uso exacto.">{msg.token_usage.toLocaleString('es-AR')}</div>
        )}
        {!generating && (
          <div className="actions">
            {msg.content && <CopyButton text={msg.content} label="Copiar respuesta" />}
            {msg.content && <SpeakControls msg={msg} />}
            {isLast && !busy && <button className="icon-btn" title="Regenerar respuesta" aria-label="Regenerar respuesta" onClick={() => onRegenerate(msg.id)}><Refresh /></button>}
            {modelName && <span className="meta-line" style={{ marginLeft: 6 }}>{modelName}{msg.web_search_used ? ' · con búsqueda web' : ''}</span>}
          </div>
        )}
      </div>
    </div>
  )
})
