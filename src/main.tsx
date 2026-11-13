import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-ext-400.css'
import './styles.css'
import App from './App'

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Cut-real] Error al mostrar la aplicación:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#0c0d10', color: '#e8eaee', fontFamily: 'system-ui, sans-serif' }}>
          <section style={{ width: 'min(560px, 100%)', padding: 28, border: '1px solid #363b47', borderRadius: 16, background: '#13151a' }}>
            <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Cut-real tuvo un problema</h1>
            <p style={{ margin: '0 0 16px', color: '#aeb4c0', lineHeight: 1.6 }}>La interfaz encontró un error al iniciarse. Recargá la página. Si vuelve a aparecer, compartí este mensaje para poder corregirlo.</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 12, borderRadius: 8, background: '#0c0d10', color: '#e8a09a', fontSize: 12 }}>{this.state.error.message}</pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: 18, padding: '10px 16px', border: 0, borderRadius: 8, background: '#c3c6d0', color: '#0c0d10', fontWeight: 700, cursor: 'pointer' }}>Recargar aplicación</button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>)
