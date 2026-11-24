import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toasts } from './components/Toasts'
import { isConfigured } from './lib/supabase'
import { Login } from './pages/Login'
import { ChatPage } from './pages/ChatPage'
import { LandingPage } from './pages/LandingPage'
const StudioPage = lazy(() => import('./pages/StudioPage').then((m) => ({ default: m.StudioPage })))
const CallsPage = lazy(() => import('./pages/CallsPage').then((m) => ({ default: m.CallsPage })))
import { LegalPage } from './pages/LegalPage'
import { useAuth } from './store/auth'

const Admin = lazy(() => import('./pages/Admin'))
const NeuralLab = lazy(() => import('./pages/NeuralLab').then((m) => ({ default: m.NeuralLab })))

const Splash = () => (
  <div className="center-screen" role="status" aria-live="polite">
    <div className="startup">
      <img src={`${import.meta.env.BASE_URL}brand/Logo_Original.png`} alt="Cut-real" width={72} height={72} />
      <h1>Cut-real 2</h1>
      <p>Preparando tu espacio...</p>
      <span className="startup-loader" aria-hidden="true" />
    </div>
  </div>
)

function Guard({ children, admin = false }: { children: JSX.Element; admin?: boolean }) {
  const { ready, session, me, error } = useAuth()
  if (!ready) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  if (error && !me) return <div className="center-screen"><div className="login"><h1>No se pudo cargar tu cuenta</h1><p>{error}</p><button className="btn" onClick={() => void useAuth.getState().signOut()}>Cerrar sesión</button></div></div>
  if (me?.suspended) return <div className="center-screen"><div className="login"><h1>Cuenta suspendida</h1><p>Contactá a un administrador para restaurar el acceso.</p><button className="btn" onClick={() => void useAuth.getState().signOut()}>Cerrar sesión</button></div></div>
  if (!me) return <div className="center-screen"><div className="login"><h1>Acceso no disponible</h1><p>No pudimos verificar la autorización de esta cuenta. Por seguridad, no se habilita el acceso hasta cargar y validar tu perfil.</p><button className="btn" onClick={() => void useAuth.getState().signOut()}>Cerrar sesión</button></div></div>
  if (me.role !== 'owner' && me.access_status !== 'approved') return <div className="center-screen"><div className="login"><h1>{me.access_status === 'rejected' ? 'Solicitud no aprobada' : 'Acceso pendiente'}</h1><p>{me.access_status === 'rejected' ? 'Tu solicitud no fue aprobada. Podés contactar al administrador para pedir una revisión.' : 'Tu cuenta se registró correctamente y está pendiente de autorización del propietario.'}</p><p className="hint">{me.email}</p><button className="btn" onClick={() => void useAuth.getState().signOut()}>Cerrar sesión</button></div></div>
  if (admin && me?.role !== 'admin' && me?.role !== 'owner') return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { init, session, ready, appearance } = useAuth()
  useEffect(() => { document.documentElement.dataset.theme = appearance }, [appearance])
  useEffect(() => {
    if (isConfigured) init()
    else useAuth.setState({ ready: true, error: 'Supabase todavía no está configurado. Revisá las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en GitHub.' })
  }, [init])

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={!ready ? <Splash /> : ready && session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/admin" element={<Guard admin><Suspense fallback={<Splash />}><Admin /></Suspense></Guard>} />
        <Route path="/studio" element={<Guard><Suspense fallback={<Splash />}><StudioPage /></Suspense></Guard>} />
        <Route path="/neural" element={<Guard><Suspense fallback={<Splash />}><NeuralLab /></Suspense></Guard>} />
        <Route path="/projects" element={<Navigate to="/" replace />} />
        <Route path="/simulation" element={<Navigate to="/" replace />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/inicio" element={<LandingPage />} />
        <Route path="/calls" element={<Guard><Suspense fallback={<Splash />}><CallsPage /></Suspense></Guard>} />
        <Route path="/c/:id" element={<Guard><ChatPage /></Guard>} />
        <Route path="/" element={!ready ? <Splash /> : session ? <Guard><ChatPage /></Guard> : <LandingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </HashRouter>
  )
}
