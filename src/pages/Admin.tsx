import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CopyButton } from '../components/Markdown'
import { Back, X } from '../components/icons'
import { callFn } from '../lib/functions'
import { useAuth } from '../store/auth'
import { useUi } from '../store/ui'

const act = <T,>(action: string, p: object = {}) => callFn<T>('admin', { action, ...p })
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const SCOPES = ['models:read', 'chat:write', 'identity:read', 'conversations:read', 'conversations:write']

function useAdmin<T>(action: string, params: object = {}, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try { setData(await act<T>(action, params)); setErr(null) } catch (e) { setErr((e as Error).message) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, JSON.stringify(params), ...deps])
  useEffect(() => { void reload() }, [reload])
  return { data, err, reload }
}

function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}<button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X /></button></h2>{children}
      </div>
    </div>
  )
}
const Err = ({ e }: { e: string | null }) => (e ? <div className="notice error" role="alert"><div className="grow">{e}</div></div> : null)

// ---------------- Resumen ----------------
function Overview() {
  const { data: s, err } = useAdmin<any>('stats')
  if (err) return <Err e={err} />
  if (!s) return <p className="hint">Cargando…</p>
  const max = Math.max(1, ...s.daily.map((d: any) => d.requests))
  const totalRequests = s.by_model.reduce((n: number, m: any) => n + Number(m.requests || 0), 0)
  const totalTokens = s.by_model.reduce((n: number, m: any) => n + Number(m.prompt_tokens || 0) + Number(m.completion_tokens || 0), 0)
  const cards: [string, number][] = [['Usuarios', s.users], ['Activos 24 h', s.active_users_24h], ['Activos 7 días', s.active_users_7d], ['Suspendidos', s.suspended_users], ['Conversaciones', s.conversations], ['Mensajes', s.messages], ['Errores 24 h', s.errors_24h], ['Solicitudes (período)', totalRequests], ['Tokens registrados (período)', totalTokens]]
  return (
    <>
      <div className="stats">{cards.map(([l, v]) => <div className="stat" key={l}><b>{v.toLocaleString('es-AR')}</b><span>{l}</span></div>)}</div>
      <div className="panel"><h3>Actividad diaria (solicitudes; rojo = con errores)</h3><p className="hint">Las solicitudes cuentan llamadas registradas por Cut-real. Los tokens suman entrada + salida durante el período del resumen; no representan el máximo permitido por Groq.</p>
        {s.daily.length ? <div className="bars" aria-label="Actividad diaria">{s.daily.map((d: any) => <i key={d.day} className={d.errors > 0 ? 'err' : ''} style={{ height: `${(d.requests / max) * 100}%` }} title={`${d.day}: ${d.requests} solicitudes, ${d.errors} errores`} />)}</div> : <p className="hint">Sin actividad todavía.</p>}</div>
      <div className="grid2">
        <div className="panel"><h3>Modelos utilizados</h3><table className="t"><thead><tr><th>Modelo</th><th>Solicitudes</th><th>Tokens</th></tr></thead><tbody>
          {s.by_model.map((m: any) => <tr key={m.model}><td>{m.model}</td><td>{m.requests}</td><td>{(Number(m.prompt_tokens) + Number(m.completion_tokens)).toLocaleString('es-AR')}</td></tr>)}
          {!s.by_model.length && <tr><td colSpan={3} className="hint">Sin datos.</td></tr>}</tbody></table></div>
        <div className="panel"><h3>Uso de proveedores</h3><table className="t"><thead><tr><th>Proveedor</th><th>Solicitudes</th><th>Errores</th></tr></thead><tbody>
          {s.by_provider.map((m: any) => <tr key={m.provider}><td>{m.provider}</td><td>{m.requests}</td><td>{m.errors}</td></tr>)}
          {!s.by_provider.length && <tr><td colSpan={3} className="hint">Sin datos.</td></tr>}</tbody></table></div>
      </div>
      <div className="panel"><h3>Errores de integración recientes</h3><table className="t"><thead><tr><th>Fecha</th><th>Tipo</th><th>Proveedor</th><th>Código</th></tr></thead><tbody>
        {s.recent_errors.map((e: any, i: number) => <tr key={i}><td>{fmt(e.created_at)}</td><td>{e.kind}</td><td>{e.provider ?? '—'}</td><td><span className="badge bad">{e.error_code ?? 'error'}</span></td></tr>)}
        {!s.recent_errors.length && <tr><td colSpan={4} className="hint">Sin errores registrados.</td></tr>}</tbody></table></div>
    </>
  )
}

