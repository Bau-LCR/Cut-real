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

export interface SearchImageResult { url: string; pageUrl: string; description: string }

export async function imageSearch(query: string, signal?: AbortSignal): Promise<SearchImageResult[]> {
  const tavilyKey = Deno.env.get('TAVILY_API_KEY')
  if (tavilyKey) {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tavilyKey },
      body: JSON.stringify({
        query: query.slice(0, 400), max_results: 5, search_depth: 'basic',
        include_images: true, include_image_descriptions: true,
      }),
    })
    if (!response.ok) throw new Error('image_search_http_' + response.status)
    const payload = await response.json()
    return (Array.isArray(payload.images) ? payload.images : []).slice(0, 8).flatMap((item: any) => {
      const url = typeof item?.url === 'string' ? item.url : ''
      if (!/^https?:\\/\\//i.test(url)) return []
      return [{ url, pageUrl: url, description: String(item.description ?? 'Imagen encontrada en la web').slice(0, 240) }]
    })
  }

  const braveKey = Deno.env.get('BRAVE_API_KEY')
  if (!braveKey) throw new Error('image_search_not_configured')
  const params = new URLSearchParams({ q: query.slice(0, 400), count: '8', country: 'AR', search_lang: 'es', safesearch: 'strict' })
  const response = await fetch('https://api.search.brave.com/res/v1/images/search?' + params.toString(), {
    signal,
    headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey },
  })
  if (!response.ok) throw new Error('image_search_http_' + response.status)
  const payload = await response.json()
  return (Array.isArray(payload.results) ? payload.results : []).slice(0, 8).flatMap((item: any) => {
    const url = typeof item?.thumbnail?.src === 'string' ? item.thumbnail.src : item?.properties?.url
    const pageUrl = typeof item?.url === 'string' ? item.url : ''
    if (typeof url !== 'string' || !/^https?:\\/\\//i.test(url) || !/^https?:\\/\\//i.test(pageUrl)) return []
    const description = [item.title, item.source].filter((value) => typeof value === 'string' && value.trim()).join(' · ') || 'Imagen encontrada en la web'
    return [{ url, pageUrl, description: description.slice(0, 240) }]
  })
}
