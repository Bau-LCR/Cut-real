import { supabase } from './supabase'
import type { Attachment } from './types'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_FILES_PER_MESSAGE = 10
export const ACCEPT = '.pdf,.txt,.docx,.csv,.json,.png,.jpg,.jpeg,.webp,.gif'

const BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
}
export const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
export const mimeOf = (f: { name: string }) => BY_EXT[extOf(f.name)] ?? ''

/** Devuelve un mensaje de error en español, o null si el archivo es válido. */
export function validateFile(f: { name: string; size: number }): string | null {
  if (!mimeOf(f)) return `"${f.name}": formato no admitido. Usá PDF, TXT, DOCX, CSV, JSON o imágenes (PNG, JPG, WEBP, GIF).`
  if (f.size === 0) return `"${f.name}" está vacío.`
  if (f.size > MAX_FILE_BYTES) return `"${f.name}" supera los 10 MB.`
  return null
}

export const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80) || 'archivo'

interface Extracted { status: Attachment['status']; text: string | null; note?: string }

/** Extrae texto en el navegador. Si no se puede, el archivo queda "solo adjunto" y la IA lo sabe. */
export async function extractText(file: File): Promise<Extracted> {
  const ext = extOf(file.name)
  try {
    if (['txt', 'csv', 'json'].includes(ext)) return { status: 'processed', text: (await file.text()).slice(0, 380_000) }
    if (ext === 'docx') {
      const mammoth = (await import('mammoth/mammoth.browser')).default
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
      return value.trim() ? { status: 'processed', text: value.slice(0, 380_000) } : { status: 'attached_only', text: null, note: 'El documento no tiene texto.' }
    }
    if (ext === 'pdf') {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
      let out = ''
      for (let i = 1; i <= Math.min(doc.numPages, 150) && out.length < 380_000; i++) {
        const content = await (await doc.getPage(i)).getTextContent()
        out += content.items.map((it: any) => it.str).join(' ') + '\n\n'
      }
      return out.trim().length > 20 ? { status: 'processed', text: out.slice(0, 380_000) } : { status: 'attached_only', text: null, note: 'PDF sin texto seleccionable (probablemente escaneado): no se puede analizar.' }
    }
    return { status: 'attached_only', text: null, note: 'Las imágenes solo las analizan los modelos con visión.' }
  } catch {
    return { status: 'failed', text: null, note: 'No se pudo leer el contenido del archivo.' }
  }
}

export interface UploadResult { attachment: Attachment; note?: string }

export async function uploadAttachment(file: File, userId: string, conversationId: string | null): Promise<UploadResult> {
  const err = validateFile(file)
  if (err) throw new Error(err)
  const ex = await extractText(file)
  const path = `${userId}/${crypto.randomUUID()}-${safeName(file.name)}`
  const { error: upErr } = await supabase.storage.from('cr-attachments').upload(path, file, { contentType: mimeOf(file), upsert: false })
  if (upErr) throw new Error('No se pudo subir el archivo. Intentá de nuevo.')
  const { data, error } = await supabase.from('cr_attachments').insert({
    user_id: userId, conversation_id: conversationId, storage_path: path, file_name: file.name.slice(0, 255), mime_type: mimeOf(file),
    size_bytes: file.size, status: ex.status, extracted_text: ex.text,
  }).select('id, conversation_id, message_id, storage_path, file_name, mime_type, size_bytes, status').single()
  if (error || !data) { await supabase.storage.from('cr-attachments').remove([path]); throw new Error('No se pudo registrar el archivo.') }
  return { attachment: data as Attachment, note: ex.note }
}

export async function openAttachment(a: Pick<Attachment, 'storage_path'>) {
  const { data } = await supabase.storage.from('cr-attachments').createSignedUrl(a.storage_path, 60)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
}
