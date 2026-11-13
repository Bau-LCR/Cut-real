# API propia de Cut-real

Base: `https://TU_REFERENCE_ID.supabase.co/functions/v1/api/v1`

Las claves se crean en **Panel de administración → API keys** (nombre, permisos, límite por minuto, vencimiento opcional). La clave completa (`crk_…`, 47 caracteres, 256 bits aleatorios) se muestra **una sola vez**; en la base solo se guarda su hash SHA-256. Se pueden revocar en cualquier momento y cada una muestra su último uso y su actividad.

## Autenticación
```
Authorization: Bearer crk_XXXXXXXX…
```

## Permisos (scopes)
| Scope | Habilita |
|---|---|
| `models:read` | `GET /v1/models` |
| `chat:write` | `POST /v1/chat/completions` |
| `identity:read`, `conversations:read`, `conversations:write` | Reservados para integraciones (ver `MEMORY_TASK.md`); todavía sin endpoints |

## Endpoints
### `GET /v1/me`
Devuelve nombre, permisos y límite de la clave (sin scope requerido).

### `GET /v1/models`  — scope `models:read`
```json
{ "object": "list", "data": [ { "id": "uuid", "name": "groq/llama-3.3-70b-versatile", "display_name": "Llama 3.3 70B", "supports_vision": false, "context_window": 131072 } ] }
```

### `POST /v1/chat/completions`  — scope `chat:write`
Compatible con el formato de OpenAI. Sin estado: no guarda conversaciones.
```bash
curl https://TU_REF.supabase.co/functions/v1/api/v1/chat/completions \
  -H "Authorization: Bearer crk_…" -H "Content-Type: application/json" \
  -d '{ "model": "groq/llama-3.3-70b-versatile",
        "messages": [{"role":"user","content":"Hola"}],
        "stream": false, "max_tokens": 500, "temperature": 0.7 }'
```
- `model`: `proveedor/modelo` o el `id` (uuid) del listado.
- `messages`: 1–100 mensajes; `role` ∈ `system|user|assistant`; `content` es texto (máx. 50.000 caracteres).
- `stream: true` devuelve `text/event-stream` con chunks `chat.completion.chunk` y `data: [DONE]`.

## Errores
Formato: `{ "error": "codigo", "message": "texto en español" }`

| HTTP | `error` | Significado |
|---|---|---|
| 401 | `invalid_api_key` | Ausente, mal formada, revocada o vencida |
| 403 | `insufficient_scope` | La clave no tiene el permiso necesario |
| 400 | `bad_request` | Cuerpo inválido |
| 404 | `model_not_found` | Modelo inexistente o deshabilitado |
| 429 | `rate_limited` | Superó el límite por minuto de la clave (o del proveedor) |
| 502/503 | `provider_*` | El proveedor falló o no tiene clave configurada |

## Seguridad y límites
- Límite por minuto **por clave** (configurable) y límites globales por proveedor (minuto/día) desde el panel. Respetan las cuotas reales de cada proveedor: no hay "uso ilimitado".
- Cada solicitud registra `api_key_id`, estado, latencia y tokens (visible en la actividad de la clave).
- Los errores no filtran detalles internos ni claves de proveedores.
