import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toasts } from './components/Toasts'
import { isConfigured } from './lib/supabase'
import { Login } from './pages/Login'
import { ChatPage } from './pages/ChatPage'
import { useAuth } from './store/auth'

const Admin = lazy(() => import('./pages/Admin'))
const Splash = () => <div className="center-screen"><img src={`${import.meta.env.BASE_URL}brand/Logo_Original.png`} alt="Cut-real" width={72} height={72} /></div>

function Guard({ children, admin = false }: { children: JSX.Element; admin?: boolean }) {
  const { ready, session, me, error } = useAuth()
  if (!ready) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  if (error && !me) return <div className="center-screen"><div className="notice error" role="alert"><div className="grow"><div className="t">No se pudo cargar tu cuenta</div>{error}</div></div></div>
  if (me?.suspended) return <div className="center-screen"><div className="login"><h1>Cuenta suspendida</h1><p>Contactá a un administrador para restaurar el acceso.</p><button className="btn" onClick={() => void useAuth.getState().signOut()}>Cerrar sesión</button></div></div>
  if (admin && me?.role !== 'admin' && me?.role !== 'owner') return <Navigate to="/" replace />   // la barrera real está en el servidor
  return children
}

export default function App() {
  const { init, session, ready } = useAuth()
  useEffect(() => { if (isConfigured) init(); else useAuth.setState({ ready: true }) }, [init])
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={ready && session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/admin" element={<Guard admin><Suspense fallback={<Splash />}><Admin /></Suspense></Guard>} />
        <Route path="/c/:id" element={<Guard><ChatPage /></Guard>} />
        <Route path="/" element={<Guard><ChatPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </HashRouter>
  )
}