// ---------------- Usuarios ----------------
function Users() {
  const me = useAuth((s) => s.me)!
  const toast = useUi((s) => s.toast)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const { data, err, reload } = useAdmin<any>('users.list', { q, page })
  const [view, setView] = useState<any | null>(null)
  const run = async (p: Promise<unknown>, ok: string) => { try { await p; toast('info', ok); void reload() } catch (e) { toast('error', (e as Error).message) } }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}><input className="field grow" placeholder="Buscar por correo o nombre" aria-label="Buscar usuarios" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} /></div>
      <Err e={err} />
      <div className="panel"><table className="t"><thead><tr><th>Usuario</th><th>Rol</th><th>Último acceso</th><th>Acceso / estado</th><th /></tr></thead><tbody>
        {data?.users.map((u: any) => (
          <tr key={u.user_id}>
            <td><b style={{ fontWeight: 500 }}>{u.display_name ?? '—'}</b><br /><span className="hint">{u.email}</span></td>
            <td><span className={`badge ${u.role !== 'user' ? 'pl' : ''}`}>{u.role === 'owner' ? 'propietario' : u.role === 'admin' ? 'admin' : 'usuario'}</span></td>
            <td>{fmt(u.last_seen_at)}</td>
            <td><div>{u.access_status === 'approved' ? <span className="badge ok">autorizado</span> : u.access_status === 'rejected' ? <span className="badge bad">rechazado</span> : <span className="badge">pendiente</span>}</div><div>{u.suspended ? <span className="badge bad">suspendido</span> : <span className="hint">sin suspensión</span>}</div></td>
            <td><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn sm" onClick={() => setView(u)}>Ver</button>
              {me.role === 'owner' && u.role !== 'owner' && u.user_id !== me.userId && u.access_status !== 'approved' && <button className="btn sm" onClick={() => confirm(`¿Aprobar el acceso de ${u.email}?`) && run(act('users.setAccess', { userId: u.user_id, status: 'approved' }), 'Acceso aprobado.')}>Aprobar acceso</button>}
              {me.role === 'owner' && u.role !== 'owner' && u.user_id !== me.userId && u.access_status !== 'rejected' && <button className="btn danger sm" onClick={() => confirm(`¿Rechazar el acceso de ${u.email}?`) && run(act('users.setAccess', { userId: u.user_id, status: 'rejected' }), 'Solicitud rechazada.')}>Rechazar</button>}
              {me.role === 'owner' && u.role !== 'owner' && u.user_id !== me.userId && u.access_status !== 'pending' && <button className="btn sm" onClick={() => run(act('users.setAccess', { userId: u.user_id, status: 'pending' }), 'Acceso puesto pendiente.')}>Poner pendiente</button>}
              {me.role === 'owner' && u.role !== 'owner' && u.user_id !== me.userId && (
                <button className="btn sm" onClick={() => confirm(u.role === 'admin' ? `¿Revocar permisos de administrador a ${u.email}?` : `¿Promover a ${u.email} como administrador?`) && run(act('users.setRole', { userId: u.user_id, role: u.role === 'admin' ? 'user' : 'admin' }), 'Rol actualizado.')}>{u.role === 'admin' ? 'Revocar admin' : 'Hacer admin'}</button>)}
              {u.role !== 'owner' && u.user_id !== me.userId && (u.suspended
                ? <button className="btn sm" onClick={() => run(act('users.restore', { userId: u.user_id }), 'Cuenta restaurada.')}>Restaurar</button>
                : <button className="btn danger sm" onClick={() => { const reason = prompt('Motivo de la suspensión (obligatorio):'); if (reason) void run(act('users.suspend', { userId: u.user_id, reason }), 'Cuenta suspendida.') }}>Suspender</button>)}
            </div></td>
          </tr>))}
        {data && !data.users.length && <tr><td colSpan={5} className="hint">Sin resultados.</td></tr>}
      </tbody></table></div>
      {data && <div className="row"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span className="hint">Página {page + 1} · {data.total} usuarios</span><button className="btn sm" disabled={(page + 1) * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
      {view && <UserDetail u={view} onClose={() => setView(null)} />}
    </>
  )
}

function UserDetail({ u, onClose }: { u: any; onClose(): void }) {
  const toast = useUi((s) => s.toast)
  const { data } = useAdmin<any>('users.get', { userId: u.user_id })
  const [reason, setReason] = useState('')
  const [convs, setConvs] = useState<any[] | null>(null)
  const [thread, setThread] = useState<any | null>(null)
  const go = async (p: Promise<void>) => { try { await p } catch (e) { toast('error', (e as Error).message) } }
  return (
    <Modal title={u.display_name ?? u.email} onClose={onClose} wide>
      <p className="hint">{u.email} · alta {fmt(u.created_at)}</p>{data?.suspended && <div className="notice error" style={{marginTop:10}}>Motivo de suspensión: {data.suspended_reason || 'No especificado'}</div>}<p className="hint">Acceso: {data?.access_status === 'approved' ? 'Autorizado' : data?.access_status === 'rejected' ? 'Rechazado' : 'Pendiente'}</p>
      {data && <div className="stats" style={{ marginTop: 12 }}><div className="stat"><b>{data.conversations}</b><span>Conversaciones</span></div><div className="stat"><b>{data.messages}</b><span>Mensajes</span></div></div>}
      <h3>Acceso a conversaciones (auditado)</h3>
      <p className="hint">Solo para soporte o moderación legítimos. Cada consulta queda registrada con tu usuario y el motivo.</p>
      {!convs && <div className="row" style={{ marginTop: 10 }}>
        <input className="field grow" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (mín. 5 caracteres)" aria-label="Motivo del acceso" />
        <button className="btn" disabled={reason.trim().length < 5} onClick={() => go(act<any>('conversations.list', { userId: u.user_id, reason }).then((r) => setConvs(r.conversations)))}>Ver conversaciones</button></div>}
      {convs && !thread && <div className="panel" style={{ marginTop: 10 }}><table className="t"><tbody>
        {convs.map((c) => <tr key={c.id}><td>{c.title}</td><td>{fmt(c.last_message_at)}</td><td><button className="btn sm" onClick={() => go(act<any>('conversations.messages', { conversationId: c.id, reason }).then(setThread))}>Abrir</button></td></tr>)}
        {!convs.length && <tr><td className="hint">Sin conversaciones.</td></tr>}</tbody></table></div>}
      {thread && <div className="panel" style={{ marginTop: 10 }}>
        <div className="row"><button className="btn sm" onClick={() => setThread(null)}><Back className="sm" />Volver</button><b>{thread.title}</b></div>
        {thread.messages.map((m: any) => <p key={m.id} style={{ margin: '10px 0', whiteSpace: 'pre-wrap', color: m.role === 'user' ? 'var(--text)' : 'var(--muted)' }}><b>{m.role === 'user' ? 'Usuario' : 'IA'}:</b> {m.content}</p>)}</div>}
    </Modal>
  )
}

