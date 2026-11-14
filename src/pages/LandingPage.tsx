import { Link } from 'react-router-dom'

const features = [
  { n: '01', title: 'Conversaciones inteligentes', text: 'Trabajá con distintos modelos de IA, mantené el contexto y retomá tus conversaciones cuando quieras.' },
  { n: '02', title: 'Búsqueda web con fuentes', text: 'Activá la búsqueda en internet para consultar información reciente y abrir directamente las páginas de origen.' },
  { n: '03', title: 'Documentos y archivos', text: 'Adjuntá PDF, Word, texto, tablas, datos e imágenes para que Cut-real pueda leerlos y ayudarte a interpretarlos.' },
  { n: '04', title: 'Voz y transcripción', text: 'Dictá tus mensajes, convertí audio en texto y escuchá respuestas con las opciones de voz disponibles.' },
  { n: '05', title: 'Programación asistida', text: 'Un espacio de trabajo para organizar proyectos, escribir código y comprobar resultados en una vista previa.' },
  { n: '06', title: 'Privacidad y control', text: 'Configurá tus preferencias, administrá integraciones autorizadas y conservá el control de tu cuenta.' },
]

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link to="/" className="landing-brand"><img src={`${import.meta.env.BASE_URL}brand/Logo_Original.png`} alt="" /> <span>Cut-real <b>2</b></span></Link>
        <nav><a href="#funciones">Funciones</a><a href="#como-funciona">Cómo funciona</a><Link className="btn landing-login" to="/login">Iniciar sesión</Link></nav>
      </header>

      <section className="landing-hero">
        <div className="landing-kicker"><span /> TU ESPACIO DE INTELIGENCIA ARTIFICIAL</div>
        <h1>Ideas que avanzan.<br /><em>Proyectos que toman forma.</em></h1>
        <p>Estudiá, investigá, programá y creá desde un mismo lugar. Cut-real reúne herramientas de inteligencia artificial en un espacio simple, flexible y pensado para trabajar.</p>
        <div className="landing-actions"><Link className="btn primary" to="/login">Comenzar con Cut-real <span aria-hidden="true">→</span></Link><a href="#funciones" className="landing-secondary">Conocé sus funciones ↓</a></div>
        <div className="landing-preview" aria-label="Vista conceptual de Cut-real">
          <div className="preview-sidebar"><div className="preview-logo">◉ <b>Cut-real</b></div><div className="preview-new">＋ Nueva conversación</div><small>RECIENTES</small><div className="preview-line active">Planificación de proyecto</div><div className="preview-line">Ideas para estudiar</div><div className="preview-line">Revisión de código</div><div className="preview-user"><i /> Mi espacio</div></div>
          <div className="preview-main"><div className="preview-top"><span>Planificación de proyecto</span><small>MODELO IA　⌄</small></div><div className="preview-chat"><div className="preview-user-msg">Quiero organizar una idea y convertirla en un proyecto.</div><div className="preview-answer"><b>Vamos a darle forma.</b><p>Podemos dividir el trabajo en etapas, definir objetivos y crear los archivos necesarios para empezar.</p><div className="preview-pills"><span>Investigación</span><span>Planificación</span><span>Desarrollo</span></div></div><div className="preview-input">Escribí tu mensaje… <span>↑</span></div></div></div>
        </div>
        <div className="landing-caption">UN SOLO ESPACIO · MUCHAS FORMAS DE CREAR</div>
      </section>

      <section className="landing-section" id="funciones">
        <div className="section-eyebrow">QUÉ PODÉS HACER</div>
        <h2>Herramientas para cada etapa<br />de tus ideas.</h2>
        <p className="section-lead">Desde una consulta rápida hasta un proyecto completo, tenés herramientas conectadas en una misma experiencia.</p>
        <div className="landing-features">{features.map((f) => <article className="landing-feature" key={f.n}><span>{f.n}</span><h3>{f.title}</h3><p>{f.text}</p></article>)}</div>
      </section>

      <section className="landing-workflow" id="como-funciona">
        <div className="workflow-copy"><div className="section-eyebrow">UN FLUJO DE TRABAJO CLARO</div><h2>De la pregunta<br />al resultado.</h2><p>Empezá con una conversación, sumá contexto y elegí la herramienta adecuada. Cut-real te ayuda a avanzar sin perder de vista lo que estás construyendo.</p></div>
        <div className="workflow-steps"><div><b>01</b><span><strong>Planteá tu objetivo</strong><small>Escribí, dictá o adjuntá material para explicar qué necesitás.</small></span></div><div><b>02</b><span><strong>Elegí cómo trabajar</strong><small>Usá modelos de IA, búsqueda web, voz o herramientas de creación.</small></span></div><div><b>03</b><span><strong>Revisá y mejorá</strong><small>Iterá sobre las respuestas, documentos y proyectos hasta llegar al resultado.</small></span></div></div>
      </section>

      <section className="landing-callout"><div><div className="section-eyebrow">TU PRÓXIMO PASO EMPIEZA ACÁ</div><h2>Todo listo para empezar.</h2><p>Ingresá a tu espacio y convertí una idea en algo concreto.</p></div><Link className="btn primary" to="/login">Entrar a Cut-real <span aria-hidden="true">→</span></Link></section>
      <footer className="landing-footer"><span>© {new Date().getFullYear()} Cut-real 2</span><span>Inteligencia artificial para aprender, crear y desarrollar.</span></footer>
    </main>
  )
}
