import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Me, VoiceSettings } from '../lib/types'

interface AuthState {
  session: Session | null; me: Me | null; ready: boolean; error: string | null
  voice: VoiceSettings; webSearchDefault: boolean; defaultModelId: string | null; privacyAck: boolean
  init(): void
  signInWithGoogle(): Promise<void>
  signOut(): Promise<void>
  updateProfile(display_name: string): Promise<void>
  saveSettings(p: Partial<{ voice: VoiceSettings; web_search_default: boolean; default_model_id: string | null; ack: boolean }>): Promise<void>
}

let started = false
export const useAuth = create<AuthState>((set, get) => ({
  session: null, me: null, ready: false, error: null,
  voice: { rate: 1, auto_read: false, engine: 'browser' }, webSearchDefault: false, defaultModelId: null, privacyAck: false,

  init() {
    if (started) return
    started = true
    const load = async (session: Session | null) => {
      if (!session) return set({ session: null, me: null, ready: true })
      const { data: ens, error } = await supabase.rpc('cr_ensure_profile')
      if (error) return set({ session, me: null, ready: true, error: 'No se pudo cargar tu perfil. ¿Corriste las migraciones SQL?' })
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('cr_profiles').select('email, display_name, avatar_url').eq('user_id', session.user.id).maybeSingle(),
        supabase.from('cr_user_settings').select('default_model_id, web_search_default, voice, privacy_notice_ack_at').eq('user_id', session.user.id).maybeSingle(),
      ])
      set({
        session, ready: true, error: null,
        me: { userId: session.user.id, email: p?.email ?? session.user.email ?? null, display_name: p?.display_name ?? null, avatar_url: p?.avatar_url ?? null, role: ens.role, suspended: ens.suspended },
        voice: { ...get().voice, ...(s?.voice ?? {}) }, webSearchDefault: !!s?.web_search_default, defaultModelId: s?.default_model_id ?? null, privacyAck: !!s?.privacy_notice_ack_at,
      })
    }
    // Recupera la sesión persistida al abrir la app.
    supabase.auth.getSession().then(({ data }) => load(data.session))
    // Importante: no hacer await de llamadas a supabase dentro del callback (evita bloqueos); se difiere.
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
      setTimeout(() => load(session), 0)
    })
  },

  async signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + import.meta.env.BASE_URL } })
    if (error) set({ error: 'No se pudo iniciar sesión con Google. Revisá la configuración de Google OAuth en Supabase.' })
  },
  async signOut() { await supabase.auth.signOut(); set({ session: null, me: null }) },

  async updateProfile(display_name) {
    const me = get().me; if (!me) return
    const { error } = await supabase.from('cr_profiles').update({ display_name: display_name.trim().slice(0, 80) }).eq('user_id', me.userId)
    if (error) throw new Error('No se pudo guardar el nombre.')
    set({ me: { ...me, display_name: display_name.trim().slice(0, 80) } })
  },

  async saveSettings(p) {
    const me = get().me; if (!me) return
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (p.voice) patch.voice = p.voice
    if (p.web_search_default !== undefined) patch.web_search_default = p.web_search_default
    if (p.default_model_id !== undefined) patch.default_model_id = p.default_model_id
    if (p.ack) patch.privacy_notice_ack_at = new Date().toISOString()
    const { error } = await supabase.from('cr_user_settings').update(patch).eq('user_id', me.userId)
    if (error) throw new Error('No se pudieron guardar los ajustes.')
    set({
      ...(p.voice ? { voice: p.voice } : {}), ...(p.web_search_default !== undefined ? { webSearchDefault: p.web_search_default } : {}),
      ...(p.default_model_id !== undefined ? { defaultModelId: p.default_model_id } : {}), ...(p.ack ? { privacyAck: true } : {}),
    })
  },
}))
