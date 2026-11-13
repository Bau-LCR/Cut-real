// Búsqueda web real. Se activa SOLO si hay un proveedor configurado en secretos; nunca se simula.
export interface SearchResult { title: string; url: string; snippet: string }

export function searchProvider(): 'tavily' | 'brave' | null {
  const p = (Deno.env.get('SEARCH_PROVIDER') ?? '').toLowerCase()
  if (p === 'tavily' && Deno.env.get('TAVILY_API_KEY')) return 'tavily'
  if (p === 'brave' && Deno.env.get('BRAVE_API_KEY')) return 'brave'
  return null
}

export async function webSearch(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const p = searchProvider()
  if (!p) throw new Error('search_not_configured')
  const q = query.slice(0, 400)
  if (p === 'tavily') {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('TAVILY_API_KEY')}` },
      body: JSON.stringify({ query: q, max_results: 5, search_depth: 'basic' }),
    })
    if (!r.ok) throw new Error(`search_http_${r.status}`)
    const j = await r.json()
    return (j.results ?? []).slice(0, 5).map((x: any) => ({ title: String(x.title ?? x.url), url: String(x.url), snippet: String(x.content ?? '').slice(0, 600) }))
  }
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(q)}`, {
    signal, headers: { Accept: 'application/json', 'X-Subscription-Token': Deno.env.get('BRAVE_API_KEY')! },
  })
  if (!r.ok) throw new Error(`search_http_${r.status}`)
  const j = await r.json()
  return (j.web?.results ?? []).slice(0, 5).map((x: any) => ({ title: String(x.title), url: String(x.url), snippet: String(x.description ?? '').replace(/<[^>]+>/g, '').slice(0, 600) }))
}