// ---------------- Proveedores ----------------
function Providers() {
  const toast = useUi((s) => s.toast)
  const { data, err, reload } = useAdmin<any>('providers.list')
  const [edit, setEdit] = useState<{ kind: 'provider' | 'model'; row: any } | null>(null)
  const save = async (action: string, row: any) => { try { await act(action, row); toast('info', 'Guardado.'); setEdit(null); void reload() } catch (e) { toast('error', (e as Error).message) } }
  const [providerUsage, setProviderUsage] = useState<any | null>(null)
  const [usageBusy, setUsageBusy] = useState(false)
  const blankP = { slug: '', name: '', base_url: 'https://', api_key_env: '', enabled: true, rpm_limit: '', daily_request_limit: '' }
  const loadProviderUsage = async () => { setUsageBusy(true); try { setProviderUsage(await act<any>('providers.usage')) } catch (e) { toast('error', (e as Error).message) } finally { setUsageBusy(false) } }
  return (
    <>
      <Err e={err} />
      <div className="panel">
        <div className="row"><h3 style={{ margin: 0 }}>Consumo y límites de API</h3><span className="grow" /><button className="btn sm" disabled={usageBusy} onClick={() => void loadProviderUsage()}>{usageBusy ? 'Consultando…' : 'Actualizar consumo'}</button></div>
        <p className="hint">Los datos se consultan desde el servidor. Las claves nunca se envían al navegador.</p>
        {providerUsage ? <div className="grid2" style={{ marginTop: 12 }}>
          <div><b>Groq</b><p className="hint">{providerUsage.groq?.requests_24h ?? 0} solicitudes registradas en 24 h · {(providerUsage.groq?.tokens_24h ?? 0).toLocaleString('es-AR')} tokens en 24 h · {(providerUsage.groq?.tokens_30d ?? 0).toLocaleString('es-AR')} tokens en 30 días.</p><p className="hint">Límite configurado en Cut-real: {providerUsage.groq?.app_rpm_limit ?? 'sin límite'}/min y {providerUsage.groq?.app_daily_limit ?? 'sin límite'}/día. El máximo real de Groq y sus reinicios exactos no se pueden deducir de este registro; consultá el panel de límites de Groq.</p></div>
          <div><b>Tavily</b>{providerUsage.tavily?.configured ? <><p className="hint">Plan: {providerUsage.tavily.account?.current_plan ?? '—'} · Consumo del plan: {(providerUsage.tavily.account?.plan_usage ?? 0).toLocaleString('es-AR')} / {(providerUsage.tavily.account?.plan_limit ?? 0).toLocaleString('es-AR')} créditos.</p><p className="hint">Clave actual: {(providerUsage.tavily.key?.usage ?? 0).toLocaleString('es-AR')} / {providerUsage.tavily.key?.limit == null ? 'sin límite propio' : Number(providerUsage.tavily.key.limit).toLocaleString('es-AR')} créditos. Reinicio del plan: primer día del mes.</p></> : <p className="hint">No se encontró una clave de búsqueda configurada en Supabase.</p>}</div>
        </div> : <p className="hint" style={{ marginTop: 10 }}>Todavía no consultaste los proveedores.</p>}
      </div>
      <div className="row" style={{ marginBottom: 12 }}><button className="btn" onClick={() => setEdit({ kind: 'provider', row: blankP })}>Agregar proveedor</button></div>
      {data?.providers.map((p: any) => (
        <div className="panel" key={p.id}>
          <div className="row"><h3 style={{ margin: 0 }}>{p.name}</h3>
            <span className={`badge ${p.enabled ? 'ok' : ''}`}>{p.enabled ? 'habilitado' : 'deshabilitado'}</span>
            <span className={`badge ${p.key_configured ? 'ok' : 'bad'}`}>{p.key_configured ? `clave ${p.api_key_env} configurada` : `falta ${p.api_key_env}`}</span>
            <span className="grow" /><button className="btn sm" onClick={() => setEdit({ kind: 'provider', row: p })}>Configurar</button>
            <button className="btn sm" onClick={() => setEdit({ kind: 'model', row: { provider_id: p.id, model_key: '', display_name: '', enabled: true, supports_vision: false, context_window: '', max_output_tokens: 4096, user_rpm_limit: 20 } })}>Agregar modelo</button>
            <button className="btn danger sm" onClick={async () => { if (confirm(`¿Eliminar el proveedor "${p.name}"? Solo se permite si ya no tiene modelos.`)) { try { await act('providers.delete', { id: p.id }); toast('info', 'Proveedor eliminado.'); void reload() } catch (e) { toast('error', (e as Error).message) } } }}>Eliminar</button></div>
          <p className="hint" style={{ margin: '6px 0 10px' }}>{p.base_url} · límite {p.rpm_limit ?? '∞'}/min · {p.daily_request_limit ?? '∞'}/día</p>
          <table className="t"><thead><tr><th>Modelo</th><th>ID</th><th>Visión</th><th>Límite/usuario</th><th>Estado</th><th /></tr></thead><tbody>
            {p.models.filter((m: any) => !/^llama-/i.test(m.model_key)).map((m: any) => (<tr key={m.id}><td>{m.display_name}</td><td className="hint">{m.model_key}</td><td>{m.supports_vision ? 'sí' : 'no'}</td><td>{m.user_rpm_limit}/min</td>
              <td><label className="chk"><label><input type="checkbox" checked={m.enabled} onChange={(e) => save('models.save', { ...m, enabled: e.target.checked })} /> {m.enabled ? 'habilitado' : 'oculto'}</label></label></td>
              <td><div className="row" style={{ gap: 5 }}><button className="btn sm" onClick={() => setEdit({ kind: 'model', row: m })}>Editar</button><button className="btn danger sm" onClick={async () => { if (confirm(`¿Eliminar el modelo "${m.display_name}"? Los registros históricos conservarán el uso sin asociarlo al modelo.`)) { try { await act('models.delete', { id: m.id }); toast('info', 'Modelo eliminado.'); void reload() } catch (e) { toast('error', (e as Error).message) } } }}>Eliminar</button></div></td></tr>))}
          </tbody></table>
        </div>))}
      <p className="hint">Las claves API de cada proveedor se guardan como secretos del servidor (no se muestran ni se editan acá). Ver docs/DEPLOY.md.</p>
      {edit && <EditForm kind={edit.kind} row={edit.row} onClose={() => setEdit(null)} onSave={(r) => save(edit.kind === 'provider' ? 'providers.save' : 'models.save', r)} />}
    </>
  )
}

