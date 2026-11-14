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
      useUi.getState().toast('error', (e as Error).message)
      // Si el motor remoto falla (no configurado), se vuelve al motor del navegador sin cambiar la configuración guardada.
      if (useAuth.getState().voice.engine === 'remote') {
        try { engine = makeEngine('browser'); engineKind = 'remote'; await engine.speak(text, useAuth.getState().voice.rate, useAuth.getState().voice.voice_uri) } catch { /* sin voz disponible */ }
      }
    } finally { if (getState().activeId === id) set({ activeId: null, paused: false }) }
  },
  pause() { get().pause(); set({ paused: true }) },
  resume() { get().resume(); set({ paused: false }) },
  stop() { get().stop(); set({ activeId: null, paused: false }) },
}))

/** Habla y espera hasta terminar (modo conversación por voz). */
export async function speakAndWait(markdown: string) {
  const text = markdownToSpeech(markdown)
  if (text) await get().speak(text, useAuth.getState().voice.rate)
}
export const stopSpeaking = () => engine?.stop()
