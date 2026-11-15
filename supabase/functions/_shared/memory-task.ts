import { HttpError } from './cors.ts'

function b64urlBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
function b64urlJson(value: unknown): string {
  return b64urlBytes(new TextEncoder().encode(JSON.stringify(value)))
}

export function memoryTaskConfig() {
  const endpoint = Deno.env.get('MEMORY_TASK_API_URL') ?? ''
  const apiKey = Deno.env.get('MEMORY_TASK_API_KEY') ?? ''
  const appId = Deno.env.get('MEMORY_TASK_APP_ID') ?? ''
  const privateJwkRaw = Deno.env.get('MEMORY_TASK_IDENTITY_PRIVATE_JWK') ?? ''
  return { endpoint, apiKey, appId, privateJwkRaw, configured: !!(endpoint && apiKey && appId && privateJwkRaw) }
}

export async function callMemoryTask(userId: string, action: string, data: Record<string, unknown>) {
  const cfg = memoryTaskConfig()
  if (!cfg.configured) throw new HttpError(409, 'integration_not_configured', 'Falta configurar la URL, la API key, el ID de aplicación o la clave privada de identidad de Memory Task en los secretos de Supabase.')
  let endpoint: URL
  try { endpoint = new URL(cfg.endpoint) } catch { throw new HttpError(500, 'integration_config_error', 'La URL de Memory Task no es válida.') }
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.supabase.co') || !endpoint.pathname.endsWith('/functions/v1/service-api')) {
    throw new HttpError(500, 'integration_config_error', 'La URL debe ser un endpoint HTTPS de Supabase que termine en /functions/v1/service-api.')
  }
  let jwk: JsonWebKey
  try { jwk = JSON.parse(cfg.privateJwkRaw) as JsonWebKey } catch { throw new HttpError(500, 'integration_not_configured', 'La clave privada de identidad de Memory Task no tiene formato JSON válido.') }
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) {
    throw new HttpError(500, 'integration_not_configured', 'La clave privada debe ser un JWK ECDSA P-256 completo.')
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const now = Math.floor(Date.now() / 1000)
  const unsigned = b64urlJson({ alg: 'ES256', typ: 'JWT' }) + '.' + b64urlJson({ iss: cfg.appId, aud: cfg.appId, sub: userId, iat: now, exp: now + 120 })
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned)))
  if (signature.length !== 64) throw new HttpError(500, 'integration_crypto_error', 'El motor criptográfico devolvió una firma ES256 inesperada.')
  const identity = unsigned + '.' + b64urlBytes(signature)
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json', 'X-Memory-Task-Identity': identity },
      body: JSON.stringify({ action, ...data }),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new HttpError(502, 'memory_task_unreachable', 'No se pudo contactar con Memory Task. Comprobá que service-api esté desplegada y que la URL sea correcta.')
  }
  const raw = await response.text()
  let result: any = {}
  try { result = raw ? JSON.parse(raw) : {} } catch { /* respuesta no JSON */ }
  if (!response.ok) {
    const message = typeof result.error === 'string' ? result.error : 'Memory Task respondió con HTTP ' + response.status + '.'
    throw new HttpError(response.status >= 500 ? 502 : response.status, 'memory_task_rejected', message.slice(0, 300))
  }
  return result
}
