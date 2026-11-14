import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useUi } from '../store/ui'

interface CallTurn { session_id: string; seq: number; role: 'user' | 'assistant'; content: string; created_at: string }
interface CallSession { id: string; started_at: string; ended_at: string | null; duration_seconds: number; turns: CallTurn[] }

function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes ? minutes + ' min ' + rest + ' s' : rest + ' s'
}

export function CallsPage() {
  const userId = useAuth((s) => s.me?.userId)
  const toast = useUi((s) => s.toast)
  const [sessions, setSessions] = useState<CallSession[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      if (!userId) return
      setLoading(true)
      const { data, error } = await supabase.from('cr_call_sessions')
        .select('id, started_at, ended_at, duration_seconds')
        .eq('user_id', userId).order('started_at', { ascending: false }).limit(50)
      if (error) {
        if (alive) { toast('error', 'No se pudo cargar el registro de llamadas. Aplicá la migración de historial de llamadas.'); setLoading(false) }
        return
      }
      const rows = data ?? []
      const ids = rows.map((r) => r.id)
      let turns: CallTurn[] = []
      if (ids.length) {
        const result = await supabase.from('cr_call_turns')
          .select('session_id, seq, role, content, created_at')
          .in('session_id', ids).order('seq', { ascending: true })
        if (result.error) { if (alive) toast('error', 'No se pudieron cargar las transcripciones.') }
        else turns = (result.data ?? []) as CallTurn[]
      }
      if (alive) {
        setSessions(rows.map((row) => ({ ...row, turns: turns.filter((turn) => turn.session_id === row.id) })) as CallSession[])
        setLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  }, [userId, toast])

  return (
    <div className="app">
      <Sidebar />
      <main className="calls-page">
        <header className="calls-header">
          <div><span className="studio-kicker">HISTORIAL INDEPENDIENTE</span><h1>Registro de llamadas</h1><p>Las llamadas se guardan acá, separadas de tus conversaciones de texto.</p></div>
          <Link className="btn ghost sm" to="/">Volver al chat</Link>
        </header>
        <section className="calls-list">
          {loading && <p className="hint">Cargando llamadas…</p>}
          {!loading && !sessions.length && <div className="calls-empty"><h2>Todavía no hay llamadas registradas</h2><p>Cuando termines una llamada con Cut-real, vas a encontrar acá su duración y transcripción.</p><Link className="btn" to="/">Volver al chat</Link></div>}
          {sessions.map((session) => (
            <article className="call-card" key={session.id}>
              <button className="call-card-head" onClick={() => setExpanded((old) => old === session.id ? null : session.id)} aria-expanded={expanded === session.id}>
                <span className="call-symbol" aria-hidden="true">◉</span>
                <span className="call-meta"><b>{new Date(session.started_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}</b><small>{durationLabel(session.duration_seconds)} · {Math.floor(session.turns.length / 2)} intercambios</small></span>
                <span className="call-expand">{expanded === session.id ? 'Ocultar' : 'Ver transcripción'}⌄</span>
              </button>
              {expanded === session.id && <div className="call-transcript">
                {!session.turns.length && <p className="hint">Esta llamada no tiene mensajes guardados.</p>}
                {session.turns.map((turn) => <div className={`call-turn ${turn.role}`} key={turn.session_id + '-' + turn.seq}>
                  <b>{turn.role === 'user' ? 'Vos' : 'Cut-real'}</b><p>{turn.content}</p>
                </div>)}
              </div>}
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