function EditForm({ kind, row, onClose, onSave }: { kind: 'provider' | 'model'; row: any; onClose(): void; onSave(r: any): void }) {
  const [r, setR] = useState<any>(row)
  const set = (k: string, v: unknown) => setR({ ...r, [k]: v })
  const F = ({ k, label, type = 'text', ph }: { k: string; label: string; type?: string; ph?: string }) => (<div><label className="lbl">{label}</label><input className="field" type={type} placeholder={ph} value={r[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></div>)
  return (
    <Modal title={kind === 'provider' ? (r.id ? 'Configurar proveedor' : 'Nuevo proveedor') : (r.id ? 'Editar modelo' : 'Nuevo modelo')} onClose={onClose}>
      {kind === 'provider' ? (<div className="grid2">
        <F k="slug" label="Identificador (slug)" ph="groq" /><F k="name" label="Nombre" />
        <F k="base_url" label="URL base OpenAI-compatible" /><F k="api_key_env" label="Nombre de la variable secreta" ph="MI_PROVEEDOR_API_KEY" />
        <F k="rpm_limit" label="Límite por minuto (vacío = sin límite)" type="number" /><F k="daily_request_limit" label="Límite diario" type="number" /></div>) : (<div className="grid2">
        <F k="model_key" label="ID del modelo en el proveedor" /><F k="display_name" label="Nombre visible" />
        <F k="context_window" label="Ventana de contexto" type="number" /><F k="max_output_tokens" label="Máx. tokens de salida" type="number" />
        <F k="user_rpm_limit" label="Límite por usuario/min" type="number" /><F k="sort_order" label="Orden" type="number" /></div>)}
      <label className="switch"><span>Habilitado</span><input type="checkbox" checked={!!r.enabled} onChange={(e) => set('enabled', e.target.checked)} /></label>
      {kind === 'model' && <label className="switch"><span>Acepta imágenes (visión)</span><input type="checkbox" checked={!!r.supports_vision} onChange={(e) => set('supports_vision', e.target.checked)} /></label>}
      <div className="row end"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={() => onSave(r)}>Guardar</button></div>
    </Modal>
  )
}

// ---------------- API keys ----------------
function Keys() {
  const toast = useUi((s) => s.toast)
  const { data, err, reload } = useAdmin<any>('keys.list')
  const [form, setForm] = useState({ name: '', scopes: ['models:read', 'chat:write'], rate: 30, days: '' })
  const [secret, setSecret] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ k: any; d: any } | null>(null)
  const create = async () => {
    try {
      const r = await act<any>('keys.create', { name: form.name, scopes: form.scopes, rate_limit_per_minute: form.rate, expires_in_days: form.days || null })
      setSecret(r.secret); setForm({ ...form, name: '' }); void reload()
    } catch (e) { toast('error', (e as Error).message) }
  }
  return (
    <>
      <Err e={err} />
      <div className="panel"><h3>Nueva API key</h3>
        <div className="grid2"><div><label className="lbl">Nombre</label><input className="field" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Memory Task (producción)" /></div>
          <div className="grid2"><div><label className="lbl">Solicitudes/min</label><input className="field" type="number" min={1} value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} /></div>
            <div><label className="lbl">Vence en (días)</label><input className="field" type="number" min={1} placeholder="nunca" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></div></div></div>
        <label className="lbl">Permisos (scopes)</label>
        <div className="chk">{SCOPES.map((s) => <label key={s}><input type="checkbox" checked={form.scopes.includes(s)} onChange={(e) => setForm({ ...form, scopes: e.target.checked ? [...form.scopes, s] : form.scopes.filter((x) => x !== s) })} />{s}</label>)}</div>
        <div className="row end"><button className="btn primary" disabled={!form.name.trim() || !form.scopes.length} onClick={create}>Crear clave</button></div></div>
      <div className="panel"><table className="t"><thead><tr><th>Nombre</th><th>Prefijo</th><th>Permisos</th><th>Creada</th><th>Último uso</th><th>Estado</th><th /></tr></thead><tbody>
        {data?.keys.map((k: any) => (<tr key={k.id}><td>{k.name}</td><td className="hint">{k.key_prefix}…</td><td className="hint">{k.scopes.join(', ')}</td><td>{fmt(k.created_at)}</td><td>{fmt(k.last_used_at)}</td>
          <td>{k.revoked_at ? <span className="badge bad">revocada</span> : k.expires_at && new Date(k.expires_at) < new Date() ? <span className="badge bad">vencida</span> : <span className="badge ok">activa</span>}</td>
          <td><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}><button className="btn sm" onClick={async () => setUsage({ k, d: await act('keys.usage', { id: k.id }) })}>Actividad</button>
            {!k.revoked_at && <button className="btn danger sm" onClick={async () => { if (confirm(`¿Revocar "${k.name}"? Las aplicaciones que la usan dejarán de funcionar.`)) { await act('keys.revoke', { id: k.id }); void reload() } }}>Revocar</button>}
            <button className="btn danger sm" onClick={async () => { if (confirm(`¿Eliminar definitivamente la API key "${k.name}"? No se podrá recuperar.`)) { try { await act('keys.delete', { id: k.id }); toast('info', 'API key eliminada.'); void reload() } catch (e) { toast('error', (e as Error).message) } } }}>Eliminar</button></div></td></tr>))}
        {data && !data.keys.length && <tr><td colSpan={7} className="hint">Todavía no creaste claves.</td></tr>}</tbody></table></div>
      {secret && <Modal title="Copiá tu clave ahora" onClose={() => setSecret(null)}><p className="hint">Es la única vez que se muestra completa. En la base solo se guarda un hash.</p><div className="secret">{secret}</div><div className="row end"><CopyButton text={secret} label="Copiar clave" /><button className="btn primary" onClick={() => setSecret(null)}>Ya la guardé</button></div></Modal>}
      {usage && <Modal title={`Actividad · ${usage.k.name}`} onClose={() => setUsage(null)} wide><p className="hint">{usage.d.requests_24h} solicitudes en las últimas 24 h.</p><table className="t"><thead><tr><th>Fecha</th><th>Estado</th><th>Latencia</th><th>Tokens</th></tr></thead><tbody>
        {usage.d.events.map((e: any, i: number) => <tr key={i}><td>{fmt(e.created_at)}</td><td><span className={`badge ${e.status === 'ok' ? 'ok' : 'bad'}`}>{e.status}{e.error_code ? ` · ${e.error_code}` : ''}</span></td><td>{e.latency_ms ?? '—'} ms</td><td>{(e.prompt_tokens ?? 0) + (e.completion_tokens ?? 0)}</td></tr>)}
        {!usage.d.events.length && <tr><td colSpan={4} className="hint">Sin actividad.</td></tr>}</tbody></table></Modal>}
    </>
  )
}

