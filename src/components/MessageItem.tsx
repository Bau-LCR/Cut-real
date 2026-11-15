import { memo, useRef, useState } from 'react'
import type { Attachment, Message } from '../lib/types'
import { STALE_MS, formatBytes } from '../lib/format'
import { openAttachment } from '../lib/files'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useSpeech } from '../store/speech'
import { CopyButton, Markdown } from './Markdown'
import { callFnBlob } from '../lib/functions'
import { Edit, File, Pause, Play, Refresh, Stop, Volume } from './icons'

const DOCUMENT_RE = /\\[\\[CUTREAL_DOCUMENT:(pdf|docx)\\|([^\\]\\r\\n]{1,160})\\]\\]\\s*([\\s\\S]*?)\\s*\\[\\[\\/CUTREAL_DOCUMENT\\]\\]/i

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\\r/g, '').split('\\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  const inline = (s: string) => escapeHtml(s).replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>').replace(/(^|[^*])\\*(?!\\s)(.+?)\\*(?!\\*)/g, '$1<em>$2</em>').replace(/__(.+?)__/g, '<u>$1</u>').replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>')
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  for (const line of lines) {
    const t = line.trim()
    const bullet = t.match(/^[-*+]\\s+(.+)/)
    const number = t.match(/^\\d+[.)]\\s+(.+)/)
    if (bullet || number) {
      const next = bullet ? 'ul' : 'ol'
      if (list !== next) { closeList(); list = next; out.push(`<${list}>`) }
      out.push(`<li>${inline((bullet || number)![1])}</li>`)
    } else {
      closeList()
      if (!t) continue
      const heading = t.match(/^(#{1,3})\\s+(.+)/)
      if (heading) { const level = heading[1].length; out.push(`<h${level}>${inline(heading[2])}</h${level}>`) }
      else if (/^>\\s?/.test(t)) out.push(`<blockquote>${inline(t.replace(/^>\\s?/, ''))}</blockquote>`)
      else out.push(`<p>${inline(t)}</p>`)
    }
  }
  closeList()
  return out.join('')
}
function htmlToMarkdown(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (!(node instanceof HTMLElement)) return ''
    const inner = Array.from(node.childNodes).map(inline).join('')
    switch (node.tagName) {
      case 'STRONG': case 'B': return `**${inner}**`
      case 'EM': case 'I': return `*${inner}*`
      case 'U': return `__${inner}__`
      case 'BR': return '\\n'
      case 'CODE': return `\x60${inner}\x60`
      case 'LI': return `- ${inner.trim()}\\n`
      case 'BLOCKQUOTE': return inner.split('\\n').filter(Boolean).map(x => `> ${x}`).join('\\n') + '\\n\\n'
      case 'H1': return `# ${inner.trim()}\\n\\n`
      case 'H2': return `## ${inner.trim()}\\n\\n`
      case 'H3': return `### ${inner.trim()}\\n\\n`
      case 'P': case 'DIV': return inner.trim() ? inner.trim() + '\\n\\n' : ''
      case 'UL': case 'OL': return inner + '\\n'
      default: return inner
    }
  }
  return Array.from(doc.body.childNodes).map(inline).join('').replace(/\\n{3,}/g, '\\n\\n').trim()
}
function getDraft(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

function DocumentEditor({ id, title, content }: { id: string; title: string; content: string }) {
  const storageKey = `cutreal:document-draft:${id}`
  const [value, setValue] = useState(() => getDraft(storageKey, content))
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState<'pdf' | 'docx' | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  function saveDraft() {
    const current = editorRef.current ? htmlToMarkdown(editorRef.current.innerHTML) : value
    setValue(current)
    try { localStorage.setItem(storageKey, current); setSaved(true); setError('') }
    catch { setError('No se pudo guardar el borrador en este navegador. Descargá una copia para conservarlo.') }
  }
  function runCommand(command: string, argument?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, argument)
    if (editorRef.current) setValue(htmlToMarkdown(editorRef.current.innerHTML))
    setSaved(false)
  }
  async function download(format: 'pdf' | 'docx') {
    const current = editorRef.current ? htmlToMarkdown(editorRef.current.innerHTML) : value
    if (loading || !current.trim()) return
    setValue(current); setLoading(format); setError('')
    try {
      const blob = await callFnBlob('generate-document', { format, title, content: current })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = title.replace(/[^\\p{L}\\p{N}._-]+/gu, '_').slice(0, 70) + '.' + format
      document.body.appendChild(a); a.click(); a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (e) { setError((e as Error).message || 'No se pudo generar el documento.') }
    finally { setLoading(null) }
  }
  return <section className="generated-document-editor">
    <div className="generated-document">
      <div><b>{title}</b><small>Editor de documentos · Word y PDF</small>{error && <small className="document-error">{error}</small>}{saved && <small className="document-saved">Borrador guardado en este navegador</small>}</div>
      <div className="document-actions"><button className="btn sm" onClick={() => setEditing(v => !v)}>{editing ? 'Cerrar editor' : 'Abrir editor'}</button><button className="btn primary sm" onClick={() => void download('docx')} disabled={!!loading}>{loading === 'docx' ? 'Preparando…' : 'Descargar Word'}</button><button className="btn sm" onClick={() => void download('pdf')} disabled={!!loading}>{loading === 'pdf' ? 'Preparando…' : 'Exportar PDF'}</button></div>
    </div>
    {editing && <div className="document-workspace">
      <div className="document-workspace-top"><div><span className="document-kicker">CUT-REAL DOCUMENTS</span><b>{title}</b><small>Los cambios se conservan como borrador en este navegador.</small></div><div className="document-actions"><button className="btn sm" onClick={saveDraft}>Guardar borrador</button><button className="btn primary sm" onClick={() => void download('docx')} disabled={!!loading}>Descargar .docx</button></div></div>
      <div className="document-ribbon" role="toolbar" aria-label="Formato del documento">
        <button type="button" title="Deshacer" onMouseDown={e => e.preventDefault()} onClick={() => runCommand('undo')}>↶</button>
        <button type="button" title="Rehacer" onMouseDown={e => e.preventDefault()} onClick={() => runCommand('redo')}>↷</button><span />
        <select aria-label="Estilo de texto" defaultValue="p" onChange={e => runCommand('formatBlock', e.target.value)}><option value="p">Normal</option><option value="h1">Título 1</option><option value="h2">Título 2</option><option value="h3">Título 3</option></select>
        <button type="button" title="Negrita" onMouseDown={e => e.preventDefault()} onClick={() => runCommand('bold')}><b>B</b></button>
        <button type="button" title="Cursiva" onMouseDown={e => e.preventDefault()} onClick={() => runCommand('italic')}><i>I</i></button>
        <button type="button" title="Subrayado" onMouseDown={e => e.preventDefault()} onClick={() => runCommand('underline')}><u>U</u></button><span />
        <button type="button" title="Lista con viñetas" onMouseDown={e => e.preventDefault()} onClick={() => runCommand('insertUnorderedList')}>• Lista</button>
        <button type="button" title="Lista numerada" onMouseDown={e => e.preventDefault()} onClick={() => runCommand('insertOrderedList')}>1. Lista</button>
        <button type="button" title="Alinear a la izquierda" onMouseDown={e => e.preventDefault()} onClick={() => runCommand('justifyLeft')}>☰</button>
        <button type="button" title="Centrar" onMouseDown={e => e.preventDefault()} onClick={() => runCommand('justifyCenter')}>≡</button>
      </div>
      <div className="document-page-wrap"><div ref={editorRef} className="document-page" contentEditable suppressContentEditableWarning role="textbox" aria-label="Contenido editable del documento" aria-multiline="true" onInput={() => { if (editorRef.current) { setValue(htmlToMarkdown(editorRef.current.innerHTML)); setSaved(false) } }} dangerouslySetInnerHTML={{ __html: markdownToHtml(value) }} /></div>
      <div className="document-workspace-footer"><span>Editor enriquecido · Los formatos básicos se exportan a Word y PDF</span><button className="btn sm" onClick={saveDraft}>Guardar cambios</button></div>
    </div>}
  </section>
}

function AttachmentDocument({ file }: { file: Attachment }) {
  const [open, setOpen] = useState(false)
  if (!file.extracted_text?.trim()) return null
  return <div className="attachment-document"><button className="btn ghost sm" onClick={() => setOpen(v => !v)}>{open ? 'Cerrar editor' : 'Editar documento'}</button>{open && <DocumentEditor id={file.id} title={file.file_name.replace(/\\.(pdf|docx)$/i, '') || 'Documento editado'} content={file.extracted_text} />}</div>
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
          {a.status === 'processed' && /\\.(pdf|docx)$/i.test(a.file_name) && <AttachmentDocument file={a} />}
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
          return <>{visible && <Markdown text={visible} streaming={generating} />}{artifact && <DocumentEditor id={msg.id} title={artifact[2].trim()} content={artifact[3].trim()} />}</>
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
