# Integración de Cut-real con Memory Task

**Estado del código:** el puente servidor-a-servidor está implementado. La conexión real queda activa después de configurar los secretos y desplegar las funciones de Memory Task y Cut-real.

## Qué hace

- La integración se habilita desde **Administración → Integraciones → Memory Task**.
- Solo un administrador autenticado puede generar la identidad, probar la conexión o enviar información.
- Cut-real firma una identidad ES256 de corta duración con el ID del usuario autenticado.
- El backend de Cut-real envía el contenido a la API de servicio de Memory Task.
- Las notas se guardan como registros de categoría `custom`, con título, contenido, fecha y usuario de origen.
- Las claves API y privadas se guardan como secretos del servidor; no se escriben en el frontend ni en el repositorio.

La conexión actual permite enviar notas desde el panel administrativo. **No sincroniza automáticamente todas las conversaciones ni adjunta archivos todavía.**

## 1. Activar el backend de Memory Task

El repositorio de Memory Task tiene la consola de cuenta de servicio, las migraciones y las funciones `service-console` y `service-api`. El frontend por sí solo no activa estas funciones.

En una terminal abierta dentro del repositorio `memory-task`:

```powershell
npx supabase login
npx supabase link --project-ref evrbaaeccuwaxclnpknk
npx supabase migration list --linked
npx supabase db push
npx supabase functions deploy service-console
npx supabase functions deploy service-api --no-verify-jwt
```

El ID de proyecto anterior es el que figura actualmente en `memory-task/supabase/config.toml`. Verificá que coincida con el proyecto que muestra tu panel de Supabase antes de ejecutar comandos.

La función `service-api` debe aceptar su propia autenticación `mt_live_...`; por eso tiene `verify_jwt = false` en `supabase/config.toml`. No desactives la verificación JWT de `service-console` ni de las funciones administrativas.

## 2. Crear la aplicación de servicio en Memory Task

1. Iniciá sesión en Memory Task con la cuenta propietaria.
2. Abrí **Cuenta de servicio** y creá una aplicación llamada `Cut-real`.
3. Copiá el ID UUID de esa aplicación.
4. En Cut-real, abrí **Administración → Integraciones → Memory Task** y generá un par de claves ES256.
5. Copiá la **clave pública JWK** y pegala en Memory Task, dentro de la configuración de identidad de la aplicación. No pegues allí la clave privada.
6. Creá una API key para esa aplicación con el permiso mínimo `records:write`. Copiala en el momento: Memory Task no vuelve a mostrarla.

## 3. Guardar secretos en el proyecto Supabase de Cut-real

El proyecto de Cut-real es independiente del de Memory Task. En el panel de Supabase de Cut-real, abrí **Edge Functions → Secrets** y agregá:

| Secreto | Valor |
|---|---|
| `MEMORY_TASK_API_URL` | `https://evrbaaeccuwaxclnpknk.supabase.co/functions/v1/service-api` (verificá el Project URL real de Memory Task) |
| `MEMORY_TASK_API_KEY` | La clave `mt_live_...` creada en Memory Task |
| `MEMORY_TASK_APP_ID` | El UUID de la aplicación Cut-real creada en Memory Task |
| `MEMORY_TASK_IDENTITY_PRIVATE_JWK` | El JSON completo de la clave privada generado en Cut-real |

También se puede usar la CLI desde la carpeta local de Cut-real:

```powershell
npx supabase secrets set --project-ref vdgfrrdseqimbelgzsek MEMORY_TASK_API_URL="https://evrbaaeccuwaxclnpknk.supabase.co/functions/v1/service-api" MEMORY_TASK_API_KEY="PEGAR_LOCALMENTE_LA_CLAVE_MT" MEMORY_TASK_APP_ID="UUID_DE_LA_APP" MEMORY_TASK_IDENTITY_PRIVATE_JWK='{"kty":"EC","crv":"P-256","x":"...","y":"...","d":"..."}'
npx supabase functions deploy admin --project-ref vdgfrrdseqimbelgzsek
```

Reemplazá los valores de ejemplo directamente en tu terminal o en el panel de secretos. **No pegues las claves en el chat, GitHub, archivos del frontend ni capturas de pantalla.**

## 4. Probar y enviar información

1. En Cut-real, entrá al panel de administración y habilitá Memory Task.
2. Tocá **Actualizar estado**. Los cuatro elementos deben figurar configurados.
3. Tocá **Probar conexión**. Se crea y elimina un registro temporal para comprobar autenticación y permiso de escritura.
4. Escribí un título y contenido y elegí **Enviar y guardar**.
5. En Memory Task, abrí el explorador de la aplicación Cut-real. El registro debe aparecer bajo el usuario externo cuyo ID es el UUID de tu cuenta de Cut-real.

## Permisos y límites

- La API key de Memory Task necesita `records:write`; la prueba usa escritura y eliminación.
- Cada registro admite hasta 256 KiB. El panel limita el texto a 20.000 caracteres.
- El identificador externo se firma en el backend de Cut-real; no se acepta un ID de usuario libre enviado por el navegador.
- Si `service-api` no está desplegada o las migraciones no se aplicaron, la prueba fallará aunque los secretos estén completos.
- La conexión es de escritura manual desde el panel administrativo. No hay sincronización automática de chats ni carga de archivos en esta primera versión.
