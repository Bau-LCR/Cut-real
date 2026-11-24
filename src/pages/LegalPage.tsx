import { Link } from 'react-router-dom'

export function LegalPage() {
  return <main className="legal-page">
    <header className="legal-top"><Link className="landing-brand" to="/"><span>Cut-real 2</span></Link><Link className="btn ghost" to="/">Volver al inicio</Link></header>
    <article className="legal-content">
      <span className="section-eyebrow">INFORMACIÓN DEL SERVICIO</span>
      <h1>Términos de uso y política de privacidad</h1>
      <p className="legal-updated">Versión informativa · 23 de noviembre de 2026</p>
      <div className="notice"><b>Nota:</b> este documento describe de forma general el funcionamiento previsto de Cut-real 2. Es un texto informativo y no constituye asesoramiento jurídico. Antes de ofrecer el servicio públicamente, el responsable del proyecto debe completar los datos de contacto, confirmar los proveedores y sus condiciones vigentes, y obtener una revisión legal adecuada.</div>

      <h2>Parte I · Términos de uso</h2>
      <h3>1. Servicio</h3>
      <p>Cut-real 2 es una aplicación que ofrece una interfaz para conversar con modelos de inteligencia artificial y utilizar las herramientas que estén habilitadas en cada momento. Entre ellas pueden encontrarse selección de modelos, búsqueda web, carga y análisis de archivos, programación asistida y funciones de voz. La disponibilidad depende de la configuración, del dispositivo y de los proveedores externos. Las secciones Proyectos y Simulación no están disponibles actualmente en la interfaz.</p>
      <h3>2. Cuenta y acceso</h3>
      <p>El inicio de sesión se realiza mediante Google. El acceso puede requerir aprobación del responsable o administrador. Cada usuario debe proteger sus credenciales y avisar si sospecha que otra persona accedió a su cuenta. Los administradores pueden restringir temporalmente el acceso por razones de seguridad o incumplimiento, y deben ofrecer un canal para solicitar revisión.</p>
      <h3>3. Uso aceptable</h3>
      <p>El servicio debe utilizarse de forma lícita y respetuosa. No está permitido intentar acceder sin autorización a cuentas, datos o sistemas; interferir con el funcionamiento del servicio; vulnerar la privacidad o los derechos de terceros; ni utilizarlo para amenazas, acoso, fraude o distribución de contenido ilegal. Las medidas de moderación automatizada pueden equivocarse y los casos dudosos deben revisarse teniendo en cuenta el contexto.</p>
      <h3>4. Contenido y respuestas de IA</h3>
      <p>Las respuestas pueden contener errores, omisiones o información desactualizada. El usuario debe verificar los datos importantes y revisar el código generado antes de ejecutarlo. Cut-real no sustituye la orientación de docentes ni el asesoramiento profesional médico, jurídico, financiero o de emergencia. El usuario conserva la responsabilidad de contar con derechos y permisos sobre los archivos y contenidos que adjunta.</p>
      <h3>5. Disponibilidad y cambios</h3>
      <p>Las funciones, modelos y límites pueden cambiar, quedar temporalmente fuera de servicio o depender de cuotas de terceros. No se garantiza disponibilidad ininterrumpida ni compatibilidad de todas las funciones con todos los modelos. Las funciones experimentales pueden modificarse o retirarse.</p>
      <h3>6. Proveedores externos</h3>
      <p>Para procesar mensajes, archivos, imágenes, búsquedas o audio, la aplicación puede transmitir el contenido necesario a los proveedores configurados. Esos proveedores aplican sus propios términos, políticas, medidas de seguridad, ubicaciones de procesamiento y límites. El responsable debe mantener una lista actualizada de proveedores y revisar sus condiciones antes de habilitarlos.</p>

      <h2>Parte II · Política de privacidad</h2>
      <h3>7. Datos que pueden tratarse</h3>
      <p>Según las funciones utilizadas, Cut-real puede procesar datos básicos de cuenta proporcionados por Google (como identificador, correo y nombre visible), preferencias de la aplicación, conversaciones, archivos adjuntos, registros de llamadas o voz cuando se utilicen esas funciones, y datos técnicos necesarios para operar, diagnosticar errores y proteger el servicio.</p>
      <h3>8. Finalidades</h3>
      <p>Los datos se utilizan para autenticar al usuario, prestar las funciones solicitadas, guardar y recuperar conversaciones, mostrar el historial, administrar permisos, controlar el uso, prevenir abusos, mantener la seguridad y solucionar fallos. No debe afirmarse que los datos se utilizan para una finalidad distinta sin actualizar esta política y la configuración real.</p>
      <h3>9. Almacenamiento y terceros</h3>
      <p>La aplicación utiliza servicios de infraestructura y base de datos configurados por el responsable. El contenido enviado a un modelo o servicio externo puede ser procesado por ese proveedor para devolver el resultado solicitado. La retención, ubicación, uso para mejora de modelos y eliminación por parte de cada proveedor dependen de sus condiciones y de la configuración contratada; el usuario debe consultar también las políticas de dichos proveedores.</p>
      <h3>10. Acceso, seguridad y conservación</h3>
      <p>El acceso a los datos debe limitarse a las personas y sistemas que lo necesiten para operar el servicio. Se aplican medidas técnicas y organizativas razonables, pero ningún sistema puede garantizar seguridad absoluta. Los datos se conservan mientras sean necesarios para prestar el servicio, mantener el historial o cumplir obligaciones aplicables, y deben eliminarse o anonimizarse cuando corresponda según los procedimientos disponibles.</p>
      <h3>11. Derechos y solicitudes</h3>
      <p>El usuario puede solicitar información sobre sus datos, corrección o eliminación cuando corresponda. Antes de publicar el servicio, el responsable debe completar y mantener visible un canal de contacto para estas solicitudes: <b>CONTACTO DEL RESPONSABLE PENDIENTE DE COMPLETAR</b>. No se debe considerar este documento listo para un lanzamiento público mientras falte ese dato.</p>
      <h3>12. Menores de edad</h3>
      <p>El acceso y el uso de proveedores externos deben respetar los requisitos de edad, consentimiento y autorización aplicables en cada jurisdicción y los términos de cada proveedor. El responsable debe verificar estas condiciones antes de habilitar el registro o una nueva integración.</p>
      <h3>13. Cambios a esta política</h3>
      <p>Esta política debe actualizarse cuando se incorporen proveedores, cambien las funciones, se modifiquen las prácticas de almacenamiento o tratamiento, o lo exija la normativa. La fecha de versión se actualizará cada vez que se publique una modificación sustancial.</p>
      <footer className="legal-footer"><Link to="/">Inicio de Cut-real</Link><span>Cut-real 2 · Información del servicio</span></footer>
    </article>
  </main>
}