import { useAuth } from '../store/auth'
import { isConfigured } from '../lib/supabase'

export function Login() {
  const { signInWithGoogle, error } = useAuth()
  return (
    <div className="center-screen">
      <main className="login">
        <img src={`${import.meta.env.BASE_URL}brand/Logo_Original.png`} alt="Cut-real 2" />
        <h1>Cut-real 2</h1>
        <p>Tu asistente de inteligencia artificial para estudiar, programar y crear. El acceso requiere registro con Google y aprobación del propietario.</p>
        {!isConfigured && (
          <div className="notice error" role="alert" style={{ marginTop: 20, textAlign: 'left' }}>
            <div className="grow"><div className="t">Falta configurar Supabase</div>Copiá <code>.env.example</code> a <code>.env</code> y completá <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Pasos en docs/DEPLOY.md.</div>
          </div>
        )}
        <button className="btn" onClick={() => void signInWithGoogle()} disabled={!isConfigured}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.4z" /><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.7l3.8-3.1z" /><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A12 12 0 0 0 1.8 7.1l3.8 3C6.5 6.8 9 4.8 12 4.8z" /></svg>
          Continuar con Google
        </button>
        {error && <p role="alert" style={{ color: 'var(--danger)', marginTop: 14, fontSize: 14 }}>{error}</p>}
        <p className="privacy">Al continuar, iniciás sesión de forma segura con tu cuenta de Google.</p>
      </main>
    </div>
  )
}
