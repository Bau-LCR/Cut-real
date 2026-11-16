// Motores de voz intercambiables. Para sumar uno: implementá SpeechEngine y registralo en makeEngine().
import { callFnBlob, FnError } from '../lib/functions'
import { splitSentences } from './speechText'

export interface SpeechEngine {
  speak(text: string, rate: number, voiceURI?: string, onActivity?: (level: number) => void): Promise<void> // se resuelve al terminar o al detener
  pause(): void
  resume(): void
  stop(): void
}

// ---- Identidad de voz: grave, mecánica, clara. Original (no imita ninguna voz protegida). ----
export const VOICE_PROFILE = { pitch: 1, rateScale: 1, preferredNames: /raul|raúl|diego|jorge|juan|pablo|enrique|carlos|male|masculin|andres|andrés|antonio|miguel/i }

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
  speak(text: string, rate: number, voiceURI?: string, onActivity?: (level: number) => void): Promise<void> {
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
        u.onstart = () => onActivity?.(0.42)
        u.onboundary = (event) => { if (event.name === 'word') onActivity?.(0.55 + ((event.charIndex % 5) * 0.09)) }
        u.onend = () => { onActivity?.(0.12); next() }
        u.onerror = () => { onActivity?.(0); resolve() }
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
  async speak(text: string, rate: number, voiceURI?: string, onActivity?: (level: number) => void): Promise<void> {
    this.stop()
    const my = ++this.token
    const blob = await callFnBlob('tts', { text, voice: voiceURI })
    if (my !== this.token) return
    const ctx = (this.ctx ??= new AudioContext())
    if (ctx.state === 'suspended') await ctx.resume()
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    if (my !== this.token) return
    const src = ctx.createBufferSource(); src.buffer = buf
    src.playbackRate.value = Math.min(2, Math.max(0.5, rate * 0.92)); this.src = src
    // Reproducimos el audio original del proveedor sin efectos artificiales.
    const out = ctx.createGain(); out.gain.value = 1
    src.connect(out).connect(ctx.destination)
    return new Promise((resolve) => { src.onended = () => { onActivity?.(0); resolve() }; onActivity?.(0.5); src.start() })
  }
  pause() { void this.ctx?.suspend() }
  resume() { void this.ctx?.resume() }
  stop() { this.token++; try { this.src?.stop() } catch { /* ya detenido */ } this.src = null; if (this.ctx?.state === 'suspended') void this.ctx.resume() }
}

export const makeEngine = (kind: 'browser' | 'remote'): SpeechEngine => (kind === 'remote' ? new RemoteEngine() : new BrowserEngine())
