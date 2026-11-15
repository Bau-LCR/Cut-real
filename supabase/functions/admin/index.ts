// Cut-real 2 · /functions/v1/admin  — TODAS las acciones verifican el rol en la base, no en el cliente.
import { corsHeaders, errorResponse, HttpError, json } from '../_shared/cors.ts'
import { audit, authenticate, clientIp, requireAdmin, type AuthContext } from '../_shared/supabase.ts'
import { generateApiKey, sanitizeScopes } from '../_shared/apikeys.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE = 20
type P = Record<string, any>
type Handler = (ctx: AuthContext, p: P, req: Request) => Promise<unknown>

const uuid = (v: unknown, name: string) => { if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, 'bad_request', `${name} inválido.`); return v }
const text = (v: unknown, name: string, min: number, max: number) => {
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) throw new HttpError(400, 'bad_request', `${name} debe tener entre ${min} y ${max} caracteres.`)
  return v.trim()
}
const optInt = (v: unknown, name: string, min = 1, max = 10_000_000) => {
  if (v == null || v === '') return null
  const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'bad_request', `${name} inválido.`)
  return n
}
const esc = (s: string) => s.replace(/[%_\\,()]/g, (c) => `\\${c}`)

function b64urlBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
function b64urlJson(value: unknown): string {
  return b64urlBytes(new TextEncoder().encode(JSON.stringify(value)))
}
function memoryTaskConfig() {
  const endpoint = Deno.env.get('MEMORY_TASK_API_URL') ?? ''
  const apiKey = Deno.env.get('MEMORY_TASK_API_KEY') ?? ''
  const appId = Deno.env.get('MEMORY_TASK_APP_ID') ?? ''
  const privateJwkRaw = Deno.env.get('MEMORY_TASK_IDENTITY_PRIVATE_JWK') ?? ''
  return { endpoint, apiKey, appId, privateJwkRaw, configured: !!(endpoint && apiKey && appId && privateJwkRaw) }
}
async function memoryTaskIdentity(appId: string, userId: string, privateJwkRaw: string): Promise<string> {
  let jwk: JsonWebKey
  try { jwk = JSON.parse(privateJwkRaw) as JsonWebKey } catch { throw new HttpError(500, 'integration_not_configured', 'La clave privada de identidad de Memory Task no tiene formato JSON válido.') }
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) {
    throw new HttpError(500, 'integration_not_configured', 'La clave privada debe ser un JWK ECDSA P-256 completo.')
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const now = Math.floor(Date.now() / 1000)
  const unsigned = b64urlJson({ alg: 'ES256', typ: 'JWT' }) + '.' + b64urlJson({
    iss: appId, aud: appId, sub: userId, iat: now, exp: now + 120,
  })
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned),
  ))
  if (signature.length !== 64) throw new HttpError(500, 'integration_crypto_error', 'El motor criptográfico devolvió una firma ES256 inesperada.')
  return unsigned + '.' + b64urlBytes(signature)
}
async function callMemoryTask(ctx: AuthContext, action: string, data: Record<string, unknown>) {
  const cfg = memoryTaskConfig()
  if (!cfg.configured) throw new HttpError(409, 'integration_not_configured', 'Falta configurar la URL, la API key, el ID de aplicación o la clave privada de identidad de Memory Task en los secretos de Supabase.')
  let endpoint: URL
  try { endpoint = new URL(cfg.endpoint) } catch { throw new HttpError(500, 'integration_config_error', 'La URL de Memory Task no es válida.') }
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.supabase.co') || !endpoint.pathname.endsWith('/functions/v1/service-api')) {
    throw new HttpError(500, 'integration_config_error', 'La URL debe ser un endpoint HTTPS de Supabase que termine en /functions/v1/service-api.')
  }
  const identity = await memoryTaskIdentity(cfg.appId, ctx.userId, cfg.privateJwkRaw)
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + cfg.apiKey,
        'Content-Type': 'application/json',
        'X-Memory-Task-Identity': identity,
      },
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

async function targetUser(ctx: AuthContext, userId: string) {
  const { data } = await ctx.db.from('cr_user_roles').select('user_id, role, suspended, access_status, suspended_reason').eq('user_id', userId).maybeSingle()
  if (!data) throw new HttpError(404, 'not_found', 'Usuario no encontrado.')
  return data
}

