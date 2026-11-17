import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useUi } from '../store/ui'

type Category = 'investigacion' | 'presentacion' | 'documento' | 'diseno' | 'programacion' | 'datos' | 'multimedia' | 'simulacion' | 'otro'
interface WorkProject { id: string; name: string; category: Category; objective: string; conversation_id: string | null; created_at: string; updated_at: string }
const categories: { value: Category; label: string; description: string }[] = [
  { value: 'investigacion', label: 'Investigación', description: 'Buscar información, comparar fuentes y elaborar conclusiones.' },
  { value: 'presentacion', label: 'Presentación', description: 'Definir si necesitás diapositivas, una presentación visual o un guion.' },
  { value: 'documento', label: 'Documento', description: 'Informes, trabajos, propuestas y archivos Word o PDF.' },
  { value: 'diseno', label: 'Diseño e imágenes', description: 'Ideas visuales, piezas gráficas y recursos de imagen.' },
  { value: 'programacion', label: 'Programación y videojuegos', description: 'Aplicaciones, sitios, prototipos y juegos.' },
  { value: 'datos', label: 'Datos y gráficos', description: 'Tablas, cálculos, análisis y visualizaciones.' },
  { value: 'multimedia', label: 'Multimedia', description: 'Guiones, audio y planificación de contenido audiovisual.' },
  { value: 'simulacion', label: 'Simulación científica', description: 'Modelos interactivos, parámetros físicos, cálculos y gráficos.' },
  { value: 'otro', label: 'Otro proyecto', description: 'Una idea que todavía no encaja en una categoría.' },
]

