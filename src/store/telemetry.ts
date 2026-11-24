import { create } from 'zustand'

export type TracePhase = 'idle' | 'preparing' | 'sending' | 'model' | 'streaming' | 'done' | 'error' | 'cancelled'
export interface TraceEvent { id: number; at: number; title: string; detail: string; phase: TracePhase; tokenEstimate?: number }
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
  inputTokensEstimate: number
  outputTokensEstimate: number
  promptTokens: number | null
  completionTokens: number | null
  tokenUsage: number | null
  usageExact: boolean
  durationMs: number | null
  begin(data: { input: string; model: string; conversationId: string }): void
  mark(phase: TracePhase, title: string, detail: string): void
  receiveChunk(text: string): void
  setMetrics(data: { tokenUsage: number | null; promptTokens: number | null; completionTokens: number | null; durationMs: number | null; usageExact: boolean }): void
  finish(phase: 'done' | 'error' | 'cancelled', detail: string): void
  setVoice(phase: string, level?: number): void
}
let eventId = 0
const estimate = (value: string) => Math.max(0, Math.ceil(value.length / 4))
export const useTelemetry = create<TelemetryState>((set, get) => ({
  phase: 'idle', model: 'Sin seleccionar', input: '', output: '', conversationId: null,
  startedAt: null, updatedAt: Date.now(), chunks: 0, events: [],
  voicePhase: 'Inactiva', voiceLevel: 0,
  inputTokensEstimate: 0, outputTokensEstimate: 0, promptTokens: null, completionTokens: null, tokenUsage: null, usageExact: false, durationMs: null,
  begin: ({ input, model, conversationId }) => {
    eventId = 0
    set({
      phase: 'preparing', model: model || 'Modelo seleccionado', input: input.slice(0, 500), output: '',
      conversationId, startedAt: Date.now(), updatedAt: Date.now(), chunks: 0, events: [],
      inputTokensEstimate: estimate(input), outputTokensEstimate: 0, promptTokens: null, completionTokens: null, tokenUsage: null, usageExact: false, durationMs: null,
    })
    get().mark('preparing', 'Consulta iniciada', 'Cut-real recibió una nueva solicitud.')
  },
  mark: (phase, title, detail) => set((s) => ({
    phase, updatedAt: Date.now(),
    events: [...s.events, { id: ++eventId, at: Date.now(), title, detail, phase, tokenEstimate: s.inputTokensEstimate + s.outputTokensEstimate }].slice(-40),
  })),
  receiveChunk: (text) => set((s) => {
    const chunks = s.chunks + 1
    const output = (s.output + text).slice(-5000)
    const outputTokensEstimate = estimate(output)
    const shouldLog = chunks === 1 || chunks % 8 === 0
    return {
      phase: 'streaming', output, outputTokensEstimate, chunks, updatedAt: Date.now(),
      events: shouldLog ? [...s.events, {
        id: ++eventId, at: Date.now(), title: chunks === 1 ? 'Primer fragmento recibido' : 'Respuesta en transmisión',
        detail: `${chunks} fragmentos recibidos. Salida estimada: ${outputTokensEstimate.toLocaleString('es-AR')} tokens.`,
        phase: 'streaming' as TracePhase, tokenEstimate: s.inputTokensEstimate + outputTokensEstimate,
      }].slice(-40) : s.events,
    }
  }),
  setMetrics: (data) => set({ ...data, updatedAt: Date.now() }),
  finish: (phase, detail) => get().mark(phase, phase === 'done' ? 'Respuesta completada' : phase === 'error' ? 'Se produjo un error' : 'Generación detenida', detail),
  setVoice: (voicePhase, voiceLevel = 0) => set({ voicePhase, voiceLevel: Math.max(0, Math.min(1, voiceLevel)), updatedAt: Date.now() }),
}))
