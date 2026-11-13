# Seguridad: qué protege qué

| Riesgo | Control |
|---|---|
| Claves de proveedores en el navegador | Solo existen como secretos de las Edge Functions. La base guarda únicamente el **nombre** de la variable (`api_key_env`). `npm run check:secrets` verifica `src/` y `dist/` |
| Un usuario lee datos de otro | RLS en todas las tablas por `auth.uid()`; storage en carpeta `<uid>/`. Probado con tests SQL y de integración |
| Auto-promoverse a admin | Los roles viven en `cr_user_roles` sin permisos de escritura para el navegador; solo `service_role` escribe. Cada acción de `admin` relee el rol desde la base |
| Escribir mensajes falsos | `cr_messages` es de solo lectura para el navegador; solo las funciones insertan, validando dueño, tamaño y límites |
| Abuso / costos | Rate limit atómico en base: por usuario, por usuario+modelo, por proveedor (minuto y día), por API key, y límites de voz |
| Acceso administrativo a conversaciones | Solo admin, **motivo obligatorio**, registrado en `cr_audit_logs` con quién/qué/cuándo. Se avisa a los usuarios (login, primer uso y Configuración) |
| API keys | 256 bits aleatorios, solo hash SHA-256 en base, mostradas una vez, revocables, con scopes, vencimiento y límite |
| Propietario inicial | Correo en `cutreal_private.config` (esquema no expuesto), correo verificado, un único propietario posible |
| Errores que filtran información | Respuestas con código estable y mensaje seguro; el detalle solo va a los logs del servidor |
| XSS por contenido de la IA | Markdown sin HTML crudo; enlaces con `rel="noopener noreferrer"` |
| Cuentas suspendidas | Chequeo en cada función y en las políticas RLS |

Lo que **no** cubre este proyecto por sí solo: configuración correcta de tu proyecto de Supabase (no compartas la `service_role`), revisión legal de tus políticas de privacidad, y los términos de uso de cada proveedor de IA.