// ---------------- Integraciones y auditoría ----------------
function MemoryTaskPanel({ integration }: { integration: any }) {
  const toast = useUi((s) => s.toast)
  const [status, setStatus] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [keyPair, setKeyPair] = useState<any>(null)
  const [endpoint, setEndpoint] = useState('')
  const [appId, setAppId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const refresh = useCallback(async () => {
    try { setStatus(await act<any>('integrations.memory_task_status')) }
    catch (e) { toast('error', (e as Error).message) }
  }, [toast])
  useEffect(() => { void refresh() }, [refresh])
  const generate = async () => {
    if (keyPair && !confirm('Ya hay un par generado en esta sesión. ¿Querés reemplazarlo? La clave privada anterior dejará de estar disponible.')) return
    setBusy(true)
    try { setKeyPair(await act<any>('integrations.memory_task_generate_identity')); toast('info', 'Par de identidad generado. Guardá la clave privada en el archivo de secretos.') }
    catch (e) { toast('error', (e as Error).message) }
    finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true)
    try { const result = await act<any>('integrations.memory_task_test'); toast('info', result.message); await refresh() }
    catch (e) { toast('error', (e as Error).message) }
    finally { setBusy(false) }
  }
  const downloadSecrets = () => {
    if (!endpoint.trim() || !appId.trim() || !apiKey.trim() || !keyPair?.privateJwk) {
      toast('error', 'Completá URL, ID, API key y generá o recuperá el par de identidad.')
      return
    }
    let parsed: URL
    try { parsed = new URL(endpoint.trim()) } catch { toast('error', 'La URL de Memory Task no es válida.'); return }
    if (parsed.protocol !== 'https:' || !parsed.pathname.endsWith('/functions/v1/service-api')) {
      toast('error', 'Usá la URL HTTPS completa que termina en /functions/v1/service-api.')
      return
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId.trim())) {
      toast('error', 'El ID de aplicación debe ser un UUID.')
      return
    }
    const privateJwk = JSON.stringify(keyPair.privateJwk)
    const env = [
      'MEMORY_TASK_API_URL=' + endpoint.trim(),
      'MEMORY_TASK_API_KEY=' + apiKey.trim(),
      'MEMORY_TASK_APP_ID=' + appId.trim(),
      "MEMORY_TASK_IDENTITY_PRIVATE_JWK='" + privateJwk + "'",
      '',
    ].join('\n')
    const blob = new Blob([env], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'memory-task-secrets.env'; a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast('info', 'Archivo generado. Guardalo dentro del repositorio de Cut-real y ejecutá el comando indicado abajo.')
  }
  const send = async () => {
    setBusy(true)
    try {
      await act<any>('integrations.memory_task_send', { title, content })
      toast('info', 'La información se guardó en Memory Task.')
      setTitle(''); setContent('')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setBusy(false) }
  }
  const publicJwkText = keyPair ? JSON.stringify(keyPair.publicJwk, null, 2) : ''
  return (
    <div className="panel">
      <div className="row"><h3 style={{ margin: 0 }}>Conexión con Memory Task</h3><span className="grow" />
        <span className={`badge ${status?.configured ? 'ok' : 'bad'}`}>{status?.configured ? 'servidor configurado' : 'falta configuración'}</span>
        <button className="btn sm" onClick={() => void refresh()}>Actualizar estado</button>
      </div>
      <p className="hint">Esta sección conecta Cut-real con la cuenta de servicio de Memory Task. Las credenciales se usan exclusivamente en el servidor de Cut-real.</p>
      <div className="grid2">
        <div><strong>URL de API</strong><p className="hint">{status?.endpointConfigured ? 'Configurada en el servidor' : 'Pendiente'}</p></div>
        <div><strong>API key</strong><p className="hint">{status?.apiKeyConfigured ? 'Configurada en el servidor' : 'Pendiente'}</p></div>
        <div><strong>ID de aplicación</strong><p className="hint">{status?.appIdConfigured ? 'Configurado en el servidor' : 'Pendiente'}</p></div>
        <div><strong>Identidad ES256</strong><p className="hint">{status?.identityKeyConfigured ? 'Configurada en el servidor' : 'Pendiente'}</p></div>
        <div><strong>Integración</strong><p className="hint">{integration?.status === 'enabled' ? 'Habilitada' : 'Deshabilitada: habilitala en esta pantalla'}</p></div>
        <div><strong>Autorización personal</strong><p className="hint">{status?.authorized ? 'Concedida para esta cuenta' : 'No concedida (necesaria para enviar notas desde aquí)'}</p></div>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <strong>Vinculación guiada</strong>
        <ol className="hint">
          <li>En Memory Task → Cuenta de servicio → Conectar Cut-real, elegí la aplicación Cut-real.</li>
          <li>Si necesitás una identidad nueva, generá un par ES256 abajo y pegá <b>solo la clave pública</b> en Memory Task. Si ya registraste otra clave pública, este par nuevo la reemplaza para esa aplicación.</li>
          <li>En Memory Task generá una clave API con permisos de lectura y escritura de registros. Copiá la URL, el ID de aplicación y la clave API.</li>
          <li>Completá esos tres datos aquí y descargá el archivo de secretos. La clave privada se incorpora automáticamente.</li>
          <li>Guardá el archivo en la carpeta raíz del repositorio de Cut-real y ejecutá el comando que aparece debajo.</li>
          <li>Volvé aquí, actualizá el estado y probá la conexión.</li>
        </ol>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" disabled={busy} onClick={() => void generate()}>Generar par ES256</button>
          <span className="hint">No generes un par nuevo si ya tenés el privado correspondiente a la identidad registrada.</span>
        </div>
        {keyPair && <div style={{ marginTop: 12 }}>
          <label className="lbl">Clave pública JWK · pegar en Memory Task</label>
          <pre className="secret" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{publicJwkText}</pre>
          <CopyButton text={JSON.stringify(keyPair.publicJwk)} label="Copiar clave pública" />
          <p className="hint">La clave privada no se pega en Memory Task. Se incorpora al archivo local de secretos de Cut-real.</p>
        </div>}
        <div style={{ marginTop: 14 }}>
          <label className="lbl">URL de API de Memory Task</label>
          <input className="field" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://TU_PROYECTO.supabase.co/functions/v1/service-api" autoComplete="off" />
          <label className="lbl">ID de aplicación (App ID)</label>
          <input className="field" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="UUID de la aplicación Cut-real en Memory Task" autoComplete="off" />
          <label className="lbl">Clave API de Memory Task</label>
          <input className="field" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="mt_live_…" autoComplete="new-password" />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={!keyPair?.privateJwk || !endpoint.trim() || !appId.trim() || !apiKey.trim()} onClick={downloadSecrets}>Descargar archivo de secretos</button>
          </div>
          <p className="hint">El archivo contiene credenciales privadas. No lo subas a GitHub ni lo envíes por chat. Después de desplegar los secretos, borrá el archivo local.</p>
          <div className="notice" style={{ marginTop: 10 }}>
            <b>Comando (desde la carpeta raíz de Cut-real):</b>
            <code style={{ display: 'block', overflowWrap: 'anywhere', marginTop: 6 }}>npx supabase secrets set --env-file memory-task-secrets.env</code>
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy || !status?.configured || integration?.status !== 'enabled'} onClick={() => void test()}>Probar conexión</button>
        <span className="hint">La prueba guarda y elimina un registro temporal en Memory Task.</span>
      </div>
      <div style={{ marginTop: 16 }}>
        <strong>Enviar información a Memory Task</strong>
        <label className="lbl">Título</label>
        <input className="field" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Nota de Cut-real" />
        <label className="lbl">Texto o información</label>
        <textarea className="field" rows={6} maxLength={20000} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escribí aquí la información que querés almacenar en Memory Task." />
        <div className="row end"><span className="hint">{content.length}/20000 caracteres</span><button className="btn primary" disabled={busy || !status?.configured || !status?.authorized || integration?.status !== 'enabled' || !title.trim() || !content.trim()} onClick={() => void send()}>Enviar y guardar</button></div>
        {integration?.status !== 'enabled' && <p className="hint">Habilitá primero la integración Memory Task en la lista de integraciones.</p>}
        {integration?.status === 'enabled' && status?.configured && !status?.authorized && <p className="hint">Para enviar notas desde esta pantalla, autorizá Memory Task desde Configuración → Integraciones autorizadas y marcá records:write.</p>}
      </div>
    </div>
  )
}

