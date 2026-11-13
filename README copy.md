# Cut-real 2

Plataforma de chat con inteligencia artificial: conversaciones sincronizadas entre dispositivos, varias generaciones simultáneas e independientes, Markdown con tablas/código/fórmulas, archivos adjuntos, voz, búsqueda web, panel de administración y API propia.

- **Frontend:** React + TypeScript + Vite (estático, publicable en GitHub Pages).
- **Backend:** Supabase (Auth con Google, Postgres con RLS, Storage, Realtime) + 5 Edge Functions en Deno.
- **IA:** capa de proveedores intercambiable. Groq listo; Gemini y cualquier API compatible con OpenAI se agregan desde el panel.

## Empezar en 5 minutos (modo desarrollo)

```bash
npm install
cp .env.example .env        # completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev                 # http://localhost:5173
```

Sin completar `.env` la app abre y avisa qué falta. Para que funcione el inicio de sesión y las respuestas hay que preparar Supabase: **seguí `docs/DEPLOY.md` paso a paso** (crear proyecto, correr migraciones, Google OAuth, secretos, funciones).

## Qué hay en cada carpeta

```
src/                 Frontend (páginas, componentes, stores, voz)
  store/chat.ts      Núcleo: una generación independiente por conversación, recuperación, Realtime
  voice/             Grabación, detección de fin de turno, motores de voz intercambiables
supabase/
  migrations/        Esquema SQL + RLS + seeds (ejecutar en orden)
  functions/         chat · admin · api · transcribe · tts  (+ _shared/)
  config.toml        Configuración del CLI de Supabase
public/brand/        Los dos logos oficiales (sin modificar) y derivados de favicon
docs/                DEPLOY · API · VOICE · MEMORY_TASK · SECURITY
tests/               Unitarios, base de datos/RLS, integración del backend, interfaz
scripts/             Generador de favicons y escáner de secretos
.github/workflows/   Publicación en GitHub Pages
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `preview` | Desarrollo, compilación (con chequeo de tipos), vista previa |
| `npm test` | 17 tests unitarios (parser de streaming, API keys, contexto, validación de archivos, voz) |
| `npm run check:secrets` | Falla si hay claves, `.env` con valores o secretos de servidor en `src/`/`dist/` |
| `npm run verify` | Tipos + tests + build + escáner de secretos |
| `npm run db:push` · `fn:deploy` · `secrets:set` | Migraciones, funciones y secretos con el CLI de Supabase |
| `npm run assets` | Regenera favicons a partir de `Logo_Original.png` (solo recorta y redimensiona) |

Pruebas avanzadas (opcionales, requieren herramientas extra; ver cabecera de cada archivo):
`tests/db/rls.test.sql` (seguridad de la base), `tests/integration/` (funciones reales + Postgres + PostgREST, Groq simulado), `tests/e2e/ui_smoke.py` (Chromium).

## Funciones principales

- **Conversaciones:** crear, renombrar, fijar, eliminar, buscar (título y contenido), historial paginado, sincronización entre dispositivos.
- **Simultaneidad:** podés enviar en una conversación, cambiar a otra y enviar de nuevo. Cada una tiene su stream, su cancelación y sus errores. El servidor guarda la respuesta mientras se genera: si cerrás el navegador o se cae la conexión, se recupera al volver.
- **Mensajes:** copiar, editar y reenviar, regenerar, detener, errores y estados de carga.
- **Archivos:** PDF, TXT, DOCX, CSV, JSON e imágenes (máx. 10 MB, 5 por mensaje). El texto se extrae en el navegador; a la IA solo se le entrega lo realmente leído. Un archivo sin procesar (p. ej. PDF escaneado) se marca "sin analizar" y la IA lo sabe. Las imágenes solo las ve un modelo con visión.
- **Voz:** dictado (Whisper vía Groq) con revisión antes de enviar, lectura con pausa/reanudar/detener/velocidad, y modo conversación por voz con detección de fin de turno e interrupción.
- **Búsqueda web:** real, con Tavily o Brave si configurás una clave; muestra fuentes numeradas. Sin proveedor, el interruptor avisa que no está configurada (nunca simula).
- **Administración:** estadísticas, usuarios (buscar, promover/revocar admin, suspender/restaurar), proveedores y modelos, API keys, integraciones y auditoría.
- **API propia:** claves `crk_…` con scopes y límites, endpoint compatible con OpenAI. Ver `docs/API.md`.

## Estado de verificación (honesto)

**Verificado automáticamente** (resultados de la última corrida):

| Área | Resultado |
|---|---|
| Migraciones SQL en Postgres 16 real + pruebas de RLS | OK |
| Tipos (`tsc`) y compilación de producción | OK |
| Tests unitarios (frontend y backend) | 17 / 17 |
| Edge Functions: `deno check` | 5 / 5 |
| Integración: funciones reales + Postgres + PostgREST (Groq simulado) | 62 / 62 |
| Interfaz en Chromium (escritorio y móvil, backend simulado) | 20 / 20 |
| Escáner de secretos | Limpio |

La integración cubre streaming, contexto, editar/regenerar, conversaciones simultáneas, cancelación (corta la llamada al proveedor), continuación tras desconectar el cliente, límites por usuario/proveedor/clave, adjuntos, permisos de admin, auditoría y API keys.

**Requiere TUS credenciales/servicios y no pudo probarse acá:** inicio de sesión con Google, respuestas de Groq reales, Supabase Storage y Realtime reales, extracción de PDF/DOCX en un navegador real, audio (micrófono, transcripción, lectura y la "voz Reaper"), búsqueda web real. Están implementados y preparados; la primera prueba real es tuya (ver `docs/DEPLOY.md`, sección "Cómo comprobar que todo anda").

## Limitaciones conocidas

- Una generación activa por conversación (en conversaciones distintas pueden ser simultáneas).
- Las Edge Functions tienen un límite de tiempo por ejecución según tu plan de Supabase; respuestas muy largas pueden cortarse y quedar marcadas como "interrumpidas" con botón Reintentar.
- Rate limit de ventana fija (por minuto): suficiente para uso normal, no es un limitador deslizante.
- Los IDs de modelos de Groq/Gemini cambian con el tiempo: verificalos en sus consolas y ajustalos desde el panel.
- La integración con Memory Task está **preparada** (tablas, scopes, autorizaciones revocables, API keys), pero los endpoints de intercambio de datos se definen cuando conozcamos su estructura. Ver `docs/MEMORY_TASK.md`.
- El acceso es solo con Google, como se pidió.

## Identidad visual

Carbón, grafito, azules oscuros y platino (el color del anillo del logo). Los logos se usan tal cual (sin sombras, deformaciones ni fondos): `Logo_Original.png` en interfaz y favicon; `Logo_Monocromatico.png` queda disponible en `public/brand/` para presentaciones monocromáticas.
