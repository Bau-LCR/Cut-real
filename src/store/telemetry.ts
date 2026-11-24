import { create } from 'zustand'

export type TracePhase = 'idle' | 'preparing' | 'sending' | 'model' | 'streaming' | 'done' | 'error' | 'cancelled'
export interface TraceEvent { id: number; at: number; title: string; detail: string; phase: TracePhase }
interface TelemetryState {
  phase: TracePhase
  model: string
  input: string
  output: string
  conversationId: string | null
  startedAt: number | null
  updatedAt: number
  chunks: number
  events: TraceEvent[]
  voicePhase: string
  voiceLevel: number
  begin(data: { input: string; model: string; conversationId: string }): void
  mark(phase: TracePhase, title: string, detail: string): void
  receiveChunk(text: string): void
  finish(phase: 'done' | 'error' | 'cancelled', detail: string): void
  setVoice(phase: string, level?: number): void
}
let eventId = 0
export const useTelemetry = create<TelemetryState>((set, get) => ({
  phase: 'idle', model: 'Sin seleccionar', input: '', output: '', conversationId: null,
  startedAt: null, updatedAt: Date.now(), chunks: 0, events: [],
  voicePhase: 'Inactiva', voiceLevel: 0,
  begin: ({ input, model, conversationId }) => {
    eventId = 0
    set({ phase: 'preparing', model: model || 'Modelo seleccionado', input: input.slice(0, 500), output: '', conversationId, startedAt: Date.now(), updatedAt: Date.now(), chunks: 0, events: [] })
    get().mark('preparing', 'Consulta iniciada', 'Cut-real recibió una nueva solicitud.')
  },
  mark: (phase, title, detail) => set((s) => ({ phase, updatedAt: Date.now(), events: [...s.events, { id: ++eventId, at: Date.now(), title, detail, phase }].slice(-28) })),
  receiveChunk: (text) => set((s) => {
    const chunks = s.chunks + 1
    const shouldLog = chunks === 1 || chunks % 12 === 0
    return {
      phase: 'streaming', output: (s.output + text).slice(-2400), chunks, updatedAt: Date.now(),
      events: shouldLog ? [...s.events, { id: ++eventId, at: Date.now(), title: chunks === 1 ? 'Primer fragmento recibido' : 'Respuesta en transmisión', detail: `${chunks} fragmentos recibidos desde el flujo de respuesta.`, phase: 'streaming' as TracePhase }].slice(-28) : s.events,
    }
  }),
  finish: (phase, detail) => get().mark(phase, phase === 'done' ? 'Respuesta completada' : phase === 'error' ? 'Se produjo un error' : 'Generación detenida', detail),
  setVoice: (voicePhase, voiceLevel = 0) => set({ voicePhase, voiceLevel: Math.max(0, Math.min(1, voiceLevel)), updatedAt: Date.now() }),
}))