function Integrations() {
  const toast = useUi((s) => s.toast)
  const { data, err, reload } = useAdmin<any>('integrations.list')
  const save = async (i: any, patch: object) => { try { await act('integrations.save', { id: i.id, status: i.status, allowed_scopes: i.allowed_scopes, ...patch }); void reload() } catch (e) { toast('error', (e as Error).message) } }
  return (
    <>
      <Err e={err} />
      <p className="hint" style={{ marginBottom: 12 }}>{data?.active_grants ?? 0} autorizaciones de usuarios activas. Cada usuario puede revocar las suyas desde Configuración.</p>
      {data?.integrations.map((i: any) => (
        <div key={i.id}>
          <div className="panel"><div className="row"><h3 style={{ margin: 0 }}>{i.name}</h3><span className={`badge ${i.status === 'enabled' ? 'ok' : ''}`}>{i.status === 'enabled' ? 'habilitada' : 'deshabilitada'}</span><span className="grow" />
            <button className="btn sm" onClick={() => save(i, { status: i.status === 'enabled' ? 'disabled' : 'enabled' })}>{i.status === 'enabled' ? 'Deshabilitar' : 'Habilitar'}</button></div>
            <label className="lbl">Permisos que esta integración puede solicitar</label>
            <div className="chk">{SCOPES.map((s) => <label key={s}><input type="checkbox" checked={i.allowed_scopes.includes(s)} onChange={(e) => save(i, { allowed_scopes: e.target.checked ? [...i.allowed_scopes, s] : i.allowed_scopes.filter((x: string) => x !== s) })} />{s}</label>)}</div>
          </div>
        </div>))}
    </>
  )
}


