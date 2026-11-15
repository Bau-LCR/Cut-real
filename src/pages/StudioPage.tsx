import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useUi } from '../store/ui'
import { useChat } from '../store/chat'

type CodeFiles = { 'index.html': string; 'style.css': string; 'script.js': string }
interface Project { id: string; name: string; files: CodeFiles; updated_at: string }
const EMPTY: CodeFiles = { 'index.html': '<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Mi proyecto</title>\n</head>\n<body>\n  <h1>Hola, mundo</h1>\n  <p>Tu proyecto empieza acá.</p>\n</body>\n</html>', 'style.css': 'body { font-family: system-ui, sans-serif; padding: 2rem; }\nh1 { color: #3159a8; }', 'script.js': "console.log('Proyecto listo');" }
const FILES = ['index.html', 'style.css', 'script.js'] as const
function parseGeneratedFiles(content: string): CodeFiles | null {
  const result: Partial<CodeFiles> = {}
  const headings = [...content.matchAll(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?(index\.html|style\.css|script\.js)(?:\*\*)?\s*:?[ \t]*\n/gi)]
  if (headings.length >= 2) headings.forEach((match, index) => {
    const name = match[1].toLowerCase() as keyof CodeFiles
    const start = (match.index ?? 0) + match[0].length
    const end = index + 1 < headings.length ? (headings[index + 1].index ?? content.length) : content.length
    const section = content.slice(start, end).trim()
    const fence = section.match(/\x60\x60\x60[^\n]*\n([\s\S]*?)\x60\x60\x60/)
    result[name] = (fence?.[1] ?? section).trim()
  })
  const fences = [...content.matchAll(/\x60\x60\x60([^\n]*)\n([\s\S]*?)\x60\x60\x60/g)]
  for (const fence of fences) {
    const label = (fence[1] + content.slice(Math.max(0, (fence.index ?? 0) - 100), fence.index ?? 0)).toLowerCase()
    const name = /index\.html|html/.test(label) ? 'index.html' : /style\.css|css/.test(label) ? 'style.css' : /script\.js|javascript|\bjs\b/.test(label) ? 'script.js' : null
    if (name && result[name] == null) result[name] = fence[2].trim()
  }
  if (['index.html', 'style.css', 'script.js'].every((name) => result[name as keyof CodeFiles] != null)) return { 'index.html': result['index.html']!, 'style.css': result['style.css']!, 'script.js': result['script.js']!' }
  if (fences.length === 3) return { 'index.html': fences[0][2].trim(), 'style.css': fences[1][2].trim(), 'script.js': fences[2][2].trim() }
  return null
}

function previewDocument(files: CodeFiles) {
  const style = '<style>\n' + files['style.css'] + '\n</style>'
  const script = '<script>\n' + files['script.js'].replace(/<\/script/gi, '<\\/script') + '\n</script>'
  let html = files['index.html'] || '<!doctype html><html><head></head><body></body></html>'
  const headClose = new RegExp('</head>', 'i')
  if (headClose.test(html)) html = html.replace(headClose, style + '</head>')
  else html = style + html
  const bodyClose = new RegExp('</body>', 'i')
  if (bodyClose.test(html)) html = html.replace(bodyClose, script + '</body>')
  else html += script
  return html
}

export function StudioPage() {
  const userId = useAuth((s) => s.me?.userId)
  const toast = useUi((s) => s.toast)
  const modelId = useChat((s) => s.modelId)
  const [projects, setProjects] = useState<Project[]>([])
  const [active, setActive] = useState<Project | null>(null)
  const [file, setFile] = useState<keyof CodeFiles>('index.html')
  const [draft, setDraft] = useState<CodeFiles>(EMPTY)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [previewRun, setPreviewRun] = useState(0)
  const [autonomy, setAutonomy] = useState(false)
  const [autonomyBusy, setAutonomyBusy] = useState(false)
  const [autonomyCycles, setAutonomyCycles] = useState(0)
  const [autonomyLimit, setAutonomyLimit] = useState(30)
  const draftRef = useRef(draft)
  const activeRef = useRef(active)
  const autonomyCyclesRef = useRef(0)
  const preview = useMemo(() => previewDocument(draft), [draft])
  useEffect(() => { draftRef.current = draft }, [draft])
  useEffect(() => { activeRef.current = active }, [active])

  async function loadProjects() {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase.from('cr_code_projects').select('id, name, files, updated_at').eq('user_id', userId).order('updated_at', { ascending: false })
    if (error) toast('error', 'No se pudieron cargar los proyectos. Comprobá que la migración de Programación esté aplicada.')
    const list = (data ?? []) as Project[]
    setProjects(list)
    if (list.length) { setActive(list[0]); setDraft({ ...EMPTY, ...list[0].files }) }
    setLoading(false)
  }

  useEffect(() => { void useChat.getState().init(); void loadProjects() }, [userId])

  // Debounce: guarda tras una pausa breve, sin escribir en la base por cada tecla.
  useEffect(() => {
    if (!active || loading) return
    const projectId = active.id
    const projectName = active.name.trim() || 'Mi proyecto'
    const files = draft
    const timer = window.setTimeout(async () => {
      setSaving(true)
      const { error } = await supabase.from('cr_code_projects')
        .update({ name: projectName, files, updated_at: new Date().toISOString() })
        .eq('id', projectId)
      setSaving(false)
      if (error) { toast('error', 'No se pudo guardar automáticamente. Revisá tu conexión.'); return }
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      setProjects(old => old.map(p => p.id === projectId ? { ...p, name: projectName, files } : p))
    }, 850)
    return () => window.clearTimeout(timer)
  }, [active?.id, active?.name, draft, loading, toast])

  async function createProject() {
    if (!userId) return
    const proposed = window.prompt('Nombre del proyecto', 'Mi proyecto')
    if (proposed === null) return
    const name = proposed.trim().slice(0, 100) || 'Mi proyecto'
    const { data, error } = await supabase.from('cr_code_projects').insert({ user_id: userId, name, files: EMPTY }).select('id, name, files, updated_at').single()
    if (error || !data) return toast('error', 'No se pudo crear el proyecto.')
    const p = data as Project
    setProjects((old) => [p, ...old]); setActive(p); setDraft(EMPTY); setFile('index.html')
  }

  function chooseProject(p: Project) { setAutonomy(false); setActive(p); setDraft({ ...EMPTY, ...p.files }); setFile('index.html') }

  async function saveProject() {
    if (!active) return
    setSaving(true)
    const { error } = await supabase.from('cr_code_projects').update({ name: active.name.trim() || 'Mi proyecto', files: draft, updated_at: new Date().toISOString() }).eq('id', active.id)
    setSaving(false)
    if (error) return toast('error', 'No se pudieron guardar los cambios.')
    setProjects((old) => old.map((p) => p.id === active.id ? { ...p, name: active.name.trim() || 'Mi proyecto', files: draft, updated_at: new Date().toISOString() } : p))
    toast('info', 'Proyecto guardado.')
  }

  async function generateCode() {
    if (!active || !prompt.trim() || generating) return
    setGenerating(true)
    const chat = useChat.getState()
    let temporaryConversationId: string | null = null
    try {
      temporaryConversationId = await chat.createConversation(true)
      const conversationId = temporaryConversationId
      const request = [
        'Actuá como un desarrollador frontend senior. Generá una solución completa y funcional para el siguiente pedido.',
        prompt.trim(),
        'Devolvé los tres archivos completos, cada uno bajo un encabezado exacto y separado: index.html, style.css y script.js. Debajo de cada encabezado incluí un bloque de código con el lenguaje correcto (html, css, javascript). No omitas archivos; si uno no necesita código, devolvé un bloque vacío. No mezcles los tres archivos en un único bloque ni agregues explicaciones. El HTML debe enlazar style.css y script.js correctamente.'
      ].join('\n\n')
      const result = await chat.send(conversationId, request, { silent: true, ephemeral: true })
      if (!result.ok || !result.content) throw new Error(result.error || 'El modelo no devolvió código.')
      const files = parseGeneratedFiles(result.content)
      if (!files) throw new Error('La respuesta llegó, pero no pude separar index.html, style.css y script.js. Probá indicando que entregue cada archivo bajo su propio encabezado.')
      setDraft(files)
      toast('info', 'Código generado. Se guardará automáticamente.')
    } catch (e) { toast('error', (e as Error).message) }
    finally {
      if (temporaryConversationId) await chat.remove(temporaryConversationId)
      setGenerating(false)
    }
  }

  // Modo autonomía: una mejora por ciclo, con pausa entre llamadas y límite explícito.
  useEffect(() => {
    if (!autonomy || !active?.id || !modelId) return
    let stopped = false
    let timer: number | undefined
    let failures = 0
    const projectId = active.id
    const wait = (ms: number) => new Promise<void>((resolve) => { timer = window.setTimeout(resolve, ms) })
    const runCycle = async () => {
      if (stopped || activeRef.current?.id !== projectId) return
      if (autonomyCyclesRef.current >= autonomyLimit) { setAutonomy(false); toast('info', 'Modo autonomía finalizado: alcanzaste el límite de ciclos.'); return }
      setAutonomyBusy(true)
      const chat = useChat.getState()
      let temporaryConversationId: string | null = null
      try {
        temporaryConversationId = await chat.createConversation(true)
        const current = draftRef.current
        const request = [
          'Sos un desarrollador senior trabajando de forma autónoma en un proyecto frontend existente.',
          'Analizá el proyecto completo y elegí UNA sola mejora pequeña, concreta, útil y coherente. Puede ser corregir un error evidente, mejorar accesibilidad, responsive, usabilidad, rendimiento o un detalle visual.',
          'No cambies la identidad ni el objetivo del producto. No agregues dependencias, servicios externos, pagos, autenticación, analítica, telemetría ni llamadas de red. No introduzcas funciones destructivas. Conservá las características existentes.',
          'Si no encontrás una mejora segura y claramente beneficiosa, devolvé los archivos sin cambios.',
          'Devolvé los tres archivos completos bajo encabezados exactos: index.html, style.css y script.js; cada uno en su propio bloque de código (html, css, javascript). No los mezcles.',
          'ARCHIVO index.html:\n' + current['index.html'],
          'ARCHIVO style.css:\n' + current['style.css'],
          'ARCHIVO script.js:\n' + current['script.js'],
        ].join('\n\n')
        const result = await chat.send(temporaryConversationId, request, { silent: true, ephemeral: true })
        if (!result.ok || !result.content) throw new Error(result.error || 'La IA no devolvió una mejora.')
        const next = parseGeneratedFiles(result.content)
        if (!next) throw new Error('La respuesta autónoma no incluyó los tres archivos separados.')
        if (stopped || activeRef.current?.id !== projectId) return
        const unchanged = FILES.every((name) => next[name] === current[name])
        if (!unchanged) {
          const { error } = await supabase.from('cr_code_projects').update({ files: next, updated_at: new Date().toISOString() }).eq('id', projectId)
          if (error) throw new Error('No se pudo guardar la mejora automática.')
          draftRef.current = next
          setDraft(next)
          setProjects(old => old.map(p => p.id === projectId ? { ...p, files: next, updated_at: new Date().toISOString() } : p))
          setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        }
        failures = 0
        autonomyCyclesRef.current += 1
        setAutonomyCycles(autonomyCyclesRef.current)
      } catch (e) {
        failures++
        toast('error', 'Autonomía: ' + ((e as Error).message || 'falló un ciclo.'))
        if (failures >= 3) { setAutonomy(false); toast('error', 'Modo autonomía pausado tras tres errores consecutivos.'); return }
      } finally {
        if (temporaryConversationId) await chat.remove(temporaryConversationId)
        if (!stopped) setAutonomyBusy(false)
      }
      if (!stopped) {
        if (autonomyCyclesRef.current >= autonomyLimit) { setAutonomy(false); toast('info', 'Modo autonomía finalizado: alcanzaste el límite de ciclos.'); return }
        await wait(20_000)
        if (!stopped) void runCycle()
      }
    }
    void runCycle()
    return () => { stopped = true; if (timer) window.clearTimeout(timer); setAutonomyBusy(false) }
  }, [autonomy, active?.id, modelId, autonomyLimit])

  async function deleteProject() {
    if (!active || !confirm('¿Eliminar este proyecto y sus archivos?')) return
    const { error } = await supabase.from('cr_code_projects').delete().eq('id', active.id)
    if (error) return toast('error', 'No se pudo eliminar el proyecto.')
    const rest = projects.filter((p) => p.id !== active.id)
    setProjects(rest); setActive(rest[0] ?? null); setDraft(rest[0] ? { ...EMPTY, ...rest[0].files } : EMPTY)
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="studio">
        <header className="studio-top"><div><span className="studio-kicker">ESPACIO DE DESARROLLO</span><h1>Programación</h1></div><Link className="btn ghost sm" to="/">Volver al chat</Link></header>
        <div className="studio-layout">
          <aside className="project-rail"><div className="project-rail-head"><b>Proyectos</b><button className="btn sm" onClick={() => void createProject()}>＋ Nuevo</button></div>
            {loading ? <p className="hint">Cargando…</p> : projects.map((p) => <button key={p.id} className={`project-choice${active?.id === p.id ? ' active' : ''}`} onClick={() => chooseProject(p)}>{p.name}</button>)}
            {!loading && !projects.length && <p className="hint">Todavía no tenés proyectos.</p>}
          </aside>
          <section className="studio-workspace">
            {!active ? <div className="studio-empty"><h2>Tu próximo proyecto empieza acá.</h2><p>Creá un proyecto para trabajar con HTML, CSS y JavaScript en archivos vinculados.</p><button className="btn primary" onClick={() => void createProject()}>Crear proyecto</button></div> : <>
              <div className="workspace-toolbar"><input className="field project-name" value={active.name} onChange={(e) => setActive({ ...active, name: e.target.value })} aria-label="Nombre del proyecto" /><div className="workspace-actions"><span className="autosave-status">{saving ? 'Guardando…' : savedAt ? 'Guardado automáticamente' : 'Guardado automático activo'}</span><button className={`btn sm ${autonomy ? 'primary' : ''}`} onClick={() => { if (autonomy) setAutonomy(false); else { autonomyCyclesRef.current = 0; setAutonomyCycles(0); setAutonomy(true) } }} disabled={!modelId || generating}>{autonomy ? (autonomyBusy ? `Autonomía · ${autonomyCycles}/${autonomyLimit} · trabajando…` : `Pausar autonomía · ${autonomyCycles}/${autonomyLimit}`) : 'Modo autonomía'}</button><select className="field autonomy-limit" aria-label="Límite de mejoras autónomas" value={autonomyLimit} onChange={(e) => setAutonomyLimit(Number(e.target.value))} disabled={autonomy}><option value={30}>30 mejoras</option><option value={60}>60 mejoras</option><option value={120}>120 mejoras</option><option value={240}>240 mejoras</option><option value={360}>360 mejoras</option></select><button className="btn sm" onClick={() => void saveProject()} disabled={saving}>Guardar ahora</button><button className="btn danger sm" onClick={() => void deleteProject()}>Eliminar</button></div></div>
              <div className="codegen"><div><b>Generar con Cut-real</b><p>Describí qué querés construir y se generarán los tres archivos conectados.</p></div><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ej.: una página de presentación para mi emprendimiento, con menú, tarjetas y formulario…" rows={2} /><button className="btn primary sm" onClick={() => void generateCode()} disabled={!prompt.trim() || generating || autonomy || autonomyBusy || !modelId}>{generating ? 'Generando…' : !modelId ? 'Cargando modelo…' : 'Generar código'}</button></div>
              <div className={`studio-panels${showPreview ? '' : ' no-preview'}`}>
                <section className="editor-panel"><div className="file-tabs">{FILES.map((name) => <button key={name} className={file === name ? 'active' : ''} onClick={() => setFile(name)}>{name}</button>)}</div><textarea className="code-editor" spellCheck={false} aria-label={`Código de ${file}`} value={draft[file]} readOnly={autonomy} onChange={(e) => setDraft((old) => ({ ...old, [file]: e.target.value }))} /><div className="editor-footer"><span>HTML · CSS · JavaScript</span><button className="btn ghost sm" onClick={() => setShowPreview((v) => !v)}>{showPreview ? 'Ocultar vista previa' : 'Mostrar vista previa'}</button></div></section>
                {showPreview && <section className="preview-panel"><div className="preview-panel-head"><b>Vista previa en vivo</b><div className="preview-actions"><span>Sandbox aislado</span><button className="btn sm" onClick={() => setPreviewRun(n => n + 1)}>↻ Ejecutar</button></div></div><iframe key={previewRun} title="Vista previa del proyecto" sandbox="allow-scripts" srcDoc={preview} /></section>}
              </div>
            </>}
          </section>
        </div>
      </main>
    </div>
  )
}
