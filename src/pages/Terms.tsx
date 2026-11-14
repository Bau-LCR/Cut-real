import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export const TERMS_VERSION = '2026-11-14'

export function Terms() {
  const [accepted, setAccepted] = useState(false)
  const nav = useNavigate()
  function continueToLogin() {
    if (!accepted) return
    localStorage.setItem('cutreal_terms_accepted', TERMS_VERSION)
    nav('/login')
  }
  return <main className="terms-page">
    <header className="terms-head"><Link to="/" className="landing-brand"><img src={`${import.meta.env.BASE_URL}brand/Logo_Original.png`} alt="" /> <span>Cut-real <b>2</b></span></Link><Link to="/">Volver al inicio</Link></header>
    <article className="terms-document">
      <div className="landing-eyebrow">DOCUMENTO DE USO</div><h1>Términos y condiciones</h1>
      <p className="terms-date">Versión {TERMS_VERSION}</p>
      <h2>1. Naturaleza del proyecto</h2><p>Cut-real 2 es un proyecto personal, experimental y educativo, sin fines de lucro. No es un servicio comercial, no vende suscripciones y no garantiza continuidad, disponibilidad ni soporte profesional.</p>
      <h2>2. Registro y cuenta</h2><p>El acceso se realiza mediante Google. Cada usuario es responsable de proteger su cuenta y de la actividad realizada desde ella. El registro puede estar sujeto a restricciones de edad y condiciones de los proveedores utilizados. No se debe falsear la edad ni utilizar servicios externos incumpliendo sus términos.</p>
      <h2>3. Inteligencia artificial y exactitud</h2><p>Las respuestas se generan mediante modelos y servicios externos. Pueden contener errores, información incompleta o desactualizada. El usuario debe verificar información importante y no utilizar las respuestas como sustituto de asesoramiento profesional.</p>
      <h2>4. Servicios externos y límites gratuitos</h2><p>La aplicación puede utilizar proveedores independientes para modelos de IA, búsqueda web, almacenamiento, autenticación, voz y otras funciones. Cada proveedor establece sus propias condiciones, cuotas, límites, políticas y disponibilidad. Las funciones pueden reducirse o detenerse al alcanzar límites gratuitos. El proyecto procura priorizar servicios gratuitos y evitar cargos, pero no puede garantizar que terceros mantengan sus planes gratuitos o sus condiciones. No se habilitarán pagos automáticos desde Cut-real 2.</p>
      <h2>5. Uso aceptable</h2><p>No se permite utilizar la aplicación para actividades ilegales, vulnerar derechos de terceros, distribuir malware, acosar, suplantar identidades, acceder sin autorización a sistemas o intentar afectar la seguridad y disponibilidad del proyecto.</p>
      <h2>6. Archivos y contenido</h2><p>El usuario conserva la responsabilidad sobre los archivos y textos que comparte. Solo debe subir contenido que tenga derecho a utilizar. La compatibilidad depende de los formatos implementados y de las capacidades de cada modelo. No se garantiza que todos los documentos, imágenes o archivos puedan interpretarse o generarse correctamente.</p>
      <h2>7. Privacidad</h2><p>Los mensajes y archivos pueden procesarse y almacenarse mediante Supabase y proveedores externos necesarios para brindar las funciones. No compartas contraseñas, claves API, datos financieros ni información sensible. La política y los controles de privacidad disponibles en la aplicación complementan estos términos.</p>
      <h2>8. Cambios y finalización</h2><p>Al tratarse de un proyecto experimental, sus funciones, proveedores, límites y condiciones pueden cambiar o dejar de estar disponibles. Se podrán actualizar estos términos y se mostrará la versión vigente antes de continuar cuando corresponda.</p>
      <h2>9. Aceptación</h2><p>Al marcar la casilla y continuar, confirmás que leíste y aceptás estos términos y que el uso de los servicios externos asociados a tu cuenta respeta sus condiciones.</p>
      <label className="terms-accept"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>Leí y acepto los términos y condiciones de Cut-real 2.</span></label>
      <button className="btn primary terms-continue" disabled={!accepted} onClick={continueToLogin}>Aceptar y continuar a iniciar sesión</button>
      <p className="terms-small">Si no estás de acuerdo, no continúes con el registro.</p>
    </article>
  </main>
}