function MemoryTaskTab() {
  const toast = useUi((s) => s.toast)
  const { data, err, reload } = useAdmin<any>('integrations.list')
  const integration = data?.integrations.find((item: any) => item.slug === 'memory-task')
  const toggle = async () => {
    if (!integration) return
    try {
      await act('integrations.save', {
        id: integration.id,
        status: integration.status === 'enabled' ? 'disabled' : 'enabled',
        allowed_scopes: integration.allowed_scopes,
      })
      toast('info', integration.status === 'enabled' ? 'Integración deshabilitada.' : 'Integración habilitada.')
      void reload()
    } catch (e) { toast('error', (e as Error).message) }
  }
  return (
    <>
      <Err e={err} />
      {integration ? <>
        <div className="panel">
          <div className="row"><h3 style={{ margin: 0 }}>Memory Task</h3><span className="grow" /><span className={`badge ${integration.status === 'enabled' ? 'ok' : 'bad'}`}>{integration.status === 'enabled' ? 'habilitada' : 'deshabilitada'}</span>
            <button className="btn sm" onClick={() => void toggle()}>{integration.status === 'enabled' ? 'Deshabilitar' : 'Habilitar'}</button>
          </div>
          <p className="hint">Configurá la conexión de Cut-real con tu cuenta de Memory Task, comprobá las credenciales y enviá información de prueba.</p>
        </div>
        <MemoryTaskPanel integration={integration} />
      </> : data ? <div className="notice error">No se encontró la integración Memory Task en la configuración de Cut-real. Revisá la migración de datos iniciales.</div> : <p className="hint">Cargando integración…</p>}
    </>
  )
}

