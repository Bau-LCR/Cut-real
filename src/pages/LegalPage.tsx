import { Link } from 'react-router-dom'

export function LegalPage() {
  return <main className="legal-page">
    <header className="legal-top">
      <Link className="landing-brand" to="/"><span>Cut-real 2</span></Link>
      <Link className="btn ghost" to="/">Volver al inicio</Link>
    </header>
    <article className="legal-content">
      <span className="section-eyebrow">INFORMACIÓN DEL SERVICIO</span>
      <h1>Términos de uso y política de privacidad</h1>
      <p className="legal-updated">Última actualización: 24 de noviembre de 2026</p>
      <div className="notice"><b>Importante:</b> Cut-real 2 es actualmente un servicio privado de acceso restringido. Este documento explica las condiciones previstas de uso y privacidad; no constituye asesoramiento jurídico. El responsable del proyecto debe revisar estas condiciones y completarlas si cambian las funciones, los proveedores o la normativa aplicable.</div>

      <h2>Parte I · Términos de uso</h2>
      <h3>1. Naturaleza del servicio</h3>
      <p>Cut-real 2 es una aplicación privada que reúne una interfaz de conversación con modelos de inteligencia artificial y otras herramientas que el responsable habilite, como búsqueda web, análisis de archivos, programación asistida y funciones de voz. Las funciones pueden cambiar, limitarse o quedar temporalmente fuera de servicio.</p>
      <h3>2. Acceso restringido y autorización de cuentas</h3>
      <p>Cut-real 2 no es, en su estado actual, un servicio público ni una plataforma de registro abierto. La posibilidad de iniciar sesión o completar un registro no concede por sí sola autorización para utilizar la aplicación. Cada cuenta debe ser habilitada o aprobada expresamente por el propietario o por un administrador autorizado. Las cuentas que todavía no hayan sido aprobadas permanecerán sin acceso a las funciones privadas. El propietario puede conceder, limitar, suspender o revocar el acceso por motivos de seguridad, mantenimiento o administración del servicio.</p>
      <p>La autorización es personal y no debe compartirse ni transferirse. El usuario debe proteger el acceso a su cuenta y avisar al responsable si sospecha que otra persona la está utilizando. La creación de cuentas adicionales, el acceso automatizado o el intento de eludir el proceso de aprobación no están permitidos sin autorización expresa.</p>
      <h3>3. Uso aceptable</h3>
      <p>El servicio debe utilizarse de manera lícita y respetuosa. No está permitido intentar acceder a cuentas, datos o sistemas ajenos; interferir con la disponibilidad o seguridad de la aplicación; vulnerar la privacidad o los derechos de terceros; ni utilizar las herramientas para fraude, amenazas, acoso o actividades ilegales.</p>
      <h3>4. Respuestas y contenido generado por IA</h3>
      <p>Las respuestas de inteligencia artificial pueden ser incorrectas, incompletas o estar desactualizadas. El usuario debe verificar la información importante y revisar el código antes de ejecutarlo. Cut-real no sustituye a docentes ni a profesionales médicos, jurídicos, financieros o de emergencia. Quien adjunta archivos o contenido debe contar con los derechos y permisos necesarios para hacerlo.</p>
      <h3>5. Disponibilidad, límites y cambios</h3>
      <p>La disponibilidad depende de la infraestructura, la configuración del responsable, el dispositivo y los límites de los proveedores externos. No se garantiza un funcionamiento ininterrumpido. Los modelos, herramientas, cuotas y límites pueden modificarse o retirarse, especialmente cuando se trate de funciones experimentales.</p>
      <h3>6. Proveedores externos</h3>
      <p>Para procesar solicitudes, archivos, imágenes, búsquedas o audio, Cut-real puede enviar el contenido necesario a los proveedores de IA o infraestructura configurados por el responsable. Cada proveedor aplica sus propias condiciones, políticas de privacidad, reglas de retención y ubicaciones de procesamiento. El responsable debe mantener esa configuración bajo revisión.</p>

      <h2>Parte II · Política de privacidad</h2>
      <h3>7. Datos que se pueden tratar</h3>
      <p>Según el uso de la aplicación, pueden tratarse el identificador de cuenta, correo electrónico, nombre e imagen de perfil proporcionados por el inicio de sesión; las preferencias de configuración; conversaciones y mensajes; archivos adjuntos; datos de uso y consumo; y registros técnicos necesarios para la seguridad, el diagnóstico y la administración.</p>
      <h3>8. Finalidades y acceso interno</h3>
      <p>Los datos se utilizan para verificar la identidad y autorización de la cuenta, prestar las funciones solicitadas, guardar y recuperar conversaciones, sincronizar preferencias, administrar permisos, controlar el uso, prevenir abusos y resolver errores. El acceso administrativo a información de usuarios debe limitarse a tareas legítimas de soporte, seguridad o administración y realizarse mediante las herramientas y controles disponibles. La autorización de acceso a la aplicación no implica que otros usuarios puedan ver las conversaciones privadas de una cuenta.</p>
      <h3>9. Almacenamiento y procesamiento por terceros</h3>
      <p>La aplicación utiliza la base de datos y los servicios de infraestructura configurados por el responsable. Cuando una función necesita un proveedor externo, se transmite el contenido necesario para procesar esa solicitud. El tratamiento, la retención y la eventual utilización de datos por parte de cada proveedor dependen de sus propias condiciones y de la configuración vigente. No se debe asumir que todos los proveedores tienen las mismas prácticas.</p>
      <h3>9 bis. Laboratorio neuronal, sincronización y aprendizaje</h3>
      <p>El Laboratorio neuronal es una función experimental disponible únicamente para cuentas con rol de administrador o propietario. Su núcleo ejecuta 121.000 unidades numéricas locales distribuidas en ocho capas, con conexiones ponderadas entre capas y cálculo en la CPU del dispositivo. Estas unidades aplican transformaciones numéricas fijas y no equivalen a 121.000 parámetros lingüísticos entrenados individualmente. El mapa visual representa las 121.000 unidades computacionales y sus 317.625 conexiones entre capas mediante un lienzo interactivo; cada unidad puede seleccionarse y reubicarse. Las funciones se agrupan por capa y categoría. Incluye además un clasificador entrenable, propagación de señales y módulos de recuperación de memoria y búsqueda. La cantidad de unidades no implica que sea un modelo lingüístico grande ni que tenga capacidades equivalentes a otros asistentes generativos. La arquitectura, sus conexiones, parámetros y pesos se sincronizan en la nube de Cut-real para que el administrador autorizado pueda recuperarlos en otros dispositivos; la inferencia y la propagación de señales se ejecutan localmente en el dispositivo que abre el laboratorio.</p>
      <p>La opción «Usar mis conversaciones para memoria y entrenamiento local» está activada por defecto. Al abrir el Laboratorio, se intenta importar automáticamente el historial completado de la propia cuenta; las nuevas interacciones se incorporan a su memoria privada y a los ejemplos de entrenamiento. Puede desactivarse desde el Laboratorio. Los registros destinados a Memory Task se vinculan al identificador de la propia cuenta y no se mezclan con los de otras cuentas. La sincronización en la nube requiere que el servicio Memory Task esté disponible y conectado; si falla, el Laboratorio conserva la copia local y muestra el estado de sincronización. Existe una opción distinta, «Compartir ejemplos anonimizados para mejorar la red común», desactivada por defecto y voluntaria. Si el usuario la activa, Cut-real envía el texto de las preguntas tras aplicar filtros automáticos a correos, enlaces, teléfonos e identificadores, junto con una etiqueta de intención; no envía la respuesta ni el historial completo. La anonimización automática puede no detectar todos los datos personales, por lo que no se deben aportar datos sensibles. Los ejemplos compartidos pueden ser consultados por administradores autorizados e incorporarse al entrenamiento de la red común. Desactivar la opción detiene aportes futuros, pero no elimina los ejemplos compartidos previamente; el usuario puede solicitar su eliminación al responsable.</p>
      <p>Los chats privados de otros usuarios no se recopilan automáticamente para el entrenamiento global. Si el administrador activa la búsqueda web del Laboratorio, las consultas necesarias se envían a la fuente pública seleccionada (actualmente Wikipedia) y quedan sujetas a las condiciones de ese proveedor. El dictado de voz utiliza el reconocimiento de voz que ofrece el navegador; según el navegador y su configuración, el audio puede ser procesado por un proveedor externo y no debe considerarse necesariamente una transcripción íntegramente local.</p>
      <h3>10. Seguridad y conservación</h3>
      <p>Se aplican controles técnicos como autenticación, autorización por cuenta y restricciones de acceso a los datos. Ningún sistema puede garantizar seguridad absoluta. La información puede conservarse mientras sea necesaria para mantener la cuenta, el historial solicitado, la seguridad y el funcionamiento del servicio, o para atender obligaciones aplicables. La eliminación debe solicitarse al responsable y estará sujeta a los procedimientos y copias de seguridad disponibles.</p>
      <h3>11. Solicitudes sobre datos personales</h3>
      <p>El usuario puede solicitar información, corrección o eliminación de datos cuando corresponda, contactando al propietario o responsable de Cut-real 2 por el canal que este haya facilitado. No se publica aquí una dirección de correo de contacto porque el proyecto todavía no ha definido un canal público específico.</p>
      <h3>12. Menores y requisitos de los proveedores</h3>
      <p>El acceso y el uso deben respetar los requisitos de edad, consentimiento y autorización aplicables, así como las condiciones de cada proveedor externo. El responsable debe verificar esos requisitos antes de habilitar cuentas o funciones nuevas.</p>
      <h3>13. Cambios de este documento</h3>
      <p>Estos términos pueden actualizarse cuando cambien las funciones, los proveedores, las prácticas de tratamiento de datos o las reglas aplicables. La fecha indicada al comienzo identifica la última revisión publicada.</p>

      <footer className="legal-footer"><Link to="/">Inicio de Cut-real</Link><span>Cut-real 2 · Servicio privado de acceso restringido</span></footer>
    </article>
  </main>
}
