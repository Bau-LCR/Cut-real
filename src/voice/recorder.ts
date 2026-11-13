import { callFnForm } from '../lib/functions'

export function micErrorMessage(e: unknown): string {
  const n = (e as DOMException)?.name
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'El navegador bloqueó el micrófono. Habilitalo desde el candado de la barra de direcciones y volvé a intentar.'
  if (n === 'NotFoundError') return 'No se encontró ningún micrófono.'
  if (n === 'NotReadableError') return 'El micrófono está siendo usado por otra aplicación.'
  return 'No se pudo acceder al micrófono.'
}

const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? ''

/** Sesión de micrófono persistente: un solo permiso, varios turnos, detección de voz y de fin de turno. */
export class MicSession {
  private stream!: MediaStream
  private ctx!: AudioContext
  private analyser!: AnalyserNode
  private data!: Uint8Array<ArrayBuffer>
  level = () => { this.analyser.getByteTimeDomainData(this.data); let s = 0; for (const v of this.data) { const x = (v - 128) / 128; s += x * x } return Math.sqrt(s / this.data.length) }

  static supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  async open() {
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) }
    catch (e) { throw new Error(micErrorMessage(e)) }
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 1024
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.fftSize))
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser)
  }

  /** Graba hasta `stop()`. Con `vad`, termina sola tras `silenceMs` de silencio luego de haber oído voz. */
  record(opts: { vad?: boolean; silenceMs?: number; threshold?: number; maxMs?: number; onLevel?: (l: number) => void; signal?: AbortSignal } = {}): { done: Promise<Blob | null>; stop: () => void } {
    const { vad = false, silenceMs = 1300, threshold = 0.035, maxMs = 120_000 } = opts
    const mime = pickMime()
    const rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    let heard = false, last = Date.now(), timer = 0
    const start = Date.now()
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise<Blob | null>((resolve) => {
      rec.onstop = () => { clearInterval(timer); resolve(heard || !vad ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null) }
    })
    const stop = () => { if (rec.state !== 'inactive') rec.stop() }
    timer = window.setInterval(() => {
      const l = this.level(); opts.onLevel?.(l)
      if (l > threshold) { heard = true; last = Date.now() }
      if (vad && heard && Date.now() - last > silenceMs) stop()
      if (Date.now() - start > maxMs) stop()
    }, 80)
    opts.signal?.addEventListener('abort', () => { heard = false; chunks.length = 0; stop() })
    rec.start(250)
    return { done, stop }
  }

  /** Espera a que el usuario hable (para interrumpir la respuesta de la IA). */
  waitForVoice(signal: AbortSignal, threshold = 0.07, ms = 220): Promise<boolean> {
    return new Promise((resolve) => {
      let since = 0
      const t = window.setInterval(() => {
        if (signal.aborted) { clearInterval(t); return resolve(false) }
        if (this.level() > threshold) { since ||= Date.now(); if (Date.now() - since > ms) { clearInterval(t); resolve(true) } } else since = 0
      }, 60)
    })
  }

  close() { this.stream?.getTracks().forEach((t) => t.stop()); void this.ctx?.close() }
}

export async function transcribe(blob: Blob): Promise<string> {
  const form = new FormData()
  form.append('file', blob, blob.type.includes('mp4') ? 'audio.m4a' : 'audio.webm')
  form.append('language', 'es')
  const { text } = await callFnForm<{ text: string }>('transcribe', form)
  return text
}
