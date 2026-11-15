# Guía de despliegue (paso a paso)

Tiempo estimado: 30–40 minutos. Necesitás: cuenta de Supabase, cuenta de Google (Google Cloud), cuenta de Groq, cuenta de GitHub, Node.js 20+.

> **Regla de oro:** solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` van al frontend. Las claves de Groq/Gemini/Tavily y la `service_role` **nunca** salen de los secretos de Supabase.

## 1. Crear el proyecto de Supabase
1. Entrá a https://supabase.com/dashboard → **New project**. Anotá la contraseña de la base (no se usa en la app).
2. **Project Settings → API**: copiá **Project URL** y la clave **anon / publishable**. Las vas a usar en el paso 8.
3. **Project Settings → General**: anotá el **Reference ID** (ej. `abcdxyz`).

## 2. Ejecutar las migraciones SQL
**Opción A (CLI, recomendada):**
```bash
npx supabase login
npx supabase link --project-ref TU_REFERENCE_ID
npm run db:push
```
**Opción B (sin CLI):** en el dashboard → **SQL Editor → New query**, ejecutá todos los archivos de `supabase/migrations/` en orden lexicográfico (por fecha y hora del nombre), sin saltear ninguno. La lista actual llega hasta `20261115000400_memory_task_record_scopes.sql`; incluye integraciones, modelos, proyectos, memoria, visión auxiliar, acceso aprobado y el límite diario de tokens. Si el repositorio recibe migraciones nuevas, también deben ejecutarse en ese mismo orden.

Todas las tablas propias llevan prefijo `cr_`, así que conviven con otras apps (p. ej. Memory Task) en el mismo proyecto.

## 3. Configurar Google OAuth
1. https://console.cloud.google.com → crear/elegir proyecto → **APIs & Services → OAuth consent screen** (tipo External, completá nombre y correo).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorized redirect URIs:** `https://TU_REFERENCE_ID.supabase.co/auth/v1/callback`
3. Copiá **Client ID** y **Client secret**.
4. En Supabase: **Authentication → Sign In / Providers → Google** → activar, pegar Client ID y Secret, guardar.
5. En Supabase: **Authentication → URL Configuration**:
   - **Site URL:** tu URL final (ej. `https://TU_USUARIO.github.io/cut-real-2/`)
   - **Redirect URLs:** agregá `http://localhost:5173/` y la URL final con barra al final.

## 4. Cargar los secretos de las funciones
```bash
cp supabase/functions/.env.example supabase/functions/.env
```
Editá `supabase/functions/.env`:

| Variable | Valor | Obligatoria |
|---|---|---|
| `GROQ_API_KEY` | Clave de https://console.groq.com/keys | Sí (chat y dictado) |
| `ALLOWED_ORIGINS` | Solo el *origen*, sin ruta: `https://TU_USUARIO.github.io,http://localhost:5173` | Sí en producción |
| `GEMINI_API_KEY` | Clave de https://aistudio.google.com/apikey | No |
| `SEARCH_PROVIDER` + `TAVILY_API_KEY` (o `BRAVE_API_KEY`) | `tavily` y la clave | No (activa búsqueda web) |
| `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_MODEL`, `TTS_VOICE` | Proveedor de voz OpenAI-compatible | No (ver `docs/VOICE.md`) |

Subilos: `npm run secrets:set`. (`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase solo; no los cargues.)

## 5. Desplegar las funciones
```bash
npm run fn:deploy
```
Despliega `chat`, `admin`, `api`, `transcribe` y `tts`. La `api` queda sin verificación de JWT de Supabase (configurado en `supabase/config.toml`) porque se autentica con claves propias `crk_…`.

> Si alguna función devuelve `401 Invalid JWT` desde el gateway aunque estés logueado, redesplegala con `npx supabase functions deploy NOMBRE --no-verify-jwt`: el código ya valida el token del usuario por su cuenta.

## 6. Crear al propietario (administrador principal)
En **SQL Editor** ejecutá, con TU correo de Google:
```sql
insert into cutreal_private.config (key, value) values ('initial_admin_email', 'tu-correo@gmail.com')
on conflict (key) do update set value = excluded.value;
```
La primera vez que inicies sesión con ese correo (verificado por Google) serás **propietario**. Solo puede existir un propietario y ese esquema no es accesible desde el navegador. Desde el panel, el propietario promueve o revoca administradores.

## 7. Probar en local
```bash
cp .env.example .env     # VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (paso 1)
npm install
npm run dev
```

## 8. Publicar el frontend en GitHub Pages
1. Subí el proyecto a un repositorio de GitHub (rama `main`). El `.gitignore` ya excluye `.env`.
2. **Settings → Pages → Source:** *GitHub Actions*.
3. **Settings → Secrets and variables → Actions → Variables → New repository variable:** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Hacé push. El workflow (`.github/workflows/deploy.yml`) corre tipos, tests, build y escáner de secretos, y publica.
5. Verificá que la URL publicada coincida con la de **Site URL / Redirect URLs** (paso 3.5) y con `ALLOWED_ORIGINS` (paso 4).

## 9. Cómo comprobar que todo anda
1. Abrí la app → **Continuar con Google** → entrás (la barra lateral muestra "Propietario").
2. Escribí un mensaje: debe aparecer la respuesta en streaming. Si falla, el error dice qué falta.
3. Abrí otra conversación mientras genera: ambas deben avanzar.
4. Adjuntá un `.txt` y preguntá por su contenido.
5. Micrófono → dictar → revisar el texto → enviar (requiere `GROQ_API_KEY`).
6. Perfil → **Panel de administración**: Proveedores debe mostrar Groq con "clave configurada".
7. Abrí la app desde otro dispositivo con la misma cuenta: el historial debe aparecer.

## Agregar otros proveedores y modelos
Panel → **Proveedores y modelos**. Cualquier API compatible con OpenAI (`/chat/completions` con streaming) sirve: URL base `https://…`, y el **nombre** de la variable secreta (p. ej. `MI_PROVEEDOR_API_KEY`); luego cargá esa variable con `supabase secrets set MI_PROVEEDOR_API_KEY=…`. Gemini viene sembrado y deshabilitado: cargá `GEMINI_API_KEY`, verificá el ID del modelo en AI Studio y habilitalo.
Un proveedor con una API distinta requiere un adaptador nuevo en `supabase/functions/_shared/providers.ts` (interfaz `ProviderAdapter`, ~25 líneas).

## Problemas frecuentes
| Síntoma | Causa probable |
|---|---|
| "Falta configurar Supabase" en el login | `.env` sin completar (o variables de Actions faltantes) |
| Google devuelve `redirect_uri_mismatch` | El URI del paso 3.2 no coincide exactamente |
| Vuelve al login tras Google | Falta la URL en **Redirect URLs** (paso 3.5) |
| "No se pudo cargar tu perfil" | Migraciones sin ejecutar |
| CORS al llamar funciones | `ALLOWED_ORIGINS` sin tu origen exacto |
| "proveedor sin clave configurada" | Falta `GROQ_API_KEY` en secretos o no corriste `secrets:set` |
| Panel de administración no abre | Tu correo no es el de `initial_admin_email`, o ya existía otro propietario |
