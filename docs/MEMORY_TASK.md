# Integración futura con Memory Task

**Estado:** preparada, no conectada. Cut-real 2 **no accede** a Memory Task, no modifica su proyecto y no asume nada de su estructura.

## Qué ya existe en Cut-real 2
- **Aislamiento:** todas las tablas y funciones llevan prefijo `cr_` y tienen RLS propia. Nada de Memory Task se toca, y nada de Cut-real es legible desde las tablas de Memory Task.
- **Identidad compartida (opcional):** si ambas apps usan el *mismo* proyecto de Supabase y el mismo cliente de Google OAuth, comparten `auth.users`: la misma persona tiene el mismo `user_id` en ambas. Cut-real no crea triggers sobre `auth.users` (el perfil se crea al primer acceso con `cr_ensure_profile`), así que no interfiere con la otra app.
- **Catálogo de integraciones:** `cr_integrations` (con `memory-task` registrada y **deshabilitada**, permisos máximos permitidos y configuración sin secretos).
- **Autorizaciones por usuario:** `cr_integration_grants` (usuario, integración, scopes, fechas). Cada usuario ve y **revoca** las suyas en *Configuración → Integraciones autorizadas*. El administrador habilita o deshabilita la integración y acota sus scopes en *Panel → Integraciones*. Todo queda auditado.
- **Acceso app-a-app:** claves `crk_…` con scopes (`models:read`, `chat:write`, `identity:read`, `conversations:read`, `conversations:write`), límites y revocación (`docs/API.md`).

## Qué NO existe todavía
Los endpoints que intercambian datos de usuario (`identity:read`, `conversations:*`) **no están implementados**: sus scopes están reservados. Se definen cuando conozcamos qué datos necesita compartir cada lado.

## Pasos cuando quieras conectarla
1. Decidí: ¿mismo proyecto de Supabase o separados?
   - **Mismo proyecto:** agregá la URL de Memory Task en *Authentication → URL Configuration → Redirect URLs* y usá el mismo cliente de Google. Las políticas RLS de cada app deben seguir filtrando por `auth.uid()` y por sus propias tablas; no concedas `grant` cruzados.
   - **Proyectos separados:** la identidad no se comparte; la conexión es solo por API con claves y autorización del usuario.
2. Pasame (a mí o a quien continúe): qué datos de Memory Task querés leer/escribir desde Cut-real y viceversa, y sus nombres reales de tablas/API.
3. Se agregan los endpoints en `supabase/functions/api/` verificando **dos** cosas: scope de la clave **y** una autorización activa del usuario en `cr_integration_grants`.
4. Creá una clave en el panel para Memory Task con solo los scopes necesarios y habilitá la integración.
5. Probá revocando una autorización desde Configuración: el acceso debe cortarse.