function UsageHistory() {
  const toast = useUi((s) => s.toast)
  const [page, setPage] = useState(0)
  const { data, err, reload } = useAdmin<any>('usage.list', { page })
  const clear = async () => {
    if (!confirm('Esto eliminará todos los registros de llamadas y uso. La auditoría administrativa se conservará. ¿Continuar?')) return
    try {
      const r = await act<any>('usage.clear', { confirm: 'BORRAR REGISTROS DE LLAMADAS' })
      toast('info', `Se eliminaron ${r.deleted} registros.`)
      setPage(0)
      void reload()
    } catch (e) { toast('error', (e as Error).message) }
  }
  return <>
    <Err e={err} />
    <div className="panel">
      <div className="row"><div className="grow"><h3 style={{margin:0}}>Historial de llamadas</h3><p className="hint">Registros técnicos de uso, errores y tokens. No incluye el contenido de los mensajes.</p></div><button className="btn danger sm" onClick={() => void clear()} disabled={!data?.total}>Borrar todos</button></div>
      <p className="hint">{data?.total ?? '…'} registros en total.</p>
      <table className="t"><thead><tr><th>Fecha</th><th>Tipo</th><th>Estado</th><th>Tokens</th><th>Latencia</th><th>Error</th></tr></thead><tbody>
        {data?.events.map((e:any)=><tr key={e.id}><td>{fmt(e.created_at)}</td><td>{e.kind}</td><td>{e.status}</td><td>{(e.prompt_tokens??0)+(e.completion_tokens??0)}</td><td>{e.latency_ms==null?'—':e.latency_ms+' ms'}</td><td>{e.error_code??'—'}</td></tr>)}
        {data && !data.events.length && <tr><td colSpan={6} className="hint">Sin registros.</td></tr>}
      </tbody></table>
    </div>
    {data && <div className="row"><button className="btn sm" disabled={page===0} onClick={()=>setPage(page-1)}>Anterior</button><span className="hint">Página {page+1} · {data.total} registros</span><button className="btn sm" disabled={(page+1)*50>=data.total} onClick={()=>setPage(page+1)}>Siguiente</button></div>}
  </>
}

function Audit() {
  const [page, setPage] = useState(0)
  const { data, err } = useAdmin<any>('audit.list', { page })
  return (
    <>
      <Err e={err} />
      <div className="panel"><table className="t"><thead><tr><th>Fecha</th><th>Acción</th><th>Objetivo</th><th>Motivo</th></tr></thead><tbody>
        {data?.logs.map((l: any) => <tr key={l.id}><td>{fmt(l.created_at)}</td><td><span className="badge pl">{l.action}</span></td><td className="hint">{l.target_type ? `${l.target_type}:${String(l.target_id).slice(0, 8)}` : '—'}</td><td>{l.reason ?? '—'}</td></tr>)}
        {data && !data.logs.length && <tr><td colSpan={4} className="hint">Sin registros.</td></tr>}</tbody></table></div>
      {data && <div className="row"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span className="hint">Página {page + 1} · {data.total} registros</span><button className="btn sm" disabled={(page + 1) * 30 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
    </>
  )
}

const TABS = [['overview', 'Resumen', Overview], ['users', 'Usuarios', Users], ['providers', 'Proveedores y modelos', Providers], ['keys', 'API keys', Keys], ['integrations', 'Integraciones', Integrations], ['memory-task', 'Memory Task', MemoryTaskTab], ['usage', 'Llamadas', UsageHistory], ['audit', 'Auditoría', Audit]] as const

export default function Admin() {
  const nav = useNavigate()
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('overview')
  const Active = TABS.find((t) => t[0] === tab)![2]
  return (
    <div className="admin">
      <div className="admin-head"><button className="icon-btn" onClick={() => nav('/')} aria-label="Volver al chat"><Back /></button><img src={`${import.meta.env.BASE_URL}brand/Logo_Original.png`} alt="" width={28} height={28} /><h1 style={{ fontSize: 17 }}>Administración</h1></div>
      <div className="tabs" role="tablist">{TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}</div>
      <div className="admin-body"><Active /></div>
    </div>
  )
}
