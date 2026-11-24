import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { groupConversations } from '../lib/format'
import type { Conversation } from '../lib/types'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useUi } from '../store/ui'
import { Edit, FileText, Home, LogOut, More, Pin, Plus, Search, Settings, Shield, Trash } from './icons'

function ConvItem({ c, active, onOpen }: { c: Conversation; active: boolean; onOpen(): void }) {
  const busy = useChat((s) => !!s.gens[c.id])
  const { rename, pin, remove } = useChat.getState()
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(c.title)
  const ref = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  useEffect(() => {
    if (!menu) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [menu])
  return (
    <div className={`conv${active ? ' active' : ''}`} ref={ref}>
      {renaming ? (
        <input className="field" style={{ minHeight: 34, margin: '4px 0' }} value={title} autoFocus aria-label="Nuevo nombre" maxLength={200}
          onChange={(e) => setTitle(e.target.value)} onBlur={() => { setRenaming(false); void rename(c.id, title) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setTitle(c.title); setRenaming(false) } }} />
      ) : (
        <>
          <Link to={`/c/${c.id}`} onClick={onOpen} title={c.title}>{c.title}</Link>
          {busy && <span className="busy" title="Generando respuesta" />}
          <button className="icon-btn more" aria-label={`Opciones de ${c.title}`} onClick={() => setMenu(!menu)}><More /></button>
        </>
      )}
      {menu && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => { setMenu(false); setTitle(c.title); setRenaming(true) }}><Edit className="sm" />Renombrar</button>
          <button role="menuitem" onClick={() => { setMenu(false); void pin(c.id, !c.pinned) }}><Pin className="sm" />{c.pinned ? 'Quitar de fijadas' : 'Fijar'}</button>
          <button role="menuitem" className="danger" onClick={() => { setMenu(false); if (confirm(`¿Eliminar "${c.title}"? Esta acción no se puede deshacer.`)) { void remove(c.id); if (active) nav('/') } }}><Trash className="sm" />Eliminar</button>
        </div>
      )}
    </div>
  )
}

export function Sidebar({ activeId }: { activeId?: string }) {
  const nav = useNavigate()
  const me = useAuth((s) => s.me)!
  const signOut = useAuth((s) => s.signOut)
  const { conversations, convHasMore, convLoading, convLoaded, searchResults } = useChat()
  const { loadConversations, search } = useChat.getState()
  const open = useUi((s) => s.sidebarOpen)
  const setSidebar = useUi((s) => s.setSidebar)
  const setSettings = useUi((s) => s.setSettings)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  useEffect(() => { const t = setTimeout(() => void search(q), 250); return () => clearTimeout(t) }, [q, search])
  const list = searchResults ?? conversations
  const groups = groupConversations(list)
  const close = () => setSidebar(false)
  const initials = (me.display_name ?? me.email ?? '?').slice(0, 1).toUpperCase()

  return (
    <>
      {open && <div className="scrim" onClick={close} aria-hidden="true" />}
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Barra lateral">
        <Link to="/" className="brand" aria-label="Inicio de Cut-real 2" title="Ir al inicio"><img src={`${import.meta.env.BASE_URL}brand/Logo_Original.png`} alt="" />Cut-real <b>2</b></Link>
        <div className="side-actions">
          <button className="btn" onClick={() => { nav('/'); close() }}><Plus className="sm" />Nueva conversación</button>
          <button className="btn" onClick={() => { nav('/calls'); close() }}><span className="studio-nav-icon" aria-hidden="true">◷</span>Registro de llamadas</button>
          <button className="btn" onClick={() => { nav('/studio'); close() }}><span className="studio-nav-icon" aria-hidden="true">{'</>'}</span>Programación</button>
          <div className="side-search">
            <Search className="sm" />
            <input className="field" placeholder="Buscar conversaciones" aria-label="Buscar conversaciones" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <nav className="conv-list" aria-label="Historial">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="conv-group">{g.label}</div>
              {g.items.map((c) => <ConvItem key={c.id} c={c} active={c.id === activeId} onOpen={close} />)}
            </div>
          ))}
          {convLoaded && list.length === 0 && <p className="hint" style={{ padding: '16px 10px', color: 'var(--muted)', fontSize: 14 }}>{searchResults ? 'Sin resultados.' : 'Todavía no tenés conversaciones.'}</p>}
          {!searchResults && convHasMore && <button className="btn ghost sm" style={{ width: '100%', marginTop: 8 }} disabled={convLoading} onClick={() => loadConversations(true)}>Ver más antiguas</button>}
        </nav>
        <div className="side-foot">
          {menu && (
            <div className="menu up" role="menu">
              <button role="menuitem" onClick={() => { setMenu(false); setSettings(true); close() }}><Settings className="sm" />Configuración</button>
              <div className="menu-divider" />
              <Link role="menuitem" className="menu-link" to="/legal" onClick={() => { setMenu(false); close() }}><FileText className="sm" />Términos y privacidad</Link>
              <button type="button" role="menuitem" className="menu-link" onClick={() => { setMenu(false); close(); nav("/inicio") }}><Home className="sm" />Ir al inicio</button>
              {(me.role === 'admin' || me.role === 'owner') && <button role="menuitem" onClick={() => { setMenu(false); nav('/admin') }}><Shield className="sm" />Panel de administración</button>}
              <button role="menuitem" onClick={() => { setMenu(false); void signOut() }}><LogOut className="sm" />Cerrar sesión</button>
            </div>
          )}
          <button className={`profile${menu ? " expanded" : ""}`} onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} aria-label="Abrir menú de cuenta">
            <span className="avatar">{me.avatar_url ? <img src={me.avatar_url} alt="" referrerPolicy="no-referrer" /> : initials}</span>
            <span className="who"><b>{me.display_name ?? 'Mi cuenta'}</b><span>{me.role === 'owner' ? 'Propietario' : me.role === 'admin' ? 'Administrador' : me.email}</span></span>
          </button>
        </div>
      </aside>
    </>
  )
}
