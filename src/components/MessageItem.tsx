import { memo, useState } from 'react'
import type { Attachment, Message } from '../lib/types'
import { STALE_MS, formatBytes } from '../lib/format'
import { openAttachment } from '../lib/files'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useSpeech } from '../store/speech'
import { CopyButton, Markdown } from './Markdown'
import { callFnBlob } from '../lib/functions'
import { Edit, File, Pause, Play, Refresh, Stop, Volume } from './icons'

const DOCUMENT_RE = /\[\[CUTREAL_DOCUMENT:(pdf|docx)\|([^\]\r\n]{1,160})\]\]\s*([\s\S]*?)\s*\[\[\/CUTREAL_DOCUMENT\]\]/i

function DocumentEditor({ title, content }: { title: string; content: string }) {
  const [value, setValue] = useState(content)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState<'pdf' | 'docx' | null>(null)
  const [error, setError] = useState('')
  async function download(format: 'pdf' | 'docx') {
    if (loading || !value.trim()) return
    setLoading(format); setError('')
    try {
      const blob = await callFnBlob('generate-document', { format, title, content: value })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = title.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 70) + '.' + format
      document.body.appendChild(a); a.click(); a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (e) { setError((e as Error).message || 'No se pudo generar el documento.') }
    finally { setLoading(null) }
  }
  return <section className="generated-document-editor">
    <div className="generated-document"><div><b>{title}</b><small>Documento editable · PDF y Word</small>{error && <small className="document-error">{error}</small>}</div><div className="document-actions"><button className="btn sm" onClick={() => setEditing(v => !v)}>{editing ? 'Cerrar editor' : 'Editar'}</button><button className="btn primary sm" onClick={() => void download('pdf')} disabled={!!loading}>{loading === 'pdf' ? 'Preparando…' : 'Descargar PDF'}</button><button className="btn sm" onClick={() => void download('docx')} disabled={!!loading}>{loading === 'docx' ? 'Preparando…' : 'Descargar Word'}</button></div></div>
    {editing && <div className="document-editor"><textarea className="field" value={value} onChange={e => setValue(e.target.value)} rows={14} aria-label="Editar contenido del documento" /><div className="document-preview"><b>Vista previa</b><Markdown text={value} /></div></div>}
  </section>
}

function AttachmentDocument({ file }: { file: Attachment }) {
  const [open, setOpen] = useState(false)
  if (!file.extracted_text?.trim()) return null
  return <div className="attachment-document"><button className="btn ghost sm" onClick={() => setOpen(v => !v)}>{open ? 'Cerrar editor' : 'Editar documento'}</button>{open && <DocumentEditor title={file.file_name.replace(/\.(pdf|docx)$/i, '') || 'Documento editado'} content={file.extracted_text} />}</div>
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
  return (
    <div className="chips">
      {list.map((a) => (
        <div className="attachment-chip-wrap" key={a.id}>
          <button className={'chip ' + (a.status !== 'processed' ? 'warn' : '')} onClick={() => openAttachment(a)} title="Abrir archivo">
            <File className="sm" /><span className="n">{a.file_name}</span>
            <small>{formatBytes(a.size_bytes)}{a.status === 'processed' ? ' · leído' : a.mime_type.startsWith('image/') ? ' · imagen' : ' · sin analizar'}</small>
          </button>
          {a.status === 'processed' && /\.(pdf|docx)$/i.test(a.file_name) && <AttachmentDocument file={a} />}
        </div>
      ))}
    </div>
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
          const visible = artifact ? msg.content.replace(artifact[0], '').trim() : msg.content
          return <>{visible && <Markdown text={visible} streaming={generating} />}{artifact && <DocumentEditor title={artifact[2].trim()} content={artifact[3].trim()} />}</>
        })() : null}
        {msg.sources?.length ? (
          <div className="sources" aria-label="Fuentes">
            {msg.sources.map((s, i) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"><b>[{i + 1}] {s.title}</b><small>{s.url}</small></a>)}
          </div>
        ) : null}
        {status === 'error' && <div className="notice error" role="alert"><div className="grow"><div className="t">No se pudo completar la respuesta</div>{msg.error}</div>{isLast && !busy && <button className="btn sm" onClick={() => onRegenerate(msg.id)}>Reintentar</button>}</div>}
        {status === 'interrupted' && <div className="notice" role="status"><div className="grow">La generación se interrumpió antes de terminar.</div>{isLast && !busy && <button className="btn sm" onClick={() => onRegenerate(msg.id)}>Reintentar</button>}</div>}
        {status === 'cancelled' && <div className="meta-line">Generación detenida.</div>}
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
