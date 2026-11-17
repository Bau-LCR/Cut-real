import { describe, expect, it } from 'vitest'
import { parseOpenAIStream } from '../supabase/functions/_shared/sse'
import { generateApiKey, hasScope, looksLikeApiKey, sanitizeScopes, sha256Hex } from '../supabase/functions/_shared/apikeys'
import { renderUserContent, searchContext, titleFrom, trimHistory } from '../supabase/functions/_shared/prompt'

const streamOf = (chunks: string[]) => new ReadableStream<Uint8Array>({
  start(c) { const e = new TextEncoder(); chunks.forEach((x) => c.enqueue(e.encode(x))); c.close() },
})
const collect = async (s: ReadableStream<Uint8Array>) => { const out = []; for await (const e of parseOpenAIStream(s)) out.push(e); return out }

describe('parseOpenAIStream', () => {
  it('une deltas, tolera cortes a mitad de línea y lee usage', async () => {
    const ev = await collect(streamOf([
      'data: {"choices":[{"delta":{"content":"Ho"}}]}\n\ndata: {"choices":[{"delta":{"con',
      'tent":"la"}}]}\n\n: keep-alive\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
    ]))
    expect(ev.map((e) => e.delta).filter(Boolean).join('')).toBe('Hola')
    expect(ev.at(-1)?.usage).toEqual({ prompt_tokens: 5, completion_tokens: 2 })
    expect(ev.at(-1)?.finish).toBe('stop')
  })
  it('procesa el último evento aunque el proveedor cierre sin salto de línea', async () => {
    const ev = await collect(streamOf(['data: {"choices":[{"delta":{"content":"respuesta final"}}]}']))
    expect(ev).toEqual([{ delta: 'respuesta final' }])
  })
  it('ignora JSON inválido sin romper', async () => {
    const ev = await collect(streamOf(['data: {roto\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\n']))
    expect(ev).toEqual([{ delta: 'ok' }])
  })
})

describe('API keys propias', () => {
  it('genera claves únicas, de alta entropía y solo guarda el hash', async () => {
    const a = await generateApiKey(), b = await generateApiKey()
    expect(a.secret).not.toBe(b.secret)
    expect(looksLikeApiKey(a.secret)).toBe(true)
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.hash).toBe(await sha256Hex(a.secret))
    expect(a.hash).not.toContain(a.secret)
    expect(a.secret.startsWith(a.prefix)).toBe(true)
  })
  it('rechaza formatos inválidos y filtra scopes desconocidos', () => {
    expect(looksLikeApiKey('sk-123')).toBe(false)
    expect(looksLikeApiKey('crk_corta')).toBe(false)
    expect(sanitizeScopes(['chat:write', 'root', 'chat:write', 5])).toEqual(['chat:write'])
    expect(hasScope(['models:read'], 'chat:write')).toBe(false)
  })
})

describe('contexto del modelo', () => {
  const f = (over: object) => ({ file_name: 'a.txt', status: 'processed' as const, extracted_text: 'CONTENIDO', mime_type: 'text/plain', ...over })
  it('incluye texto solo de adjuntos procesados', () => {
    expect(renderUserContent('resumí', [f({})])).toContain('CONTENIDO')
  })
  it('NO deja afirmar análisis de un adjunto sin procesar', () => {
    const t = renderUserContent('resumí', [f({ status: 'attached_only', extracted_text: null, file_name: 'x.pdf' })])
    expect(t).toContain('NO se pudo procesar')
    expect(t).not.toContain('CONTENIDO')
  })
  it('trunca adjuntos grandes por presupuesto', () => {
    const t = renderUserContent('x', [f({ extracted_text: 'a'.repeat(500) })], { left: 100 })
    expect(t).toContain('truncado')
  })
  it('trimHistory conserva lo más reciente', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => ({ content: `${i}`.repeat(5000) }))
    const t = trimHistory(msgs, 8000)
    expect(t.at(-1)).toBe(msgs.at(-1)); expect(t.length).toBeLessThan(10)
  })
  it('titleFrom y searchContext', () => {
    expect(titleFrom('  hola\n\n mundo  ')).toBe('hola mundo')
    expect(titleFrom('x'.repeat(200)).length).toBe(60)
    expect(searchContext([{ title: 'T', url: 'https://a.b', snippet: 's' }])).toContain('[1] T')
  })
})
