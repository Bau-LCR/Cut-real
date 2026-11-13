import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './cors.ts'

// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase en las Edge Functions.
// La service_role SOLO vive acá, en el servidor.
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface AuthContext { db: SupabaseClient; userId: string; email: string | null; role: 'user' | 'admin' | 'owner' }

/** Valida el JWT del usuario y relee rol/suspensión desde la base (nunca confía en el cliente). */
export async function authenticate(req: Request): Promise<AuthContext> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'unauthenticated', 'Iniciá sesión para continuar.')
  const db = serviceClient()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'unauthenticated', 'La sesión no es válida o expiró.')
  const { data: r } = await db.from('cr_user_roles').select('role, suspended').eq('user_id', data.user.id).maybeSingle()
  if (r?.suspended) throw new HttpError(403, 'suspended', 'Tu cuenta está suspendida. Contactá a un administrador.')
  return { db, userId: data.user.id, email: data.user.email ?? null, role: (r?.role ?? 'user') as AuthContext['role'] }
}

export function requireAdmin(ctx: AuthContext) {
  if (ctx.role !== 'admin' && ctx.role !== 'owner') throw new HttpError(403, 'forbidden', 'No tenés permisos de administrador.')
}

export async function rateLimit(db: SupabaseClient, key: string, limit: number, windowSeconds = 60) {
  const { data, error } = await db.rpc('cr_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })
  if (error) throw new HttpError(500, 'internal', 'No se pudo verificar el límite de uso.')
  if (data === false) throw new HttpError(429, 'rate_limited', 'Superaste el límite de solicitudes. Esperá un minuto e intentá de nuevo.')
}

export async function audit(db: SupabaseClient, e: {
  actorId?: string | null; actorKind?: 'user' | 'api_key' | 'system'; action: string; targetType?: string; targetId?: string
  reason?: string; metadata?: Record<string, unknown>; ip?: string | null
}) {
  await db.from('cr_audit_logs').insert({
    actor_id: e.actorId ?? null, actor_kind: e.actorKind ?? 'user', action: e.action, target_type: e.targetType ?? null,
    target_id: e.targetId ?? null, reason: e.reason ?? null, metadata: e.metadata ?? {}, ip: e.ip ?? null,
  })
}

export async function logUsage(db: SupabaseClient, u: {
  userId?: string | null; apiKeyId?: string | null; conversationId?: string | null; providerId?: string | null; modelId?: string | null
  kind: 'chat' | 'stt' | 'tts' | 'search' | 'api'; status: 'ok' | 'error' | 'cancelled' | 'rate_limited'
  errorCode?: string | null; promptTokens?: number | null; completionTokens?: number | null; latencyMs?: number | null
}) {
  await db.from('cr_usage_events').insert({
    user_id: u.userId ?? null, api_key_id: u.apiKeyId ?? null, conversation_id: u.conversationId ?? null,
    provider_id: u.providerId ?? null, model_id: u.modelId ?? null, kind: u.kind, status: u.status,
    error_code: u.errorCode ?? null, prompt_tokens: u.promptTokens ?? null, completion_tokens: u.completionTokens ?? null,
    latency_ms: u.latencyMs ?? null,
  })
}

export const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
