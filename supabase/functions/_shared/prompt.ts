// Construcción del contexto enviado al modelo. Pura (sin Deno) => testeable.
export interface HistoryMsg { role: 'user' | 'assistant'; content: string }
export interface AttachmentCtx { file_name: string; status: 'processed' | 'attached_only' | 'failed'; extracted_text: string | null; mime_type: string }

export const SYSTEM_PROMPT = `Sos Cut-real, un asistente de inteligencia artificial conversacional. Respondé en el idioma del usuario (por defecto español rioplatense neutro y claro).
Usá Markdown cuando ayude: títulos, listas, tablas, bloques de código con su lenguaje y fórmulas en LaTeX ($...$ y $$...$$).
Sé preciso y honesto: si no sabés algo o no tenés acceso a un archivo o a internet, decilo en lugar de inventar.
Solo podés afirmar que analizaste un archivo si su contenido aparece en el mensaje. No inventes fuentes ni enlaces.

CAPACIDADES DE DOCUMENTOS Y ARCHIVOS: Podés entregar documentos descargables en PDF y Word (.docx). Cuando el usuario pida explícitamente un PDF o Word, NO entregues código, scripts, instrucciones de terminal ni un archivo .txt como sustituto. Redactá el documento completo y encerrá su contenido en un único bloque con este formato exacto:
[[CUTREAL_DOCUMENT:pdf|Título del documento]]
(contenido completo en Markdown)
[[/CUTREAL_DOCUMENT]]
Usá PDF para PDF y Word DOCX para Word. El título debe ser breve, sin corchetes ni saltos de línea. No pongas el documento dentro de un bloque de código. Podés agregar una breve introducción fuera del bloque, pero el contenido entre las marcas debe ser el documento final, bien organizado y listo para exportar. Si el usuario no especifica formato, no generes un archivo por iniciativa propia. Nunca afirmes que el archivo se creó o se descargó: la aplicación se encarga de generarlo y ofrecer la descarga. Para informes, incluí título, secciones, desarrollo, conclusión y fuentes cuando corresponda; distinguí datos verificados de estimaciones y no inventes referencias.`

const MAX_ATTACH_CHARS_TOTAL = 60_000

/** Agrega al mensaje el contenido de los adjuntos (solo los realmente procesados). */
export function renderUserContent(content: string, attachments: AttachmentCtx[], budget = { left: MAX_ATTACH_CHARS_TOTAL }): string {
  const parts: string[] = []
  for (const a of attachments) {
    if (a.mime_type.startsWith('image/')) continue // las imágenes se manejan aparte (visión)
    if (a.status === 'processed' && a.extracted_text) {
      const take = a.extracted_text.slice(0, Math.max(0, budget.left))
      budget.left -= take.length
      const cut = take.length < a.extracted_text.length ? '\n[…contenido truncado por tamaño…]' : ''
      parts.push(`[Archivo adjunto: ${a.file_name}]\n${take}${cut}\n[Fin del archivo]`)
    } else {
      parts.push(`[Archivo adjunto: ${a.file_name} — NO se pudo procesar. No tenés acceso a su contenido; no lo describas ni lo resumas.]`)
    }
  }
  return parts.length ? `${parts.join('\n\n')}\n\n${content}` : content
}

/** Conserva los mensajes más recientes que entren en el presupuesto de caracteres (≈ 3 chars/token). */
export function trimHistory<T extends { content: string }>(msgs: T[], contextWindowTokens: number | null, reserveTokens = 4096): T[] {
  const budget = Math.max(8_000, Math.min(((contextWindowTokens ?? 32_000) - reserveTokens) * 3, 300_000))
  const out: T[] = []
  let used = 0
  for (let i = msgs.length - 1; i >= 0; i--) {
    used += msgs[i].content.length
    if (used > budget && out.length > 0) break
    out.unshift(msgs[i])
  }
  return out
}

export function searchContext(results: { title: string; url: string; snippet: string }[]): string {
  const lines = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')
  return `Resultados de búsqueda web obtenidos ahora (cada uno numerado). Si los usás, citá con [n] y distinguí lo que viene de la web de lo que sabés por tu entrenamiento. No cites nada que no esté acá.\n\n${lines}`
}

export const titleFrom = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Nueva conversación'