export function ProjectsPage() {
  const userId = useAuth((s) => s.me?.userId)
  const toast = useUi((s) => s.toast)
  const navigate = useNavigate()
  const [projects, setProjects] = useState<WorkProject[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('otro')
  const [objective, setObjective] = useState('')

  async function load() {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase.from('cr_work_projects').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
    if (error) toast('error', 'No se pudieron cargar los proyectos. Revisá que la migración de Proyectos esté aplicada.')
    setProjects((data ?? []) as WorkProject[])
    setLoading(false)
  }
  useEffect(() => { void useChat.getState().init(); void load() }, [userId])

  async function create() {
    if (!userId || !name.trim() || !objective.trim() || creating) return
    setCreating(true)
    try {
      await useChat.getState().init()
      if (!useChat.getState().modelId) throw new Error('No hay un modelo disponible. Revisá la configuración antes de crear el proyecto.')
      const conversationId = await useChat.getState().createConversation(false)
      const { data, error } = await supabase.from('cr_work_projects').insert({
        user_id: userId, conversation_id: conversationId, name: name.trim().slice(0, 120), category, objective: objective.trim().slice(0, 6000),
      }).select('*').single()
      if (error || !data) {
        await useChat.getState().remove(conversationId)
        throw new Error('No se pudo guardar el proyecto. Verificá que la migración esté aplicada.')
      }
      const selected = categories.find((x) => x.value === category)!
      const kickoff = [
        'Quiero trabajar en un PROYECTO nuevo dentro de Cut-real. Esta conversación es la memoria persistente de ese proyecto.',
        'Nombre: ' + name.trim(),
        'Categoría elegida: ' + selected.label + '. ' + selected.description,
        'Objetivo e idea inicial: ' + objective.trim(),
        'Tu tarea: convertí esta idea en un resultado concreto y mantené este chat separado como espacio de trabajo del proyecto. Primero detectá qué dato esencial falta y hacé como máximo UNA pregunta clara por vez. Después proponé un plan breve y trabajá por entregables incrementales. Adaptá el resultado a la categoría: Investigación = informe estructurado con fuentes verificables, citas, tablas y visuales solo si aportan; Documento = contenido listo para exportar cuando se pida archivo; Programación y videojuegos = archivos completos y vista previa ejecutable; Multimedia = guion, storyboard, plan audiovisual y recursos solicitados; Presentación = estructura de diapositivas con notas y recursos visuales; Diseño = propuestas visuales y variantes; Datos = tablas, cálculos y gráficos basados en datos reales; Simulación científica = controles, modelo matemático explícito, unidades, supuestos, gráficos y visualización interactiva; Otro = elegí el formato que mejor represente la idea y explicá por qué. No generes PDF, Word, imágenes ni audio salvo que el usuario lo pida o el objetivo lo exija explícitamente. No afirmes haber creado archivos, buscado en la web o generado imágenes si no lo hiciste. Conservá decisiones, archivos y avances en esta conversación y tratá los pedidos posteriores como continuación del mismo proyecto salvo que indique lo contrario.',
      ].join('\n\n')
      setProjects((old) => [data as WorkProject, ...old])
      void useChat.getState().send(conversationId, kickoff, { silent: false })
      navigate('/c/' + conversationId)
    } catch (e) { toast('error', (e as Error).message) }
    finally { setCreating(false) }
  }

  async function remove(project: WorkProject) {
    if (!confirm('¿Eliminar este proyecto? La conversación asociada no se eliminará.')) return
    const { error } = await supabase.from('cr_work_projects').delete().eq('id', project.id).eq('user_id', userId)
    if (error) return toast('error', 'No se pudo eliminar el proyecto.')
    setProjects((old) => old.filter((p) => p.id !== project.id))
  }

  return <div className="app"><Sidebar /><main className="projects-page">
    <header className="projects-top"><div><span className="studio-kicker">ESPACIO DE CREACIÓN</span><h1>Proyectos</h1><p>Convertí una idea en un trabajo concreto. Cut-real te va a ayudar a definir el formato, ordenar los pasos y producir el resultado.</p></div></header>
    <div className="projects-layout">
      <section className="projects-create">
        <div className="projects-section-title"><div><span className="section-eyebrow">EMPEZAR ALGO NUEVO</span><h2>¿Qué querés crear?</h2></div></div>
        <label className="lbl" htmlFor="project-name">Nombre del proyecto</label>
        <input id="project-name" className="field" maxLength={120} placeholder="Ej.: Presentación de ciencias" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="lbl">Tipo de proyecto</label>
        <div className="project-category-grid">{categories.map((item) => <button type="button" key={item.value} className={category === item.value ? 'project-category active' : 'project-category'} onClick={() => setCategory(item.value)}><b>{item.label}</b><small>{item.description}</small></button>)}</div>
        <label className="lbl" htmlFor="project-objective">Contame tu idea</label>
        <textarea id="project-objective" className="field project-objective" maxLength={6000} placeholder="¿Qué querés conseguir? No hace falta que tengas todo definido: Cut-real te va a hacer preguntas para aclararlo." value={objective} onChange={(e) => setObjective(e.target.value)} />
        <button type="button" className="btn primary projects-submit" disabled={!name.trim() || !objective.trim() || creating} onClick={() => void create()}>{creating ? 'Preparando proyecto…' : 'Crear proyecto y empezar →'}</button>
        <p className="hint">Cada proyecto conserva su propia conversación. Podés volver más tarde y continuar desde donde quedaste.</p>
      </section>
      <aside className="projects-list"><div className="projects-section-title"><div><span className="section-eyebrow">TU ESPACIO</span><h2>Proyectos guardados</h2></div></div>
        {loading ? <p className="hint">Cargando proyectos…</p> : projects.length ? projects.map((p) => <article className="work-project-card" key={p.id}><button className="work-project-open" onClick={() => p.conversation_id ? navigate('/c/' + p.conversation_id) : toast('info', 'Este proyecto todavía no tiene una conversación asociada.')}><small>{categories.find((x) => x.value === p.category)?.label ?? 'Proyecto'}</small><b>{p.name}</b><span>{p.objective}</span></button><button className="btn danger sm" onClick={() => void remove(p)}>Eliminar</button></article>) : <p className="hint">Todavía no creaste proyectos. El primero puede empezar con una idea incompleta.</p>}
      </aside>
    </div>
  </main></div>
}
