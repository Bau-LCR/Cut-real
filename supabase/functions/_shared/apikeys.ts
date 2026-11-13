// Claves propias de Cut-real. Secreto de 256 bits; en la base solo se guarda su SHA-256.
export const API_SCOPES = ['models:read', 'chat:write', 'identity:read', 'conversations:read', 'conversations:write'] as const
export type ApiScope = (typeof API_SCOPES)[number]

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function generateApiKey() {
  const secret = 'crk_' + b64url(crypto.getRandomValues(new Uint8Array(32)))
  return { secret, prefix: secret.slice(0, 12), hash: await sha256Hex(secret) }
}

export const looksLikeApiKey = (s: string) => /^crk_[A-Za-z0-9_-]{43}$/.test(s)

export function hasScope(granted: string[], required: ApiScope): boolean {
  return granted.includes(required)
}

export function sanitizeScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s)))]
}
