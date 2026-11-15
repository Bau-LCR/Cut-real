import { Link } from 'react-router-dom'

export function LegalPage() {
  return <main className="legal-page">
    <header className="legal-top"><Link className="landing-brand" to="/"><span>Cut-real</span></Link><Link className="btn ghost" to="/">Volver</Link></header>
    <article className="legal-content">
      <span className="section-eyebrow">INFORMACIÓN DEL SERVICIO</span>
      <h1>Términos de uso y privacidad</h1>
      <p className="legal-updated">Borrador informativo · 15 de noviembre de 2026</p>
      <div className="notice"><b>Importante:</b> este texto es un borrador general para explicar el funcionamiento del servicio. No reemplaza una revisión legal. Antes de abrir el registro al público, el responsable adulto del proyecto debe revisar estas condiciones, completar los datos de contacto y verificar las condiciones de edad de cada proveedor externo utilizado.</div>
      <h2>1. Qué es Cut-real</h2>
      <p>Cut-real es una aplicación que permite conversar con modelos de inteligencia artificial y, según las funciones habilitadas, trabajar con archivos, proyectos, programación, búsqueda web, transcripción y síntesis de voz. Las funciones disponibles pueden cambiar según la configuración, el proveedor y el dispositivo.</p>
      <h2>2. Uso responsable</h2>
      <p>La persona usuaria debe utilizar el servicio de manera lícita, respetar los derechos de otras personas y no intentar acceder a cuentas, datos, sistemas o recursos sin autorización. No se debe utilizar Cut-real para acosar, amenazar, discriminar, vulnerar la privacidad, distribuir contenido ilegal ni interferir con la seguridad o disponibilidad del servicio.</p>
      <p>Un mensaje con un insulto inequívoco y explícitamente dirigido a Cut-real puede activar la suspensión automática de la cuenta desde el primer incidente. La medida queda registrada y solo una persona administradora puede revisar el caso y restaurar el acceso. El detector busca expresiones directas, no palabras aisladas; aun así, una transcripción de voz puede equivocarse y la revisión humana debe considerar el contexto. El sistema no puede determinar automáticamente todo uso ilegal: los reportes y los casos dudosos requieren revisión administrativa.</p>
      <h2>3. Cuentas y acceso</h2>
      <p>El acceso puede requerir aprobación del administrador. Cada persona es responsable de mantener la seguridad de su cuenta y de no compartir credenciales. El administrador puede limitar o suspender el acceso por motivos de seguridad o incumplimientos, con posibilidad de revisión.</p>
      <h2>4. Respuestas de inteligencia artificial</h2>
      <p>Las respuestas pueden ser incompletas, incorrectas, desactualizadas o contener errores. Deben verificarse los datos importantes. Cut-real no sustituye asesoramiento profesional, educativo, médico, jurídico o financiero. El código generado debe revisarse y probarse antes de utilizarse en sistemas reales.</p>
      <h2>5. Archivos, proyectos y contenido</h2>
      <p>La persona usuaria conserva la responsabilidad sobre el contenido que carga y debe contar con los permisos necesarios para utilizarlo. Las conversaciones y los proyectos se guardan asociados a la cuenta para permitir su continuidad. Cada proyecto puede conservar una conversación propia y archivos relacionados. La eliminación de un proyecto no necesariamente elimina la conversación vinculada, salvo que la aplicación lo indique expresamente.</p>
      <h2>6. Proveedores externos</h2>
      <p>Para generar respuestas, analizar imágenes o archivos, buscar información, transcribir audio o producir voz, Cut-real puede enviar el contenido necesario a proveedores externos configurados por el administrador. Cada proveedor aplica sus propias condiciones, políticas de privacidad, límites y requisitos de edad. No deben habilitarse integraciones para usuarios finales hasta verificar esos requisitos y obtener las autorizaciones que correspondan.</p>
      <h2>7. Privacidad y seguridad</h2>
      <p>Cut-real puede procesar datos de cuenta, preferencias, conversaciones, archivos adjuntos, proyectos y registros técnicos de uso para prestar el servicio, mantener la seguridad y resolver errores. El acceso administrativo a información privada debe limitarse a necesidades legítimas, quedar registrado cuando la auditoría esté disponible y respetar la normativa aplicable.</p>
      <p>No cargues contraseñas, claves API, datos bancarios, documentos de identidad ni información sensible propia o de terceros. Las claves de proveedores deben mantenerse exclusivamente en secretos del servidor y nunca en el navegador ni en el código público.</p>
      <h2>8. Disponibilidad y cambios</h2>
      <p>El servicio se ofrece según la disponibilidad de la infraestructura y de los proveedores externos. Puede haber interrupciones, límites de uso o cambios de funciones. No se garantiza disponibilidad ininterrumpida ni que todos los modelos admitan todas las funciones.</p>
      <h2>9. Consultas y solicitudes sobre datos</h2>
      <p>Para solicitar acceso, corrección o eliminación de datos, o para pedir la revisión de una medida de moderación, debe utilizarse el canal de contacto que el responsable del proyecto publique junto con estos términos. Ese dato de contacto debe completarse antes del lanzamiento público.</p>
      <h2>10. Revisión de estas condiciones</h2>
      <p>Estas condiciones deben revisarse antes de cada lanzamiento importante y actualizarse cuando cambien los proveedores, las funciones, las prácticas de tratamiento de datos o la normativa aplicable.</p>
      <footer className="legal-footer"><Link to="/">Inicio de Cut-real</Link><span>Cut-real · Información del servicio</span></footer>
    </article>
  </main>
}
