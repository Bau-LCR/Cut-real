import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('TU-PROYECTO'))

// Con PKCE el retorno de Google llega como ?code=... y no choca con el router por hash (#/).
export const supabase = createClient(SUPABASE_URL ?? 'http://localhost:54321', SUPABASE_ANON_KEY ?? 'missing', {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'cutreal2-auth' },
})
