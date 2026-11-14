// Búsqueda web real. Se activa SOLO si hay un proveedor configurado en secretos; nunca se simula.
export interface SearchResult { title: string; url: string; snippet: string }

// Detección local y gratuita: evita una segunda llamada al modelo para decidir si buscar.
const EXPLICIT_SEARCH = /\b(busca|buscá|buscar|investiga|investigá|investigar|consulta en internet|googlea|googleá|fuentes actuales|verifica en la web|verificá en la web|comprueba en internet|comprobá en internet)\b/i
const FRESH_INFO = /\b(actual|actuales|actualmente|hoy|ahora|últim[oa]s?|reciente|recientemente|esta semana|este mes|este año|202[5-9]|precio|cotización|tipo de cambio|versión más nueva|lanzamiento|noticias|resultados de hoy|en vivo|vigente|disponibilidad)\b/i
const STABLE_QUESTION = /\bqué es|que es|cómo funciona|como funciona|explicame|explícame|definición|definicion|significa\b/i

export function shouldSearchWeb(message: string): boolean {
  const q = message.trim()
  if (!q || q.length < 8) return false
  if (EXPLICIT_SEARCH.test(q)) return true
  if (VERIFY_INTENT.test(q) || FRESH_INFO.test(q)) return true
  return false
}

// Caché efímera por instancia de Edge Function: reduce consultas repetidas cercanas.
const cache = new Map<string, { expires: number; results: SearchResult[] }>()
const CACHE_TTL_MS = 5 * 60 * 1000

export function searchProvider(): 'tavily' | 'brave' | null {
  const p = (Deno.env.get('SEARCH_PROVIDER') ?? '').toLowerCase()
  if (p === 'tavily' && Deno.env.get('TAVILY_API_KEY')) return 'tavily'
  if (p === 'brave' && Deno.env.get('BRAVE_API_KEY')) return 'brave'
  return null
}

export async function webSearch(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const p = searchProvider()
  if (!p) throw new Error('search_not_configured')
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 300)
  const cacheKey = \`\${p}:\${q.toLowerCase()}\`
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.results

  if (p === 'tavily') {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${Deno.env.get('TAVILY_API_KEY')}\` },
      body: JSON.stringify({ query: q, max_results: 3, search_depth: 'basic' }),
    })
    if (!r.ok) throw new Error(\`search_http_\${r.status}\`)
    const j = await r.json()
    const results = (j.results ?? []).slice(0, 3).map((x: any) => ({ title: String(x.title ?? x.url), url: String(x.url), snippet: String(x.content ?? '').slice(0, 350) }))
    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, results })
    return results
  }

  const r = await fetch(\`https://api.search.brave.com/res/v1/web/search?count=3&q=\${encodeURIComponent(q)}\`, {
    signal, headers: { Accept: 'application/json', 'X-Subscription-Token': Deno.env.get('BRAVE_API_KEY')! },
  })
  if (!r.ok) throw new Error(\`search_http_\${r.status}\`)
  const j = await r.json()
  const results = (j.web?.results ?? []).slice(0, 3).map((x: any) => ({ title: String(x.title), url: String(x.url), snippet: String(x.description ?? '').replace(/<[^>]+>/g, '').slice(0, 350) }))
  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, results })
  return results
}
