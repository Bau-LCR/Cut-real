import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useSpeech } from '../store/speech'
import { useUi } from '../store/ui'
import { X } from './icons'

export const PRIVACY_TEXT = 'Tus conversaciones se guardan en tu cuenta y solo vos podés verlas. Excepcionalmente, administradores autorizados pueden acceder a una conversación para tareas legítimas de soporte o moderación. Ese acceso exige un motivo, está limitado a administradores y queda registrado en un historial de auditoría.'

interface Grant { id: string; scopes: string[]; granted_at: string; integration: string }

export function Settings() {
  const { me, voice, webSearchDefault, defaultModelId, privacyAck, updateProfile, saveSettings } = useAuth()
  const models = useChat((s) => s.models)
  const setSettings = useUi((s) => s.setSettings)
  const toast = useUi((s) => s.toast)
  const [name, setName] = useState(me?.display_name ?? '')
  const [grants, setGrants] = useState<Grant[]>([])

  const loadGrants = async () => {
    const [{ data: g }, { data: i }] = await Promise.all([
      supabase.from('cr_integration_grants').select('id, scopes, granted_at, integration_id').is('revoked_at', null),
      supabase.from('cr_integrations').select('id, name'),
    ])
    setGrants((g ?? []).map((x: any) => ({ id: x.id, scopes: x.scopes, granted_at: x.granted_at, integration: i?.find((y: any) => y.id === x.integration_id)?.name ?? 'Integración' })))
  }
  useEffect(() => { void loadGrants() }, [])
  const guard = (p: Promise<unknown>) => p.catch((e) => toast('error', (e as Error).message))

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setSettings(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Configuración">
        <h2>Configuración <button className="icon-btn" onClick={() => setSettings(false)} aria-label="Cerrar"><X /></button></h2>
        <p className="hint">{me?.email}</p>

        <h3>Perfil</h3>
        <div className="row">
          <input className="field grow" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Nombre para mostrar" />
          <button className="btn" disabled={!name.trim() || name === me?.display_name} onClick={() => guard(updateProfile(name).then(() => toast('info', 'Nombre actualizado.')))}>Guardar</button>
        </div>

        <h3>Modelo y búsqueda</h3>
        <label className="lbl" htmlFor="dm">Modelo predeterminado</label>
        <select id="dm" className="field" value={defaultModelId ?? ''} onChange={(e) => guard(saveSettings({ default_model_id: e.target.value || null }))}>
          <option value="">Primero de la lista</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
        <label className="switch"><span>Activar búsqueda web por defecto<br /><span className="hint">Requiere un proveedor de búsqueda configurado en el servidor.</span></span>
          <input type="checkbox" checked={webSearchDefault} onChange={(e) => guard(saveSettings({ web_search_default: e.target.checked }))} /></label>

        <h3>Voz</h3>
        <div className="grid2">
          <div><label className="lbl" htmlFor="eng">Motor de voz</label>
            <select id="eng" className="field" value={voice.engine} onChange={(e) => guard(saveSettings({ voice: { ...voice, engine: e.target.value as 'browser' | 'remote' } }))}>
              <option value="browser">Navegador (sin costo)</option><option value="remote">Proveedor externo (si el servidor lo tiene)</option>
            </select></div>
          <div><label className="lbl" htmlFor="rate">Velocidad de lectura</label>
            <select id="rate" className="field" value={voice.rate} onChange={(e) => guard(saveSettings({ voice: { ...voice, rate: Number(e.target.value) } }))}>
              {[0.75, 1, 1.25, 1.5, 1.75].map((r) => <option key={r} value={r}>{r}×</option>)}
            </select></div>
        </div>
        <label className="switch"><span>Leer las respuestas automáticamente</span>
          <input type="checkbox" checked={voice.auto_read} onChange={(e) => guard(saveSettings({ voice: { ...voice, auto_read: e.target.checked } }))} /></label>
        <button className="btn sm" onClick={() => void useSpeech.getState().speak('settings-test', 'Hola. Soy Cut-real. Esta es mi voz.')}>Probar voz</button>

        <h3>Integraciones autorizadas</h3>
        {grants.length === 0 ? <p className="hint">No autorizaste ninguna aplicación externa.</p> : grants.map((g) => (
          <div className="switch" key={g.id}><span>{g.integration}<br /><span className="hint">Permisos: {g.scopes.join(', ') || '—'}</span></span>
            <button className="btn danger sm" onClick={() => guard(Promise.resolve(supabase.rpc('cr_revoke_my_grant', { p_grant_id: g.id })).then(loadGrants))}>Revocar</button></div>
        ))}

        <h3>Privacidad</h3>
        <p className="hint">{PRIVACY_TEXT}</p>
        {!privacyAck && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => guard(saveSettings({ ack: true }))}>Entendido</button>}
      </div>
    </div>
  )
}

/** Aviso de primer uso: hasta aceptarlo no se muestra la app. */
export function PrivacyGate() {
  const saveSettings = useAuth((s) => s.saveSettings)
  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Privacidad">
        <h2>Antes de empezar</h2>
        <p className="hint" style={{ margin: '10px 0 16px', fontSize: 14, lineHeight: 1.6 }}>{PRIVACY_TEXT}</p>
        <div className="row end"><button className="btn primary" onClick={() => void saveSettings({ ack: true })}>Entendido</button></div>
      </div>
    </div>
  )
}
