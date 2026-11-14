import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useUi } from '../store/ui'

type CodeFiles = { 'index.html': string; 'style.css': string; 'script.js': string }
interface Project { id: string; name: string; files: CodeFiles; updated_at: string }
const EMPTY: CodeFiles = { 'index.html': '<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Mi proyecto</title>\n</head>\n<body>\n  <h1>Hola, mundo</h1>\n  <p>Tu proyecto empieza acá.</p>\n</body>\n</html>', 'style.css': 'body { font-family: system-ui, sans-serif; padding: 2rem; }\nh1 { color: #3159a8; }', 'script.js': "console.log('Proyecto listo');" }
const FILES = ['index.html', 'style.css', 'script.js'] as const

function previewDocument(files: CodeFiles) {
  const style = '<style>\n' + files['style.css'] + '\n</style>'
  const script = '<script>\n' + files['script.js'].replace(/<\\/script/gi, '<\\\\/script') + '\n<\\/script>'
  let html = files['index.html'] || '<!doctype html><html><head></head><body></body></html>'
  if (/<\\/head>/i.test(html)) html = html.replace(/<\\/head>/i, style + '</head>')
  else html = style + html
  if (/<\\/body>/i.test(html)) html = html.replace(/<\\/body>/i, script + '</body>')
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
  const [generating, setGenerating] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const preview = useMemo(() => previewDocument(draft), [draft])

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

  async function createProject() {
    if (!userId) return
    const { data, error } = await supabase.from('cr_code_projects').insert({ user_id: userId, name: 'Mi proyecto', files: EMPTY }).select('id, name, files, updated_at').single()
    if (error || !data) return toast('error', 'No se pudo crear el proyecto.')
    const p = data as Project
    setProjects((old) => [p, ...old]); setActive(p); setDraft(EMPTY); setFile('index.html')
  }

  function chooseProject(p: Project) { setActive(p); setDraft({ ...EMPTY, ...p.files }); setFile('index.html') }

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
    try {
      const chat = useChat.getState()
      const conversationId = await chat.createConversation()
      const request = [
        'Actuá como un desarrollador frontend senior. Generá una solución completa y funcional para el siguiente pedido.',
        prompt.trim(),
        'Respondé con exactamente tres bloques de código, en este orden: primero HTML para index.html, segundo CSS para style.css y tercero JavaScript para script.js. No omitas archivos; si uno no necesita código, devolvé un bloque vacío. No agregues explicaciones fuera de los bloques. El HTML debe enlazar style.css y script.js correctamente.'
      ].join('\n\n')
      const result = await chat.send(conversationId, request, {})
      if (!result.ok || !result.content) throw new Error(result.error || 'El modelo no devolvió código.')
      const blocks = [...result.content.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].trim())
      if (blocks.length < 3) throw new Error('La respuesta no incluyó los tres archivos esperados. Podés pedirlo de nuevo con más detalle.')
      setDraft({ 'index.html': blocks[0], 'style.css': blocks[1], 'script.js': blocks[2] })
      toast('info', 'Código generado. Revisalo y guardá el proyecto para conservarlo.')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setGenerating(false) }
  }

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
              <div className="workspace-toolbar"><input className="field project-name" value={active.name} onChange={(e) => setActive({ ...active, name: e.target.value })} aria-label="Nombre del proyecto" /><div className="workspace-actions"><button className="btn sm" onClick={() => void saveProject()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button><button className="btn danger sm" onClick={() => void deleteProject()}>Eliminar</button></div></div>
              <div className="codegen"><div><b>Generar con Cut-real</b><p>Describí qué querés construir y se generarán los tres archivos conectados.</p></div><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ej.: una página de presentación para mi emprendimiento, con menú, tarjetas y formulario…" rows={2} /><button className="btn primary sm" onClick={() => void generateCode()} disabled={!prompt.trim() || generating}>{generating ? 'Generando…' : 'Generar código'}</button></div>
              <div className={`studio-panels${showPreview ? '' : ' no-preview'}`}>
                <section className="editor-panel"><div className="file-tabs">{FILES.map((name) => <button key={name} className={file === name ? 'active' : ''} onClick={() => setFile(name)}>{name}</button>)}</div><textarea className="code-editor" spellCheck={false} aria-label={`Código de ${file}`} value={draft[file]} onChange={(e) => setDraft((old) => ({ ...old, [file]: e.target.value }))} /><div className="editor-footer"><span>HTML · CSS · JavaScript</span><button className="btn ghost sm" onClick={() => setShowPreview((v) => !v)}>{showPreview ? 'Ocultar vista previa' : 'Mostrar vista previa'}</button></div></section>
                {showPreview && <section className="preview-panel"><div className="preview-panel-head"><b>Vista previa en vivo</b><span>Sandbox aislado</span></div><iframe title="Vista previa del proyecto" sandbox="allow-scripts" srcDoc={preview} /></section>}
              </div>
            </>}
          </section>
        </div>
      </main>
    </div>
  )
}
