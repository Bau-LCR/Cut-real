import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const encoder = new TextEncoder()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEMORY_TASK_ENDPOINT = 'https://evrbaaeccuwaxclnpknk.supabase.co/functions/v1/service-api'

function decodeBearer(req: Request): string {
  return (req.headers.get('authorization') ?? '').replace(/^Bearer\\s+/i, '').trim()
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '')
}
async function encryptionKey(serviceRoleKey: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', encoder.encode('cut-real:memory-task-credentials:v1:' + serviceRoleKey))
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt'])
}
async function encrypt(value: string, serviceRoleKey: string) {
  const key = await encryptionKey(serviceRoleKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value))
  return { ciphertext: b64url(new Uint8Array(ciphertext)), iv: b64url(iv) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!serviceRoleKey || !supabaseUrl) return json({ error: 'Configuración del servidor incompleta.' }, 500)

    const token = decodeBearer(req)
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json({ error: 'Código de vinculación inválido o vencido.' }, 401)

    const body = await req.json().catch(() => null)
    const appId = typeof body?.appId === 'string' ? body.appId : ''
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey : ''
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
    if (!UUID.test(appId) || !/^mt_live_[A-Za-z0-9_-]{40,}$/.test(apiKey) || endpoint !== MEMORY_TASK_ENDPOINT) {
      return json({ error: 'Los datos de Memory Task no son válidos.' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const tokenHash = await sha256(token)
    const { data: pending, error: lookupError } = await admin.from('cr_memory_task_connections')
      .select('id,status,expires_at')
      .eq('token_hash', tokenHash).eq('status', 'pending')
      .gt('expires_at', new Date().toISOString()).maybeSingle()
    if (lookupError) throw lookupError
    if (!pending) return json({ error: 'El código ya fue utilizado o venció. Generá uno nuevo desde Cut-real.' }, 409)

    const encrypted = await encrypt(apiKey, serviceRoleKey)
    const { data: updated, error: updateError } = await admin.from('cr_memory_task_connections')
      .update({
        api_key_ciphertext: encrypted.ciphertext,
        api_key_iv: encrypted.iv,
        endpoint,
        app_id: appId,
        status: 'connected',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pending.id).eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .select('id').maybeSingle()
    if (updateError) throw updateError
    if (!updated) return json({ error: 'El código ya fue utilizado o venció. Generá uno nuevo desde Cut-real.' }, 409)

    return json({ success: true, message: 'Credenciales recibidas y guardadas de forma segura en Cut-real.' })
  } catch (error) {
    console.error('memory-task-pairing:', error)
    return json({ error: 'No se pudo completar la vinculación segura.' }, 500)
  }
})
