import { describe, expect, it } from 'vitest'
import { readSSE } from '../src/lib/sse'
import { groupConversations, relativeTime, formatBytes, mergeMessageSnapshot } from '../src/lib/format'
import { normalizeHtmlArtifacts, normalizeMath } from '../src/lib/markdown'
import { markdownToSpeech, splitSentences } from '../src/voice/speechText'
import { validateFile, safeName } from '../src/lib/files'

describe('readSSE', () => {
  it('entrega eventos aunque lleguen partidos en varios chunks', async () => {
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode('data: {"type":"del')); c.enqueue(enc.encode('ta","text":"a"}\n\ndata: {"type":"done"}\n\n')); c.close() } })
    const got: any[] = []
    await readSSE(new Response(body), (e) => got.push(e))
    expect(got).toEqual([{ type: 'delta', text: 'a' }, { type: 'done' }])
  })
})

describe('historial', () => {
  const now = new Date('2026-11-13T15:00:00')
  const c = (id: string, iso: string, pinned = false) => ({ id, title: id, model_id: null, pinned, created_at: iso, updated_at: iso, last_message_at: iso })
  it('no pierde mensajes locales que llegan mientras se carga el historial', () => {
    const fetched = [{ id: 'db-1', seq: 1, content: 'pregunta' }, { id: 'db-2', seq: 2, content: 'respuesta parcial' }] as any
    const live = [{ id: 'tmp-1', seq: undefined, content: 'pregunta nueva' }, { id: 'db-2', seq: 2, content: 'respuesta completa' }] as any
    const merged = mergeMessageSnapshot(fetched, live, true)
    expect(merged.map((m) => m.id)).toEqual(['db-1', 'db-2', 'tmp-1'])
    expect(merged.find((m) => m.id === 'db-2')?.content).toBe('respuesta completa')
  })
  it('agrupa por fecha y respeta fijadas', () => {
    const g = groupConversations([c('p', '2026-01-01T10:00:00', true), c('hoy', '2026-11-13T09:00:00'), c('ayer', '2026-11-12T23:00:00'), c('sem', '2026-11-08T10:00:00'), c('viejo', '2026-06-01T10:00:00')], now)
    expect(g.map((x) => x.label)).toEqual(['Fijadas', 'Hoy', 'Ayer', 'Últimos 7 días', 'Anteriores'])
  })
  it('formatos auxiliares', () => {
    expect(formatBytes(2048)).toBe('2 KB'); expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('hace 5 min')
  })
})

describe('markdown y voz', () => {
  it('convierte delimitadores LaTeX sin tocar el código', () => {
    expect(normalizeMath('x \\(a+b\\) y')).toContain('$a+b$')
    expect(normalizeMath('\\[x^2\\]')).toContain('$\nx^2\n$')
    expect(normalizeMath('`\\(no\\)`')).toBe('`\\(no\\)`')
  })

  it('preserva entornos aligned dentro de bloques display sin anidar delimitadores', () => {
    const source = '\\[\\begin{aligned}x&=1\\\\y&=2\\end{aligned}\\]'
    const normalized = normalizeMath(source)
    expect(normalized).toContain('$$\n\\begin{aligned}')
    expect(normalized).toContain('\\end{aligned}\n$$')
    expect(normalized).not.toContain('$$\n$$')
  })
  it('envuelve entornos aligned sin delimitadores y mantiene sus líneas intactas', () => {
    const source = '\\begin{aligned}\nx&=1\\\\\ny&=2\n\\end{aligned}'
    const normalized = normalizeMath(source)
    expect(normalized).toContain('$$\n\\begin{aligned}')
    expect(normalized).toContain('y&=2')
    expect(normalized).not.toContain('$y&=2$')
  })
  it('la lectura en voz alta no incluye símbolos ni código', () => {
    const t = markdownToSpeech('## Título\n\n**Hola** [enlace](http://x.y)\n\n```js\nconsole.log(1)\n```\n\n- item')
    expect(t).not.toMatch(/[#*`\[\]]|console|http/); expect(t).toContain('Hola enlace'); expect(t).toContain('bloque de código omitido')
  })
  it('normaliza etiquetas HTML y tablas impresas por el modelo', () => {
    const source = '<p>Resumen<br>de la guerra</p><ul><li>Aliados</li><li>Eje</li></ul><table><tr><th>País</th><th>Bloque</th></tr><tr><td>Francia</td><td>Aliados</td></tr></table>'
    const normalized = normalizeHtmlArtifacts(source)
    expect(normalized).toContain('Resumen\nde la guerra')
    expect(normalized).toContain('- Aliados')
    expect(normalized).toContain('| País | Bloque |')
    expect(normalized).not.toMatch(/<\/?(?:p|br|ul|li|table|tr|td|th)>/i)
  })
  it('la voz no pronuncia etiquetas HTML escapadas ni emojis', () => {
    const spoken = markdownToSpeech('Hola &lt;br&gt; mundo 😀 <ul><li>uno</li></ul>')
    expect(spoken).not.toMatch(/[<>]|br|ul|li|😀/)
    expect(spoken).toContain('Hola')
    expect(spoken).toContain('mundo')
  })
  it('splitSentences respeta el máximo', () => {
    const parts = splitSentences('Una frase. '.repeat(60), 100)
    expect(parts.every((p) => p.length <= 100)).toBe(true); expect(parts.length).toBeGreaterThan(5)
  })
})

describe('validación de archivos', () => {
  it('acepta formatos soportados y rechaza el resto', () => {
    for (const n of ['a.pdf', 'a.TXT', 'a.docx', 'a.csv', 'a.json', 'a.png', 'a.jpg', 'a.webp']) expect(validateFile({ name: n, size: 100 })).toBeNull()
    expect(validateFile({ name: 'a.exe', size: 100 })).toMatch(/formato no admitido/)
    expect(validateFile({ name: 'a.pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/)
    expect(validateFile({ name: 'a.pdf', size: 0 })).toMatch(/vacío/)
  })
  it('sanea nombres para el storage', () => { expect(safeName('../../mi archivo ñ.pdf')).not.toMatch(/[/\\ ]/) })
})
