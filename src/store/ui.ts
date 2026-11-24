import { create } from 'zustand'

export interface Toast { id: number; kind: 'error' | 'info'; text: string }
interface UiState {
  sidebarOpen: boolean; settingsOpen: boolean; voiceOpen: boolean; functioningOpen: boolean; toasts: Toast[]
  setSidebar(v: boolean): void; setSettings(v: boolean): void; setVoice(v: boolean): void; setFunctioning(v: boolean): void
  toast(kind: Toast['kind'], text: string): void; dismiss(id: number): void
}
let n = 0
export const useUi = create<UiState>((set, get) => ({
  sidebarOpen: false, settingsOpen: false, voiceOpen: false, functioningOpen: false, toasts: [],
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  setSettings: (settingsOpen) => set({ settingsOpen }),
  setVoice: (voiceOpen) => set({ voiceOpen }),
  setFunctioning: (functioningOpen) => set({ functioningOpen }),
  toast: (kind, text) => { const id = ++n; set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] }); setTimeout(() => get().dismiss(id), 6000) },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))