const handlers: Record<string, Handler> = {
  async stats(ctx, p) {
    const { data, error } = await ctx.db.rpc('cr_admin_stats', { p_days: Math.min(Math.max(Number(p.days) || 14, 1), 90) })
    if (error) throw new HttpError(500, 'internal', 'No se pudieron calcular las estadísticas.')
    return data
  },

  // ---- Usuarios ----------------------------------------------------------------
  async 'users.list'(ctx, p) {
    const page = Math.max(0, Number(p.page) || 0)
    let q = ctx.db.from('cr_profiles').select('user_id, email, display_name, created_at, last_seen_at', { count: 'exact' })
    if (p.q) { const s = esc(String(p.q).slice(0, 80)); q = q.or(`email.ilike.%${s}%,display_name.ilike.%${s}%`) }
    const { data, count } = await q.order('last_seen_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    const ids = (data ?? []).map((u: any) => u.user_id)
    const { data: roles } = ids.length ? await ctx.db.from('cr_user_roles').select('user_id, role, suspended, access_status, suspended_reason').in('user_id', ids) : { data: [] }
    const rmap = new Map((roles ?? []).map((r: any) => [r.user_id, r]))
    return { total: count ?? 0, pageSize: PAGE, users: (data ?? []).map((u: any) => ({ ...u, role: rmap.get(u.user_id)?.role ?? 'user', suspended: !!rmap.get(u.user_id)?.suspended, access_status: rmap.get(u.user_id)?.role === 'owner' ? 'approved' : (rmap.get(u.user_id)?.access_status ?? 'pending'), suspended_reason: rmap.get(u.user_id)?.suspended_reason ?? null })) }
  },
  async 'users.get'(ctx, p) {
    const id = uuid(p.userId, 'userId')
    const [{ data: profile }, role, convs, msgs] = await Promise.all([
      ctx.db.from('cr_profiles').select('user_id, email, display_name, created_at, last_seen_at').eq('user_id', id).maybeSingle(),
      targetUser(ctx, id),
      ctx.db.from('cr_conversations').select('id', { count: 'exact', head: true }).eq('user_id', id),
      ctx.db.from('cr_messages').select('id', { count: 'exact', head: true }).eq('user_id', id),
    ])
    return { profile, role: role.role, suspended: role.suspended, suspended_reason: (role as any).suspended_reason ?? null, access_status: (role as any).access_status ?? 'pending', conversations: convs.count ?? 0, messages: msgs.count ?? 0 }
  },
  async 'users.setAccess'(ctx, p, req) {
    if (ctx.role !== 'owner') throw new HttpError(403, 'forbidden', 'Solo el propietario puede aprobar solicitudes.')
    const id = uuid(p.userId, 'userId')
    if (!['approved', 'rejected', 'pending'].includes(p.status)) throw new HttpError(400, 'bad_request', 'Estado inválido.')
    const t = await targetUser(ctx, id)
    if (t.role === 'owner') throw new HttpError(403, 'forbidden', 'El propietario siempre conserva acceso.')
    const { error } = await ctx.db.from('cr_user_roles').update({ access_status: p.status, access_updated_at: new Date().toISOString(), access_updated_by: ctx.userId, updated_at: new Date().toISOString() }).eq('user_id', id)
    if (error) throw new HttpError(500, 'internal', 'No se pudo actualizar el acceso.')
    await audit(ctx.db, { actorId: ctx.userId, action: 'user.access_' + p.status, targetType: 'user', targetId: id, reason: typeof p.reason === 'string' ? p.reason.slice(0, 200) : undefined, ip: clientIp(req) })
    return { ok: true }
  },
  async 'users.setRole'(ctx, p, req) {
    if (ctx.role !== 'owner') throw new HttpError(403, 'forbidden', 'Solo el propietario puede promover o revocar administradores.')
    const id = uuid(p.userId, 'userId')
    if (!['admin', 'user'].includes(p.role)) throw new HttpError(400, 'bad_request', 'Rol inválido.')
    if (id === ctx.userId) throw new HttpError(400, 'bad_request', 'No podés cambiar tu propio rol.')
    const t = await targetUser(ctx, id)
    if (t.role === 'owner') throw new HttpError(403, 'forbidden', 'El rol del propietario no se puede modificar.')
    await ctx.db.from('cr_user_roles').update({ role: p.role, updated_at: new Date().toISOString() }).eq('user_id', id)
    await audit(ctx.db, { actorId: ctx.userId, action: p.role === 'admin' ? 'admin.promote' : 'admin.revoke', targetType: 'user', targetId: id, ip: clientIp(req) })
    return { ok: true }
  },
  async 'users.suspend'(ctx, p, req) {
    const id = uuid(p.userId, 'userId'); const reason = text(p.reason, 'El motivo', 3, 200)
    if (id === ctx.userId) throw new HttpError(400, 'bad_request', 'No podés suspender tu propia cuenta.')
    const t = await targetUser(ctx, id)
    if (t.role === 'owner' || (t.role === 'admin' && ctx.role !== 'owner')) throw new HttpError(403, 'forbidden', 'No tenés permisos sobre esa cuenta.')
    await ctx.db.from('cr_user_roles').update({ suspended: true, suspended_reason: reason, suspended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', id)
    await audit(ctx.db, { actorId: ctx.userId, action: 'user.suspend', targetType: 'user', targetId: id, reason, ip: clientIp(req) })
    return { ok: true }
  },
  async 'users.restore'(ctx, p, req) {
    const id = uuid(p.userId, 'userId'); await targetUser(ctx, id)
    await ctx.db.from('cr_user_roles').update({ suspended: false, suspended_reason: null, suspended_at: null, updated_at: new Date().toISOString() }).eq('user_id', id)
    await audit(ctx.db, { actorId: ctx.userId, action: 'user.restore', targetType: 'user', targetId: id, ip: clientIp(req) })
    return { ok: true }
  },

  // ---- Conversaciones de usuarios: acceso limitado, con motivo obligatorio y auditado ------
  async 'conversations.list'(ctx, p, req) {
    const id = uuid(p.userId, 'userId'); const reason = text(p.reason, 'El motivo', 5, 300)
    const { data } = await ctx.db.from('cr_conversations').select('id, title, created_at, last_message_at').eq('user_id', id).order('last_message_at', { ascending: false }).limit(50)
    await audit(ctx.db, { actorId: ctx.userId, action: 'admin.view_conversation_list', targetType: 'user', targetId: id, reason, ip: clientIp(req) })
    return { conversations: data ?? [] }
  },
  async 'conversations.messages'(ctx, p, req) {
    const id = uuid(p.conversationId, 'conversationId'); const reason = text(p.reason, 'El motivo', 5, 300)
    const { data: conv } = await ctx.db.from('cr_conversations').select('id, user_id, title').eq('id', id).maybeSingle()
    if (!conv) throw new HttpError(404, 'not_found', 'Conversación no encontrada.')
    const { data } = await ctx.db.from('cr_messages').select('id, role, content, status, created_at').eq('conversation_id', id).order('seq', { ascending: true }).limit(200)
    await audit(ctx.db, { actorId: ctx.userId, action: 'admin.view_conversation', targetType: 'conversation', targetId: id, reason, metadata: { owner: conv.user_id }, ip: clientIp(req) })
    return { title: conv.title, messages: data ?? [] }
  },

  // ---- Consumo de proveedores (sin exponer secretos) -----------------------------------
  async 'providers.usage'(ctx) {
    const { data: groqProvider } = await ctx.db.from('cr_providers').select('id,rpm_limit,daily_request_limit').eq('slug','groq').maybeSingle()
    const now = Date.now()
    const since24 = new Date(now - 86400_000).toISOString()
    const since30 = new Date(now - 30 * 86400_000).toISOString()
    let groq = { requests_24h: 0, tokens_24h: 0, tokens_30d: 0, app_rpm_limit: groqProvider?.rpm_limit ?? null, app_daily_limit: groqProvider?.daily_request_limit ?? null }
    if (groqProvider?.id) {
      const [{ data: recent }, { data: month }] = await Promise.all([
        ctx.db.from('cr_usage_events').select('prompt_tokens,completion_tokens').eq('provider_id', groqProvider.id).in('kind',['chat','api']).gte('created_at',since24),
        ctx.db.from('cr_usage_events').select('prompt_tokens,completion_tokens').eq('provider_id', groqProvider.id).in('kind',['chat','api']).gte('created_at',since30),
      ])
      const sum = (rows: any[] | null) => (rows ?? []).reduce((n, r) => n + Number(r.prompt_tokens ?? 0) + Number(r.completion_tokens ?? 0), 0)
      groq = { ...groq, requests_24h: recent?.length ?? 0, tokens_24h: sum(recent), tokens_30d: sum(month) }
    }
    const tavilyKey = Deno.env.get('TAVILY_API_KEY')
    let tavily: any = { configured: !!tavilyKey }
    if (tavilyKey) {
      try {
        const response = await fetch('https://api.tavily.com/usage', { headers: { Accept: 'application/json', Authorization: `Bearer ${tavilyKey}` }, signal: AbortSignal.timeout(10000) })
        if (!response.ok) throw new Error(`Tavily HTTP ${response.status}`)
        tavily = { configured: true, ...(await response.json()) }
      } catch { tavily = { configured: true, error: 'No se pudo consultar el uso de Tavily.' } }
    }
    return { groq, tavily, checked_at: new Date().toISOString() }
  },

  // ---- Proveedores y modelos ----------------------------------------------------------
  async 'providers.list'(ctx) {
    const [{ data: providers }, { data: models }] = await Promise.all([
      ctx.db.from('cr_providers').select('*').order('created_at'),
      ctx.db.from('cr_models').select('*').order('sort_order'),
    ])
    return {
      providers: (providers ?? []).map((p: any) => ({ ...p, key_configured: !!Deno.env.get(p.api_key_env), models: (models ?? []).filter((m: any) => m.provider_id === p.id) })), // nunca se devuelve el valor de la clave
    }
  },
  async 'providers.save'(ctx, p, req) {
    const row = {
      slug: text(p.slug, 'slug', 2, 40).toLowerCase(), name: text(p.name, 'nombre', 2, 80),
      base_url: text(p.base_url, 'base_url', 8, 300), api_key_env: text(p.api_key_env, 'api_key_env', 3, 60),
      enabled: !!p.enabled, rpm_limit: optInt(p.rpm_limit, 'rpm_limit'), daily_request_limit: optInt(p.daily_request_limit, 'daily_request_limit'),
    }
    if (!/^https:\/\//.test(row.base_url)) throw new HttpError(400, 'bad_request', 'La URL base debe empezar con https://')
    if (!/^[A-Z][A-Z0-9_]{2,60}$/.test(row.api_key_env)) throw new HttpError(400, 'bad_request', 'api_key_env es el NOMBRE de la variable (p. ej. GROQ_API_KEY), no la clave.')
    const q = p.id ? ctx.db.from('cr_providers').update(row).eq('id', uuid(p.id, 'id')) : ctx.db.from('cr_providers').insert(row)
    const { error } = await q
    if (error) throw new HttpError(400, 'bad_request', 'No se pudo guardar el proveedor (¿slug repetido?).')
    await audit(ctx.db, { actorId: ctx.userId, action: p.id ? 'provider.update' : 'provider.create', targetType: 'provider', targetId: p.id ?? row.slug, ip: clientIp(req) })
    return { ok: true }
  },
  async 'models.save'(ctx, p, req) {
    const row = {
      provider_id: uuid(p.provider_id, 'provider_id'), model_key: text(p.model_key, 'model_key', 1, 120), display_name: text(p.display_name, 'nombre', 1, 80),
      enabled: !!p.enabled, supports_vision: !!p.supports_vision, context_window: optInt(p.context_window, 'context_window'),
      max_output_tokens: optInt(p.max_output_tokens, 'max_output_tokens', 1, 200_000) ?? 4096, user_rpm_limit: optInt(p.user_rpm_limit, 'user_rpm_limit', 1, 1000) ?? 20,
      sort_order: optInt(p.sort_order, 'sort_order', 0, 10000) ?? 100,
    }
    const q = p.id ? ctx.db.from('cr_models').update(row).eq('id', uuid(p.id, 'id')) : ctx.db.from('cr_models').insert(row)
    const { error } = await q
    if (error) throw new HttpError(400, 'bad_request', 'No se pudo guardar el modelo (¿ya existe para ese proveedor?).')
    await audit(ctx.db, { actorId: ctx.userId, action: p.id ? 'model.update' : 'model.create', targetType: 'model', targetId: p.id ?? row.model_key, ip: clientIp(req) })
    return { ok: true }
  },

  // ---- API keys propias --------------------------------------------------------------
  async 'keys.list'(ctx) {
    const { data } = await ctx.db.from('cr_api_keys').select('id, name, key_prefix, scopes, rate_limit_per_minute, created_at, last_used_at, expires_at, revoked_at').order('created_at', { ascending: false })
    return { keys: data ?? [] } // key_hash nunca sale del servidor
  },
  async 'keys.create'(ctx, p, req) {
    const name = text(p.name, 'El nombre', 1, 80)
    const scopes = sanitizeScopes(p.scopes)
    if (!scopes.length) throw new HttpError(400, 'bad_request', 'Elegí al menos un permiso.')
    const days = optInt(p.expires_in_days, 'expires_in_days', 1, 3650)
    const { secret, prefix, hash } = await generateApiKey()
    const { data, error } = await ctx.db.from('cr_api_keys').insert({
      name, key_prefix: prefix, key_hash: hash, scopes, rate_limit_per_minute: optInt(p.rate_limit_per_minute, 'rate_limit_per_minute', 1, 10000) ?? 30,
      created_by: ctx.userId, expires_at: days ? new Date(Date.now() + days * 86400_000).toISOString() : null,
    }).select('id').single()
    if (error) throw new HttpError(500, 'internal', 'No se pudo crear la clave.')
    await audit(ctx.db, { actorId: ctx.userId, action: 'apikey.create', targetType: 'api_key', targetId: data.id, metadata: { name, scopes }, ip: clientIp(req) })
    return { id: data.id, secret, notice: 'Guardá esta clave ahora: no se vuelve a mostrar.' }
  },
  async 'keys.revoke'(ctx, p, req) {
    const id = uuid(p.id, 'id')
    await ctx.db.from('cr_api_keys').update({ revoked_at: new Date().toISOString(), revoked_by: ctx.userId }).eq('id', id).is('revoked_at', null)
    await audit(ctx.db, { actorId: ctx.userId, action: 'apikey.revoke', targetType: 'api_key', targetId: id, ip: clientIp(req) })
    return { ok: true }
  },
  async 'keys.usage'(ctx, p) {
    const id = uuid(p.id, 'id')
    const since = new Date(Date.now() - 86400_000).toISOString()
    const [{ data: events }, { count }] = await Promise.all([
      ctx.db.from('cr_usage_events').select('created_at, status, error_code, latency_ms, prompt_tokens, completion_tokens').eq('api_key_id', id).order('created_at', { ascending: false }).limit(50),
      ctx.db.from('cr_usage_events').select('id', { count: 'exact', head: true }).eq('api_key_id', id).gte('created_at', since),
    ])
    return { requests_24h: count ?? 0, events: events ?? [] }
  },


  async 'integrations.memory_task_status'(ctx) {
    const cfg = memoryTaskConfig()
    const { data: integration } = await ctx.db.from('cr_integrations').select('id,status')
      .eq('slug', 'memory-task').maybeSingle()
    const { data: grant } = integration?.id ? await ctx.db.from('cr_integration_grants').select('scopes')
      .eq('integration_id', integration.id).eq('user_id', ctx.userId).is('revoked_at', null).maybeSingle() : { data: null }
    return {
      configured: cfg.configured,
      endpointConfigured: !!cfg.endpoint,
      apiKeyConfigured: !!cfg.apiKey,
      appIdConfigured: !!cfg.appId,
      identityKeyConfigured: !!cfg.privateJwkRaw,
      enabled: integration?.status === 'enabled',
      authorized: !!grant?.scopes?.includes('conversations:write'),
    }
  },
  async 'integrations.memory_task_generate_identity'(ctx, _p, req) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
    const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    await audit(ctx.db, { actorId: ctx.userId, action: 'integration.memory_task_identity_generated', targetType: 'integration', targetId: 'memory-task', ip: clientIp(req) })
    return {
      publicJwk: { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y, ext: true },
      privateJwk,
      warning: 'Guardá la clave privada en Supabase Edge Function Secrets. No la publiques ni la compartas.',
    }
  },
  async 'integrations.memory_task_test'(ctx, _p, req) {
    const { data: integration } = await ctx.db.from('cr_integrations').select('status').eq('slug', 'memory-task').maybeSingle()
    if (integration?.status !== 'enabled') throw new HttpError(409, 'integration_disabled', 'Primero habilitá Memory Task en Integraciones.')
    const key = 'cutreal-connection-test-' + crypto.randomUUID()
    await callMemoryTask(ctx, 'put', { key, category: 'custom', data: { source: 'Cut-real', type: 'connection_test', tested_at: new Date().toISOString() } })
    await callMemoryTask(ctx, 'delete', { key })
    await audit(ctx.db, { actorId: ctx.userId, action: 'integration.memory_task_test', targetType: 'integration', targetId: 'memory-task', ip: clientIp(req) })
    return { ok: true, message: 'Conexión verificada. El registro de prueba fue eliminado.' }
  },
  async 'integrations.memory_task_send'(ctx, p, req) {
    const { data: integration } = await ctx.db.from('cr_integrations').select('id,status').eq('slug', 'memory-task').maybeSingle()
    if (integration?.status !== 'enabled') throw new HttpError(409, 'integration_disabled', 'Primero habilitá Memory Task en Integraciones.')
    const { data: grant } = await ctx.db.from('cr_integration_grants').select('scopes')
      .eq('integration_id', integration.id).eq('user_id', ctx.userId).is('revoked_at', null).maybeSingle()
    if (!grant?.scopes?.includes('conversations:write')) {
      throw new HttpError(403, 'integration_not_authorized', 'Primero autorizá Memory Task desde Configuración → Integraciones autorizadas y concedé conversations:write.')
    }
    const title = text(p.title, 'El título', 1, 120)
    const content = text(p.content, 'El contenido', 1, 20000)
    const key = 'cutreal-admin-note-' + crypto.randomUUID()
    const result = await callMemoryTask(ctx, 'put', {
      key, category: 'custom',
      data: {
        title, content, source: 'Cut-real', type: 'admin_note',
        created_at: new Date().toISOString(), created_by: ctx.userId,
      },
    })
    await audit(ctx.db, { actorId: ctx.userId, action: 'integration.memory_task_record_sent', targetType: 'integration', targetId: 'memory-task', metadata: { record_key: key, title, bytes: new TextEncoder().encode(content).byteLength }, ip: clientIp(req) })
    return { ok: true, key, record: result.record ?? null }
  },

  // ---- Integraciones y auditoría --------------------------------------------------------
  async 'integrations.list'(ctx) {
    const { data } = await ctx.db.from('cr_integrations').select('*').order('created_at')
    const { count } = await ctx.db.from('cr_integration_grants').select('id', { count: 'exact', head: true }).is('revoked_at', null)
    return { integrations: data ?? [], active_grants: count ?? 0 }
  },
  async 'integrations.save'(ctx, p, req) {
    const id = uuid(p.id, 'id')
    const status = p.status === 'enabled' ? 'enabled' : 'disabled'
    await ctx.db.from('cr_integrations').update({ status, allowed_scopes: sanitizeScopes(p.allowed_scopes) }).eq('id', id)
    await audit(ctx.db, { actorId: ctx.userId, action: 'integration.update', targetType: 'integration', targetId: id, metadata: { status }, ip: clientIp(req) })
    return { ok: true }
  },
  async 'audit.list'(ctx, p) {
    const page = Math.max(0, Number(p.page) || 0)
    const { data, count } = await ctx.db.from('cr_audit_logs').select('id, actor_id, actor_kind, action, target_type, target_id, reason, created_at', { count: 'exact' })
      .order('id', { ascending: false }).range(page * 30, page * 30 + 29)
    return { total: count ?? 0, logs: data ?? [] }
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Método no permitido.')
    const ctx = await authenticate(req)
    requireAdmin(ctx)
    const body = await req.json().catch(() => null)
    const handler = body && typeof body.action === 'string' ? handlers[body.action] : undefined
    if (!handler) throw new HttpError(400, 'unknown_action', 'Acción desconocida.')
    return json(req, await handler(ctx, body, req))
  } catch (e) {
    return errorResponse(req, e)
  }
})
