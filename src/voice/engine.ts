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
export const VOICE_PROFILE = { pitch: 0.55, rateScale: 0.94, preferredNames: /diego|jorge|juan|pablo|enrique|carlos|male|masculin/i }

function pickSpanishVoice(voiceURI?: string): SpeechSynthesisVoice | null {
  const allVoices = speechSynthesis.getVoices()\n  if (voiceURI) { const selected = allVoices.find((v) => v.voiceURI === voiceURI); if (selected) return selected }\n  const voices = allVoices.filter((v) => v.lang.toLowerCase().startsWith('es'))
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
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180; low.gain.value = 7
    const shaper = ctx.createWaveShaper(); shaper.curve = softClip(1.8); shaper.oversample = '2x'
    const ring = ctx.createGain(); ring.gain.value = 0.82                      // modulación de anillo ≈ 55 Hz (mezcla baja)
    const osc = ctx.createOscillator(); osc.frequency.value = 55
    const depth = ctx.createGain(); depth.gain.value = 0.18
    osc.connect(depth).connect(ring.gain); osc.start()
    const delay = ctx.createDelay(0.05); delay.delayTime.value = 0.012          // resonancia metálica corta
    const fb = ctx.createGain(); fb.gain.value = 0.22; delay.connect(fb).connect(delay)
    const out = ctx.createGain(); out.gain.value = 0.9
    src.connect(low).connect(shaper).connect(ring)
    ring.connect(out); ring.connect(delay); delay.connect(out); out.connect(ctx.destination)
    return new Promise((resolve) => { src.onended = () => { osc.stop(); resolve() }; src.start() })
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
