import { Link } from 'react-router-dom'

const features = [
  ['Conversar y aprender', 'Explicaciones, ideas, redacción, traducción y ayuda para estudiar.'],
  ['Programar y crear', 'Generación, explicación y revisión de HTML, CSS, JavaScript, TypeScript y otros lenguajes.'],
  ['Trabajar con archivos', 'Adjuntar documentos compatibles para extraer texto, resumirlos y analizarlos.'],
  ['Buscar en Internet', 'Consultas web selectivas para información actual, con enlaces a las fuentes cuando estén disponibles.'],
  ['Voz', 'Dictado, lectura de respuestas y opciones de voz según el navegador y los servicios configurados.'],
  ['Crear contenido', 'Ayuda para preparar documentos, código, tablas, textos y materiales de trabajo.'],
]

export function Landing() {
  return <main className="landing">
    <header className="landing-nav">
      <Link to="/" className="landing-brand"><img src={`${import.meta.env.BASE_URL}brand/Logo_Original.png`} alt="" /> <span>Cut-real <b>2</b></span></Link>
      <nav><a href="#capacidades">Capacidades</a><a href="#proyecto">El proyecto</a><Link className="btn primary" to="/terms">Comenzar</Link></nav>
    </header>
    <section className="landing-hero">
      <div className="landing-kicker">PROYECTO PERSONAL · EDUCATIVO · SIN FINES DE LUCRO</div>
      <h1>Una herramienta para <span>imaginar, aprender y crear.</span></h1>
      <p>Cut-real 2 es un asistente de inteligencia artificial experimental que reúne conversación, programación, archivos, voz y búsqueda web en un mismo espacio.</p>
      <div className="landing-actions"><Link className="btn primary" to="/terms">Iniciar / Crear cuenta</Link><a className="btn" href="#capacidades">Conocer capacidades</a></div>
      <div className="landing-note">Acceso con Google · Uso gratuito sujeto a los límites de los proveedores externos.</div>
    </section>
    <section id="capacidades" className="landing-section">
      <div className="landing-eyebrow">QUÉ PUEDE HACER</div><h2>Un espacio de herramientas, no solo un chat.</h2>
      <div className="landing-grid">{features.map(([title, desc]) => <article className="landing-card" key={title}><h3>{title}</h3><p>{desc}</p></article>)}</div>
    </section>
    <section className="landing-section landing-project" id="proyecto">
      <div><div className="landing-eyebrow">CÓMO ESTÁ CONSTRUIDO</div><h2>Un proyecto abierto al aprendizaje.</h2>
        <p>Cut-real 2 está desarrollado como proyecto personal y educativo, combinando tecnologías web, modelos de inteligencia artificial y servicios de terceros. La idea es experimentar, aprender cómo funcionan estas herramientas y compartir una experiencia útil.</p>
      </div>
      <div className="landing-concept">
        <div><b>Interfaz web</b><span>React · TypeScript · Vite</span></div><i>↓</i>
        <div><b>Backend y cuentas</b><span>Supabase · autenticación · almacenamiento</span></div><i>↓</i>
        <div><b>Servicios de IA</b><span>Modelos y proveedores configurables</span></div><i>↓</i>
        <div><b>Herramientas</b><span>Archivos · voz · búsqueda web</span></div>
      </div>
    </section>
    <section className="landing-disclaimer"><h2>Transparencia y límites</h2>
      <p>Cut-real 2 no es un servicio comercial ni ofrece garantías de disponibilidad. Las funciones dependen de proveedores externos, sus condiciones, cuotas gratuitas, límites técnicos y cambios de disponibilidad. Cuando se agotan los límites gratuitos, algunas funciones pueden pausarse hasta su reinicio. No se promete que todos los formatos o herramientas estén disponibles en todo momento.</p>
      <p>La IA puede cometer errores. Verificá los datos importantes y no compartas información sensible. Consultá los términos y condiciones antes de crear una cuenta.</p>
      <Link to="/terms">Leer términos y condiciones</Link>
    </section>
    <footer className="landing-footer"><span>Cut-real 2 · Proyecto personal y educativo</span><Link to="/terms">Términos y condiciones</Link></footer>
  </main>
}
