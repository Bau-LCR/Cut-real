// CORS: en producción definí ALLOWED_ORIGINS="https://tuusuario.github.io,https://tu-dominio.com"
export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const origin = req.headers.get('origin') ?? ''
  const allow = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

/** Convierte cualquier error en respuesta SIN filtrar detalles internos. */
export function errorResponse(req: Request, e: unknown): Response {
  if (e instanceof HttpError) return json(req, { error: e.code, message: e.message }, e.status)
  console.error('unhandled', e instanceof Error ? e.message : String(e))
  return json(req, { error: 'internal', message: 'Error interno. Intentá de nuevo en unos segundos.' }, 500)
}
