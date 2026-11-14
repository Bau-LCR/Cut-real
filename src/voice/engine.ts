// Motores de voz intercambiables. Para sumar uno: implementá SpeechEngine y registralo en makeEngine().
import { callFnBlob, FnError } from '../lib/functions'
import { splitSentences } from './speechText'

export interface SpeechEngine {
  speak(text: string, rate: number, voiceURI?: string): Promise<void> // se resuelve al terminar o al detener
  pause(): void
  resume(): void
  stop(): void
}

// ---- Identidad de voz: grave, mecánica, clara. Original (no imita ninguna voz protegida). ----
export const VOICE_PROFILE = { pitch: 1, rateScale: 1, preferredNames: /diego|jorge|juan|pablo|enrique|carlos|male|masculin|andres|antonio|miguel/i }

function pickSpanishVoice(voiceURI?: string): SpeechSynthesisVoice | null {
  const allVoices = speechSynthesis.getVoices()
  if (voiceURI) { const selected = allVoices.find((v) => v.voiceURI === voiceURI); if (selected) return selected }
  const voices = allVoices.filter((v) => v.lang.toLowerCase().startsWith('es'))
  return voices.find((v) => /es-(ar|mx|us|419)/i.test(v.lang) && VOICE_PROFILE.preferredNames.test(v.name))
    ?? voices.find((v) => VOICE_PROFILE.preferredNames.test(v.name)) ?? voices.find((v) => /es-(ar|mx|419)/i.test(v.lang)) ?? voices[0] ?? null
}

export class BrowserEngine implements SpeechEngine {
  private token = 0
  static supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  speak(text: string, rate: number, voiceURI?: string): Promise<void> {
    if (!BrowserEngine.supported) return Promise.reject(new FnError('tts_unsupported', 'Tu navegador no soporta lectura en voz alta.'))
    this.stop()
    const my = ++this.token
    const chunks = splitSentences(text)
    return new Promise((resolve) => {
      let i = 0
      const next = () => {
        if (my !== this.token || i >= chunks.length) return resolve()
        const u = new SpeechSynthesisUtterance(chunks[i++])
        const v = pickSpanishVoice(voiceURI)
        if (v) { u.voice = v; u.lang = v.lang } else u.lang = 'es-AR'
        u.pitch = voiceURI ? 1 : VOICE_PROFILE.pitch
        u.rate = Math.min(2, Math.max(0.5, rate * VOICE_PROFILE.rateScale))
        u.onend = next
        u.onerror = () => resolve()
        speechSynthesis.speak(u)
      }
      next()
    })
  }
  pause() { speechSynthesis.pause() }
  resume() { speechSynthesis.resume() }
  stop() { this.token++; speechSynthesis.cancel() }
}

/** Audio de un proveedor externo (Edge Function `tts`) + cadena de efectos sutil: graves, saturación leve, modulación metálica. */
export class RemoteEngine implements SpeechEngine {
  private ctx: AudioContext | null = null
  private src: AudioBufferSourceNode | null = null
  private token = 0
  async speak(text: string, rate: number): Promise<void> {
    this.stop()
    const my = ++this.token
    const blob = await callFnBlob('tts', { text })
    if (my !== this.token) return
    const ctx = (this.ctx ??= new AudioContext())
    if (ctx.state === 'suspended') await ctx.resume()
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    if (my !== this.token) return
    const src = ctx.createBufferSource(); src.buffer = buf
    src.playbackRate.value = Math.min(2, Math.max(0.5, rate * 0.92)); this.src = src
    // Reproducimos el audio original del proveedor sin efectos artificiales.\n    const out = ctx.createGain(); out.gain.value = 1\n    src.connect(out).connect(ctx.destination)\n    return new Promise((resolve) => { src.onended = () => resolve(); src.start() })
  }
  pause() { void this.ctx?.suspend() }
  resume() { void this.ctx?.resume() }
  stop() { this.token++; try { this.src?.stop() } catch { /* ya detenido */ } this.src = null; if (this.ctx?.state === 'suspended') void this.ctx.resume() }
}

function softClip(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024, c = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount) }
  return c
}

export const makeEngine = (kind: 'browser' | 'remote'): SpeechEngine => (kind === 'remote' ? new RemoteEngine() : new BrowserEngine())
