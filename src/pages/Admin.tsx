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
  const cards: [string, number][] = [['Usuarios', s.users], ['Activos 24 h', s.active_users_24h], ['Activos 7 días', s.active_users_7d], ['Suspendidos', s.suspended_users], ['Conversaciones', s.conversations], ['Mensajes', s.messages], ['Errores 24 h', s.errors_24h]]
  return (
    <>
      <div className="stats">{cards.map(([l, v]) => <div className="stat" key={l}><b>{v.toLocaleString('es-AR')}</b><span>{l}</span></div>)}</div>
      <div className="panel"><h3>Actividad diaria (solicitudes; rojo = con errores)</h3>
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
      <div className="panel"><table className="t"><thead><tr><th>Usuario</th><th>Rol</th><th>Último acceso</th><th>Estado</th><th /></tr></thead><tbody>
        {data?.users.map((u: any) => (
          <tr key={u.user_id}>
            <td><b style={{ fontWeight: 500 }}>{u.display_name ?? '—'}</b><br /><span className="hint">{u.email}</span></td>
            <td><span className={`badge ${u.role !== 'user' ? 'pl' : ''}`}>{u.role === 'owner' ? 'propietario' : u.role === 'admin' ? 'admin' : 'usuario'}</span></td>
            <td>{fmt(u.last_seen_at)}</td>
            <td>{u.suspended ? <span className="badge bad">suspendido</span> : <span className="badge ok">activo</span>}</td>
            <td><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn sm" onClick={() => setView(u)}>Ver</button>
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
      <p className="hint">{u.email} · alta {fmt(u.created_at)}</p>
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
  const blankP = { slug: '', name: '', base_url: 'https://', api_key_env: '', enabled: true, rpm_limit: '', daily_request_limit: '' }
  return (
    <>
      <Err e={err} />
      <div className="row" style={{ marginBottom: 12 }}><button className="btn" onClick={() => setEdit({ kind: 'provider', row: blankP })}>Agregar proveedor</button></div>
      {data?.providers.map((p: any) => (
        <div className="panel" key={p.id}>
          <div className="row"><h3 style={{ margin: 0 }}>{p.name}</h3>
            <span className={`badge ${p.enabled ? 'ok' : ''}`}>{p.enabled ? 'habilitado' : 'deshabilitado'}</span>
            <span className={`badge ${p.key_configured ? 'ok' : 'bad'}`}>{p.key_configured ? `clave ${p.api_key_env} configurada` : `falta ${p.api_key_env}`}</span>
            <span className="grow" /><button className="btn sm" onClick={() => setEdit({ kind: 'provider', row: p })}>Configurar</button>
            <button className="btn sm" onClick={() => setEdit({ kind: 'model', row: { provider_id: p.id, model_key: '', display_name: '', enabled: true, supports_vision: false, context_window: '', max_output_tokens: 4096, user_rpm_limit: 20 } })}>Agregar modelo</button></div>
          <p className="hint" style={{ margin: '6px 0 10px' }}>{p.base_url} · límite {p.rpm_limit ?? '∞'}/min · {p.daily_request_limit ?? '∞'}/día</p>
          <table className="t"><thead><tr><th>Modelo</th><th>ID</th><th>Visión</th><th>Límite/usuario</th><th>Estado</th><th /></tr></thead><tbody>
            {p.models.map((m: any) => (<tr key={m.id}><td>{m.display_name}</td><td className="hint">{m.model_key}</td><td>{m.supports_vision ? 'sí' : 'no'}</td><td>{m.user_rpm_limit}/min</td>
              <td><label className="chk"><label><input type="checkbox" checked={m.enabled} onChange={(e) => save('models.save', { ...m, enabled: e.target.checked })} /> {m.enabled ? 'habilitado' : 'oculto'}</label></label></td>
              <td><button className="btn sm" onClick={() => setEdit({ kind: 'model', row: m })}>Editar</button></td></tr>))}
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
            {!k.revoked_at && <button className="btn danger sm" onClick={async () => { if (confirm(`¿Revocar "${k.name}"? Las aplicaciones que la usan dejarán de funcionar.`)) { await act('keys.revoke', { id: k.id }); void reload() } }}>Revocar</button>}</div></td></tr>))}
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
  const refresh = useCallback(async () => {
    try { setStatus(await act<any>('integrations.memory_task_status')) }
    catch (e) { toast('error', (e as Error).message) }
  }, [toast])
  useEffect(() => { void refresh() }, [refresh])
  const generate = async () => {
    setBusy(true)
    try { setKeyPair(await act<any>('integrations.memory_task_generate_identity')); toast('success', 'Par de identidad generado. Guardá la clave privada antes de cerrar esta pantalla.') }
    catch (e) { toast('error', (e as Error).message) }
    finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true)
    try { const result = await act<any>('integrations.memory_task_test'); toast('success', result.message); await refresh() }
    catch (e) { toast('error', (e as Error).message) }
    finally { setBusy(false) }
  }
  const send = async () => {
    setBusy(true)
    try {
      await act<any>('integrations.memory_task_send', { title, content })
      toast('success', 'La información se guardó en Memory Task.')
      setTitle(''); setContent('')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <div className="panel">
      <div className="row"><h3 style={{ margin: 0 }}>Conexión con Memory Task</h3><span className="grow" />
        <span className={`badge ${status?.configured ? 'ok' : 'bad'}`}>{status?.configured ? 'credenciales configuradas' : 'configuración pendiente'}</span>
        <button className="btn sm" onClick={() => void refresh()}>Actualizar estado</button>
      </div>
      <p className="hint">La comunicación se realiza desde el servidor de Cut-real. La API key y la clave privada nunca se envían al navegador.</p>
      <div className="grid2">
        <div><strong>Endpoint</strong><p className="hint">{status?.endpointConfigured ? 'Configurado' : 'Falta MEMORY_TASK_API_URL'}</p></div>
        <div><strong>API key</strong><p className="hint">{status?.apiKeyConfigured ? 'Configurada' : 'Falta MEMORY_TASK_API_KEY'}</p></div>
        <div><strong>ID de aplicación</strong><p className="hint">{status?.appIdConfigured ? 'Configurado' : 'Falta MEMORY_TASK_APP_ID'}</p></div>
        <div><strong>Identidad ES256</strong><p className="hint">{status?.identityKeyConfigured ? 'Configurada' : 'Falta MEMORY_TASK_IDENTITY_PRIVATE_JWK'}</p></div>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <strong>Configuración inicial (una sola vez)</strong>
        <ol className="hint">
          <li>En Memory Task, creá una aplicación de servicio llamada Cut-real.</li>
          <li>Generá el par ES256 acá y registrá en Memory Task solamente la clave pública JWK.</li>
          <li>Creá una API key de Memory Task con el permiso <code>records:write</code>.</li>
          <li>Guardá el endpoint, la API key, el ID de aplicación y la clave privada como secretos de Edge Functions en el proyecto Supabase de Cut-real.</li>
          <li>Volvé acá, actualizá el estado y probá la conexión.</li>
        </ol>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => void generate()}>Generar par de claves ES256</button>
          <span className="hint">No generes otro par si ya registraste uno en Memory Task.</span>
        </div>
        {keyPair && <div style={{ marginTop: 12 }}>
          <label className="lbl">Clave pública JWK · registrar en Memory Task</label>
          <pre className="secret" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(keyPair.publicJwk, null, 2)}</pre>
          <CopyButton text={JSON.stringify(keyPair.publicJwk)} label="Copiar clave pública" />
          <label className="lbl">Clave privada JWK · guardar solo como secreto MEMORY_TASK_IDENTITY_PRIVATE_JWK</label>
          <pre className="secret" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(keyPair.privateJwk)}</pre>
          <CopyButton text={JSON.stringify(keyPair.privateJwk)} label="Copiar clave privada" />
          <p className="hint">Esta clave privada se muestra solamente en esta sesión de administración. No la pegues en Memory Task, GitHub ni en el chat.</p>
        </div>}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy || !status?.configured || !integration || integration.status !== 'enabled'} onClick={() => void test()}>Probar conexión</button>
      </div>
      <div style={{ marginTop: 16 }}>
        <strong>Enviar información a Memory Task</strong>
        <label className="lbl">Título</label>
        <input className="field" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Nota de Cut-real" />
        <label className="lbl">Texto o información</label>
        <textarea className="field" rows={6} maxLength={20000} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escribí aquí la información que querés almacenar en Memory Task." />
        <div className="row end"><span className="hint">{content.length}/20000 caracteres</span><button className="btn primary" disabled={busy || !status?.configured || integration?.status !== 'enabled' || !title.trim() || !content.trim()} onClick={() => void send()}>Enviar y guardar</button></div>
        {integration?.status !== 'enabled' && <p className="hint">Habilitá primero la integración Memory Task para poder enviar información.</p>}
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
          {i.slug === 'memory-task' && <MemoryTaskPanel integration={i} />}
        </div>))}
    </>
  )
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

const TABS = [['overview', 'Resumen', Overview], ['users', 'Usuarios', Users], ['providers', 'Proveedores y modelos', Providers], ['keys', 'API keys', Keys], ['integrations', 'Integraciones', Integrations], ['audit', 'Auditoría', Audit]] as const

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
