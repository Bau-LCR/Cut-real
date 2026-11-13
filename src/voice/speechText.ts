/** Convierte Markdown en texto para leer en voz alta (sin símbolos ni código). */
export function markdownToSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (bloque de código omitido) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, '')
    .replace(/\|/g, ', ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' (fórmula) ')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\[(\d+)\]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parte en frases cortas: evita el corte de ~15 s del motor del navegador y permite pausar con precisión. */
export function splitSentences(text: string, max = 220): string[] {
  const parts = text.match(/[^.!?…;:]+[.!?…;:]*\s*/g) ?? [text]
  const out: string[] = []
  let cur = ''
  for (const p of parts) {
    if ((cur + p).length > max && cur) { out.push(cur.trim()); cur = '' }
    if (p.length > max) { for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max).trim()) } else cur += p
  }
  if (cur.trim()) out.push(cur.trim())
  return out.filter(Boolean)
}
