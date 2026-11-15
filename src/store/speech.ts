import { create } from 'zustand'
import { makeEngine, type SpeechEngine } from '../voice/engine'
import { markdownToSpeech } from '../voice/speechText'
import { useAuth } from './auth'
import { useUi } from './ui'

interface SpeechState { activeId: string | null; paused: boolean; speak(id: string, markdown: string): Promise<void>; pause(): void; resume(): void; stop(): void }
let engine: SpeechEngine | null = null
let engineKind = ''
const get = () => {
  const kind = useAuth.getState().voice.engine
  if (!engine || engineKind !== kind) { engine?.stop(); engine = makeEngine(kind); engineKind = kind }
  return engine
}

export const useSpeech = create<SpeechState>((set, getState) => ({
  activeId: null, paused: false,
  async speak(id, markdown) {
    const text = markdownToSpeech(markdown)
    if (!text) return
    set({ activeId: id, paused: false })
    try { await get().speak(text, useAuth.getState().voice.rate, useAuth.getState().voice.voice_uri) }
    catch (e) {
      // No sustituir silenciosamente el proveedor externo por la voz del navegador.
      useUi.getState().toast('error', (e as Error).message || 'No se pudo generar la voz externa.')
    } finally { if (getState().activeId === id) set({ activeId: null, paused: false }) }
  },
  pause() { get().pause(); set({ paused: true }) },
  resume() { get().resume(); set({ paused: false }) },
  stop() { get().stop(); set({ activeId: null, paused: false }) },
}))

/** Habla y espera hasta terminar (modo conversación por voz). */
export async function speakAndWait(markdown: string) {
  const text = markdownToSpeech(markdown)
  if (!text) return
  const voice = useAuth.getState().voice
  try { await get().speak(text, voice.rate, voice.voice_uri) }
  catch (error) { throw error }
}
/** En llamada usamos la voz natural del navegador y respetamos la voz elegida en Configuración. */
export async function speakCallAndWait(markdown: string, onActivity?: (level: number) => void) {
  const text = markdownToSpeech(markdown)
  if (!text) return
  const voice = useAuth.getState().voice
  try { await get().speak(text, voice.rate, voice.voice_uri, onActivity) }
  catch (error) { throw error }
}
export const stopSpeaking = () => { engine?.stop() }
