import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useUi } from '../store/ui'
import { useChat } from '../store/chat'
import { MicSession, micErrorMessage, transcribe } from '../voice/recorder'
import { Mic } from '../components/icons'

type CodeFiles = { 'index.html': string; 'style.css': string; 'script.js': string }
interface Project { id: string; name: string; files: CodeFiles; code_conversation_id?: string | null; last_ai_files?: CodeFiles | null; updated_at: string }
const EMPTY: CodeFiles = { 'index.html': '<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Mi proyecto</title>\n</head>\n<body>\n  <h1>Hola, mundo</h1>\n  <p>Tu proyecto empieza acá.</p>\n</body>\n</html>', 'style.css': 'body { font-family: system-ui, sans-serif; padding: 2rem; }\nh1 { color: #3159a8; }', 'script.js': "console.log('Proyecto listo');" }
const FILES = ['index.html', 'style.css', 'script.js'] as const
function parseGeneratedFiles(content: string, base: CodeFiles): CodeFiles | null {
  const source = content.replace(/^\uFEFF/, '').trim()
  if (!source) return null
  const fenceTokens = source.match(/\x60{3,}/g) ?? []
  if (fenceTokens.length % 2 !== 0) return null

  const result: Partial<CodeFiles> = {}
  const cleanCode = (value: string) => value.trim()
    .replace(/^\x60{3}[a-z0-9_+-]*\s*/i, '')
    .replace(/\s*\x60{3}$/, '')
    .trim()

  try {
    const jsonText = source.replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/, '')
    const parsed = JSON.parse(jsonText)
    const files = parsed?.files && typeof parsed.files === 'object' ? parsed.files : parsed
    for (const name of FILES) {
      if (typeof files?.[name] === 'string' && files[name].trim()) result[name] = files[name].trim()
    }
    if (Object.keys(result).length) return { ...base, ...result }
  } catch { /* no es JSON */ }

  const headingPattern = /(?:^|\n)\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__|\x60)?\s*(?:archivo\s*:\s*)?(index\.html|style\.css|styles\.css|script\.js|javascript\.js)\s*(?:\([^)]*\))?\s*(?:\*\*|__|\x60)?\s*:?[ \t]*(?=\n|$)/gi
  const headings = [...source.matchAll(headingPattern)]
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]
    const rawName = heading[1].toLowerCase()
    const name: keyof CodeFiles = rawName === 'styles.css' ? 'style.css' : rawName === 'javascript.js' ? 'script.js' : rawName as keyof CodeFiles
    const from = (heading.index ?? 0) + heading[0].length
    const to = i + 1 < headings.length ? (headings[i + 1].index ?? source.length) : source.length
    const section = source.slice(from, to).trim()
    const fence = section.match(/\x60{3,}[^\n]*\n([\s\S]*?)\x60{3,}/)
    const code = cleanCode(fence?.[1] ?? section)
    if (code && !/^(?:omitido|sin cambios|no se modifica)\.?$/i.test(code)) result[name] = code
  }

  const fences = [...source.matchAll(/\x60{3,}([^\n]*)\n([\s\S]*?)\x60{3,}/g)]
  for (const fence of fences) {
    const code = fence[2].trim()
    if (!code) continue
    const before = source.slice(Math.max(0, (fence.index ?? 0) - 240), fence.index ?? 0)
    const label = (before + ' ' + fence[1]).toLowerCase()
    let name: keyof CodeFiles | null = null
    if (/index\.html/.test(label) || /\bhtml\b/.test(fence[1]) || /^<!doctype\s+html|^<html\b/i.test(code)) name = 'index.html'
    else if (/style\.css|styles\.css/.test(label) || /\bcss\b/.test(fence[1])) name = 'style.css'
    else if (/script\.js|javascript\.js/.test(label) || /\bjavascript\b|\bjs\b/.test(fence[1])) name = 'script.js'
    if (name && result[name] == null) result[name] = code
  }

  if (!Object.keys(result).length) {
    const rawHtml = source.match(/(?:<!doctype\s+html[\s\S]*|<html\b[\s\S]*)/i)?.[0]?.trim()
    if (rawHtml && /<\/html\s*>/i.test(rawHtml) && /<body\b/i.test(rawHtml)) result['index.html'] = rawHtml
  }

  if (!Object.keys(result).length) return null
  for (const [name, raw] of Object.entries(result)) {
    const code = raw?.trim() ?? ''
    if (!code || /(?:\[\.\.\.\]|código restante omitido|rest of code|TODO:\s*insert)/i.test(code.slice(-700))) return null
    if (name === 'index.html' && !/<(?:!doctype|html|head|body|main|div|section|canvas)\b/i.test(code)) return null
    if (name === 'index.html' && /<!doctype\s+html/i.test(code) && !/<\/html\s*>/i.test(code)) return null
    if (name === 'style.css' && !/[{}]/.test(code)) return null
    if (name === 'script.js' && !/[;{}()=]/.test(code)) return null
  }
  return { ...base, ...result }
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
  const models = useChat((s) => s.models)
  const setModel = useChat((s) => s.setModel)
  const [projects, setProjects] = useState<Project[]>([])
  const [active, setActive] = useState<Project | null>(null)
  const [file, setFile] = useState<keyof CodeFiles>('index.html')
  const [draft, setDraft] = useState<CodeFiles>(EMPTY)
  const [prompt, setPrompt] = useState('')
  const [dictation, setDictation] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const dictationRef = useRef<{ mic: MicSession; stop: () => void } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [previewRun, setPreviewRun] = useState(0)
  const [lastGenerationTokens, setLastGenerationTokens] = useState<number | null>(null)
  const [projectTokenUsage, setProjectTokenUsage] = useState(0)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)
  const previewContainerRef = useRef<HTMLElement | null>(null)
  const [autonomy, setAutonomy] = useState(false)
  const [autonomyBusy, setAutonomyBusy] = useState(false)
  const [autonomyCycles, setAutonomyCycles] = useState(0)
  const draftRef = useRef(draft)
  const activeRef = useRef(active)
  const autonomyCyclesRef = useRef(0)
  const preview = useMemo(() => previewDocument(draft), [draft])
  useEffect(() => {
    const syncFullscreen = () => setPreviewFullscreen(document.fullscreenElement === previewContainerRef.current)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  async function togglePreviewFullscreen() {
    const container = previewContainerRef.current
    if (!container) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (container.requestFullscreen) await container.requestFullscreen()
      else toast('error', 'La pantalla completa no está disponible en este navegador.')
    } catch { toast('error', 'El navegador no permitió activar la pantalla completa.') }
  }
  useEffect(() => { draftRef.current = draft }, [draft])
  useEffect(() => { activeRef.current = active }, [active])

  async function loadProjects() {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase.from('cr_code_projects').select('id, name, files, code_conversation_id, last_ai_files, updated_at').eq('user_id', userId).order('updated_at', { ascending: false })
    if (error) toast('error', 'No se pudieron cargar los proyectos. Comprobá que la migración de Programación esté aplicada.')
    const list = (data ?? []) as Project[]
    setProjects(list)
    if (list.length) { setActive(list[0]); setDraft({ ...EMPTY, ...list[0].files }) }
    setLoading(false)
  }

  useEffect(() => { void useChat.getState().init(); void loadProjects() }, [userId])
  useEffect(() => {
    const conversationId = active?.code_conversation_id
    if (!conversationId) { setLastGenerationTokens(null); setProjectTokenUsage(0); return }
    let cancelled = false
    void supabase.from('cr_messages').select('token_usage, seq').eq('conversation_id', conversationId).eq('role', 'assistant').not('token_usage', 'is', null).order('seq', { ascending: false }).then(({ data }) => {
      if (cancelled) return
      const usages = (data ?? []).map((row: any) => Number(row.token_usage) || 0)
      setLastGenerationTokens(usages[0] ?? null)
      setProjectTokenUsage(usages.reduce((sum, value) => sum + value, 0))
    })
    return () => { cancelled = true }
  }, [active?.code_conversation_id])

  useEffect(() => () => dictationRef.current?.mic.close(), [])

  async function ensureProjectConversation(project: Project): Promise<string> {
    if (project.code_conversation_id) return project.code_conversation_id
    const id = await useChat.getState().createConversation(true)
    const { error } = await supabase.from('cr_code_projects').update({ code_conversation_id: id }).eq('id', project.id)
    if (error) { await useChat.getState().remove(id); throw new Error('No se pudo guardar la memoria de este proyecto.') }
    const updated = { ...project, code_conversation_id: id }
    setActive((current) => current?.id === project.id ? updated : current)
    setProjects((current) => current.map((item) => item.id === project.id ? updated : item))
    return id
  }

  async function toggleDictation() {
    if (dictation === 'recording') { dictationRef.current?.stop(); return }
    if (!MicSession.supported) return toast('error', 'Tu navegador no permite grabar audio.')
    const mic = new MicSession()
    try { await mic.open() } catch (e) { return toast('error', (e as Error).message || micErrorMessage(e)) }
    const recording = mic.record({ vad: false })
    dictationRef.current = { mic, stop: recording.stop }
    setDictation('recording')
    const blob = await recording.done
    mic.close(); dictationRef.current = null
    if (!blob || blob.size < 1200) { setDictation('idle'); return toast('info', 'No se escuchó nada. Probá otra vez.') }
    setDictation('transcribing')
    try {
      const spoken = await transcribe(blob)
      if (spoken) setPrompt((current) => (current ? current.trimEnd() + ' ' : '') + spoken)
      else toast('info', 'No se pudo reconocer el audio.')
    } catch (e) { toast('error', (e as Error).message) }
    setDictation('idle')
  }

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
    const { data, error } = await supabase.from('cr_code_projects').insert({ user_id: userId, name, files: EMPTY }).select('id, name, files, code_conversation_id, updated_at').single()
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
    try {
      const conversationId = await ensureProjectConversation(active)
      const current = draftRef.current
      const codeWasManuallyEdited = JSON.stringify(active.last_ai_files ?? null) !== JSON.stringify(current)
      const currentCodeContext = codeWasManuallyEdited
        ? 'ESTADO ACTUAL (el usuario modificó código desde la última respuesta; esta es la fuente de verdad):\nindex.html:\n' + current['index.html'] + '\n\nstyle.css:\n' + current['style.css'] + '\n\nscript.js:\n' + current['script.js']
        : 'El código actual coincide con la última versión que ya está en el historial. Usá ese historial como base y evitá repetir el código completo.'
      const request = [
        'MODO PROGRAMACIÓN DE CUT-REAL. Sos un ingeniero de software senior que continúa trabajando en ESTE proyecto, no empezás uno nuevo.',
        'INSTRUCCIÓN DEL USUARIO (continuación de lo anterior):\n' + prompt.trim(),
        'REGLAS DE CONTINUIDAD: conservá objetivo, diseño, decisiones, nombres, estructura y funciones existentes. El pedido es incremental salvo que el usuario pida empezar de cero. No reemplaces funciones ajenas al cambio. Para cada archivo modificado devolvé el ARCHIVO COMPLETO, nunca fragmentos, diffs, puntos suspensivos ni marcadores de omisión. No inventes archivos ni cambies nombres. Para gráficos, creá SVG/Canvas real y adaptable (no un gráfico Markdown): ejes, etiquetas legibles, escala correcta, leyenda cuando corresponda, datos fieles y resize. Para 3D, incluí cámara, iluminación, geometría, materiales, canvas con tamaño visible y render loop; cargá Three.js solo si es necesario. CALIDAD FUNCIONAL OBLIGATORIA: no entregues maquetas, cuadros decorativos ni botones sin acción. Todo control visible debe tener un evento funcional, y toda función anunciada debe estar implementada. Antes de terminar, revisá mentalmente el flujo completo, los estados, las interacciones, los errores y el reinicio. PARA JUEGOS: implementá un ciclo jugable completo, no una captura estática: tablero o escenario visible e interactivo, selección y colocación real, reglas, recursos, movimiento de enemigos u objetos, colisiones, ataques o interacciones, puntuación/vidas, victoria o derrota, pausa y reinicio cuando correspondan. En un juego de defensa por carriles inspirado en Plants vs. Zombies, usá personajes y arte originales; creá una grilla clickeable (por ejemplo 5 filas por 9 columnas), permití seleccionar una unidad y colocarla en una celda válida, descontá recursos, generá enemigos que avancen por carriles, conectá proyectiles/ataques con sus colisiones y salud, y actualizá el HUD en tiempo real. No simules estas mecánicas con texto: programalas. Si el alcance supera el límite de salida, priorizá una versión mínima realmente jugable y explicá qué quedó pendiente, sin afirmar que existe lo que no implementaste.',
        'FORMATO DE ENTREGA: preferí los tres archivos separados con encabezados exactos `index.html`, `style.css` y `script.js`, cada uno completo en su bloque (html/css/javascript). PERO si el proyecto puede funcionar de forma autocontenida, también podés entregar un único `index.html` completo con CSS y JavaScript embebidos: encabezado `index.html` y bloque html. No entregues un único bloque que mezcle archivos separados. Se aceptan encabezados Archivo: index.html y etiquetas de lenguaje. Incluí solo archivos modificados, completos y ejecutables; nada de diffs, puntos suspensivos ni omisiones. No uses frameworks ni dependencias externas salvo que el usuario las pida y la vista previa pueda ejecutarlas.',
        currentCodeContext,
      ].join('\n\n')
      const result = await chat.send(conversationId, request, { silent: true, ephemeral: true, taskMode: 'programming' })
      if (!result.ok || !result.content) throw new Error(result.error || 'El modelo no devolvió código.')
      const files = parseGeneratedFiles(result.content, current)
      if (!files) throw new Error('La respuesta no incluyó ningún archivo válido. No se modificó el proyecto.')
      setDraft(files)
      draftRef.current = files
      const updatedProject = { ...active, code_conversation_id: conversationId, files, last_ai_files: files }
      setActive(updatedProject)
      setProjects((items) => items.map((item) => item.id === active.id ? updatedProject : item))
      const { error: snapshotError } = await supabase.from('cr_code_projects').update({ last_ai_files: files }).eq('id', active.id)
      if (snapshotError) toast('error', 'El código se aplicó, pero no se pudo guardar la referencia de optimización de tokens.')
      // El backend registra el consumo real por mensaje; mostramos el dato del proyecto sin otra llamada al modelo.
      const { data: usageRows } = await supabase.from('cr_messages').select('token_usage, seq').eq('conversation_id', conversationId).eq('role', 'assistant').not('token_usage', 'is', null).order('seq', { ascending: false })
      const usages = (usageRows ?? []).map((row: any) => Number(row.token_usage) || 0)
      setLastGenerationTokens(usages[0] ?? null)
      setProjectTokenUsage(usages.reduce((sum, value) => sum + value, 0))
      toast('info', 'Modificación aplicada. La memoria del proyecto quedó conservada.')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setGenerating(false) }
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
      setAutonomyBusy(true)
      const chat = useChat.getState()
      try {
        const current = draftRef.current
        const conversationId = await ensureProjectConversation(activeRef.current!)
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
        const result = await chat.send(conversationId, request, { silent: true, ephemeral: true })
        if (!result.ok || !result.content) throw new Error(result.error || 'La IA no devolvió una mejora.')
        const next = parseGeneratedFiles(result.content, current)
        if (!next) throw new Error('La respuesta autónoma no incluyó los tres archivos separados.')
        if (stopped || activeRef.current?.id !== projectId) return
        const unchanged = FILES.every((name) => next[name] === current[name])
        if (!unchanged) {
          const { error } = await supabase.from('cr_code_projects').update({ files: next, last_ai_files: next, updated_at: new Date().toISOString() }).eq('id', projectId)
          if (error) throw new Error('No se pudo guardar la mejora automática.')
          draftRef.current = next
          setDraft(next)
          setProjects(old => old.map(p => p.id === projectId ? { ...p, files: next, last_ai_files: next, updated_at: new Date().toISOString() } : p))
          setActive((current) => current?.id === projectId ? { ...current, files: next, last_ai_files: next } : current)
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
        if (!stopped) setAutonomyBusy(false)
      }
      if (!stopped) {
        await wait(20_000)
        if (!stopped) void runCycle()
      }
    }
    void runCycle()
    return () => { stopped = true; if (timer) window.clearTimeout(timer); setAutonomyBusy(false) }
  }, [autonomy, active?.id, modelId])

  async function deleteProject() {
    if (!active || !confirm('¿Eliminar este proyecto y sus archivos?')) return
    const projectConversationId = active.code_conversation_id
    const { error } = await supabase.from('cr_code_projects').delete().eq('id', active.id)
    if (error) return toast('error', 'No se pudo eliminar el proyecto.')
    if (projectConversationId) await useChat.getState().remove(projectConversationId)
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
              <div className="workspace-toolbar"><input className="field project-name" value={active.name} onChange={(e) => setActive({ ...active, name: e.target.value })} aria-label="Nombre del proyecto" /><div className="workspace-actions"><span className="autosave-status">{saving ? 'Guardando…' : savedAt ? 'Guardado automáticamente' : 'Guardado automático activo'}</span><button className={`btn sm ${autonomy ? 'primary' : ''}`} onClick={() => { if (autonomy) setAutonomy(false); else { autonomyCyclesRef.current = 0; setAutonomyCycles(0); setAutonomy(true) } }} disabled={!modelId || generating}>{autonomy ? (autonomyBusy ? `Autonomía · ${autonomyCycles} ciclos · trabajando…` : `Pausar autonomía · ${autonomyCycles} ciclos`) : 'Modo autonomía'}</button><label className="hint">Modelo de programación <select className="field" value={modelId ?? ''} onChange={(e) => setModel(e.target.value)} disabled={generating || autonomy}><option value="">Elegí un modelo</option>{models.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></label><button className="btn sm" onClick={() => void saveProject()} disabled={saving}>Guardar ahora</button><button className="btn danger sm" onClick={() => void deleteProject()}>Eliminar</button></div></div>
              <div className="codegen"><div><b>Generar con Cut-real</b><p>Describí qué querés construir o modificar. Cada proyecto conserva su propio historial técnico.</p></div><div className="codegen-input"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ej.: agregá un render 3D de figuras geométricas verdes sobre fondo negro, manteniendo lo que ya hicimos…" rows={2} /><button className={`icon-btn ${dictation === 'recording' ? 'on' : ''}`} type="button" title={dictation === 'recording' ? 'Detener dictado' : 'Dictar solicitud'} aria-label="Dictar solicitud por voz" disabled={dictation === 'transcribing'} onClick={() => void toggleDictation()}><Mic /></button>{dictation !== 'idle' && <small className="hint">{dictation === 'recording' ? 'Grabando…' : 'Transcribiendo…'}</small>}</div><button className="btn primary sm" onClick={() => void generateCode()} disabled={!prompt.trim() || generating || autonomy || autonomyBusy || !modelId}>{generating ? 'Generando…' : !modelId ? 'Cargando modelo…' : 'Generar / modificar'}</button></div>
              <div className="codegen-usage" aria-live="polite"><span>Última generación: <b>{lastGenerationTokens == null ? '—' : lastGenerationTokens.toLocaleString('es-AR') + ' tokens'}</b></span><span>Este proyecto: <b>{projectTokenUsage.toLocaleString('es-AR')} tokens registrados</b></span><small>Tokens informados por el proveedor o estimados cuando no hay dato exacto.</small></div>
              <div className={`studio-panels${showPreview ? '' : ' no-preview'}`}>
                <section className="editor-panel"><div className="file-tabs">{FILES.map((name) => <button key={name} className={file === name ? 'active' : ''} onClick={() => setFile(name)}>{name}</button>)}</div><textarea className="code-editor" spellCheck={false} aria-label={`Código de ${file}`} value={draft[file]} readOnly={autonomy} onChange={(e) => setDraft((old) => ({ ...old, [file]: e.target.value }))} /><div className="editor-footer"><span>HTML · CSS · JavaScript</span><button className="btn ghost sm" onClick={() => setShowPreview((v) => !v)}>{showPreview ? 'Ocultar vista previa' : 'Mostrar vista previa'}</button></div></section>
                {showPreview && <section ref={previewContainerRef as any} className={`preview-panel${previewFullscreen ? ' preview-fullscreen' : ''}`}><div className="preview-panel-head"><b>Vista previa en vivo</b><div className="preview-actions"><span>Sandbox aislado</span><button className="btn sm" onClick={() => setPreviewRun(n => n + 1)}>↻ Ejecutar</button><button className="btn sm" onClick={() => void togglePreviewFullscreen()}>{previewFullscreen ? 'Salir de pantalla completa' : '⛶ Pantalla completa'}</button></div></div><iframe key={previewRun} title="Vista previa del proyecto" sandbox="allow-scripts" allow="fullscreen" srcDoc={preview} /></section>}
              </div>
            </>}
          </section>
        </div>
      </main>
    </div>
  )
}
