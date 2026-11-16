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
  voice: { rate: 1, auto_read: false, engine: 'remote', voice_uri: 'Puck' }, webSearchDefault: false, defaultModelId: null, privacyAck: false,

  init() {
    if (started) return
    started = true

    const load = async (session: Session | null) => {
      if (!session) {
        set({ session: null, me: null, ready: true, error: null })
        return
      }

      try {
        const { data: ens, error } = await supabase.rpc('cr_ensure_profile')
        if (error || !ens) {
          set({ session, me: null, ready: true, error: 'No se pudo cargar tu perfil. Revisá que las migraciones SQL estén aplicadas en Supabase.' })
          return
        }

        const [{ data: p }, { data: s }] = await Promise.all([
          supabase.from('cr_profiles').select('email, display_name, avatar_url').eq('user_id', session.user.id).maybeSingle(),
          supabase.from('cr_user_settings').select('default_model_id, web_search_default, voice, privacy_notice_ack_at').eq('user_id', session.user.id).maybeSingle(),
        ])

        const loadedVoice = { ...get().voice, ...(s?.voice ?? {}) }
        // Kore era el valor inicial anterior; migrarlo a Puck como nueva voz predeterminada.
        if (loadedVoice.engine === 'remote' && (!loadedVoice.voice_uri || loadedVoice.voice_uri === 'Kore')) loadedVoice.voice_uri = 'Puck'
        set({
          session, ready: true, error: null,
          me: { userId: session.user.id, email: p?.email ?? session.user.email ?? null, display_name: p?.display_name ?? null, avatar_url: p?.avatar_url ?? null, role: ens.role, suspended: ens.suspended, access_status: ens.access_status ?? 'pending', suspended_reason: ens.suspended_reason ?? null },
          voice: loadedVoice, webSearchDefault: !!s?.web_search_default, defaultModelId: s?.default_model_id ?? null, privacyAck: !!s?.privacy_notice_ack_at,
        })
        if (s?.voice && JSON.stringify(s.voice) !== JSON.stringify(loadedVoice)) {
          void supabase.from('cr_user_settings').update({ voice: loadedVoice }).eq('user_id', session.user.id)
        }
      } catch (e) {
        console.error('[Cut-real] Error al cargar la cuenta:', e)
        set({ session, me: null, ready: true, error: 'No se pudo conectar con Supabase para cargar tu cuenta. Comprobá la conexión y la configuración del proyecto.' })
      }
    }

    // Evita que una conexión lenta o una respuesta bloqueada deje la pantalla de inicio vacía.
    const startupTimeout = window.setTimeout(() => {
      if (!get().ready) {
        set({ session: null, me: null, ready: true, error: 'La conexión con Supabase está tardando demasiado. Podés reintentar cuando la conexión esté disponible.' })
      }
    }, 12000)

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error
        return load(data.session)
      })
      .catch((e) => {
        console.error('[Cut-real] No se pudo recuperar la sesión:', e)
        set({ session: null, me: null, ready: true, error: 'No se pudo iniciar la aplicación porque falló la conexión con Supabase. Revisá la configuración y volvé a intentarlo.' })
      })
      .finally(() => window.clearTimeout(startupTimeout))

    // No hacer llamadas async a Supabase dentro del callback de auth.
    supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => { void load(session) }, 0)
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
