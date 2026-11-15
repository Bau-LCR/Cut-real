import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useSpeech } from '../store/speech'
import { useUi } from '../store/ui'
import { X } from './icons'

export const PRIVACY_TEXT = 'Cut-real almacena datos de cuenta, configuración, conversaciones, archivos adjuntos y proyectos generales o de programación para prestar el servicio. Cada proyecto puede conservar una conversación privada asociada para mantener la continuidad entre solicitudes; los datos permanecen vinculados a la cuenta. Las funciones de IA, búsqueda web, transcripción/voz y análisis de archivos pueden enviar el contenido estrictamente necesario a proveedores externos configurados por el administrador; esos proveedores lo procesan según sus propias condiciones y políticas. No ingreses contraseñas, datos bancarios, documentos de identidad ni información sensible propia o de terceros. El acceso administrativo a conversaciones y datos debe limitarse a soporte o revisión de reportes, exige un motivo y queda registrado cuando la función de auditoría está disponible. Podés solicitar información, corrección o eliminación de tus datos contactando al responsable del proyecto. Los datos pueden conservarse mientras sean necesarios para prestar el servicio, mantener la seguridad y cumplir obligaciones aplicables. Este aviso es informativo, no constituye asesoramiento legal y no reemplaza las políticas de los proveedores.'

interface Grant { id: string; integration_id: string; scopes: string[]; granted_at: string; integration: string }
interface AvailableIntegration { id: string; name: string; slug: string; allowed_scopes: string[] }

export function Settings() {
  const { me, voice, webSearchDefault, defaultModelId, privacyAck, updateProfile, saveSettings } = useAuth()
  const models = useChat((s) => s.models)
  const setSettings = useUi((s) => s.setSettings)
  const toast = useUi((s) => s.toast)
  const [name, setName] = useState(me?.display_name ?? '')
  const [grants, setGrants] = useState<Grant[]>([])
  const [availableIntegrations, setAvailableIntegrations] = useState<AvailableIntegration[]>([])
  const [selectedScopes, setSelectedScopes] = useState<Record<string, string[]>>({})
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([])

  const loadGrants = async () => {
    const [{ data: g, error: grantError }, { data: i, error: integrationError }] = await Promise.all([
      supabase.from('cr_integration_grants').select('id, scopes, granted_at, integration_id').is('revoked_at', null),
      supabase.from('cr_integrations').select('id, name, slug, allowed_scopes').eq('status', 'enabled'),
    ])
    if (grantError || integrationError) throw new Error('No se pudieron cargar las integraciones autorizadas.')
    setGrants((g ?? []).map((x: any) => ({
      id: x.id, integration_id: x.integration_id, scopes: x.scopes ?? [], granted_at: x.granted_at,
      integration: i?.find((y: any) => y.id === x.integration_id)?.name ?? 'Integración',
    })))
    setAvailableIntegrations((i ?? []) as AvailableIntegration[])
    setSelectedScopes((previous) => {
      const next = { ...previous }
      for (const item of i ?? []) {
        if (!(item.id in next)) next[item.id] = (g ?? []).find((grant: any) => grant.integration_id === item.id)?.scopes ?? []
      }
      return next
    })
  }
  useEffect(() => { void loadGrants().catch((e) => toast('error', (e as Error).message)) }, [])
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return
    const loadVoices = () => setBrowserVoices(speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es')))
    loadVoices()
    speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [])
  const authorizeIntegration = async (integrationId: string) => {
    const scopes = selectedScopes[integrationId] ?? []
    try {
      const { error } = await supabase.rpc('cr_grant_my_integration', { p_integration_id: integrationId, p_scopes: scopes })
      if (error) throw error
      toast('info', 'Autorización guardada.')
      await loadGrants()
    } catch (e) { toast('error', (e as Error).message) }
  }
  const guard = (p: PromiseLike<unknown>) => Promise.resolve(p).catch((e) => toast('error', (e as Error).message))

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
        {voice.engine === 'browser' && <div>
          <label className="lbl" htmlFor="voice-name">Voz en español</label>
          <select id="voice-name" className="field" value={voice.voice_uri ?? ''} onChange={(e) => guard(saveSettings({ voice: { ...voice, voice_uri: e.target.value } }))}>
            <option value="">Automática (voz masculina si está disponible)</option>
            {browserVoices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
          </select>
          <p className="hint">Las voces disponibles dependen del navegador y del sistema operativo. La opción automática prioriza voces masculinas en español cuando están disponibles.</p>
        </div>}
                <button className="btn sm" onClick={() => void useSpeech.getState().speak('settings-test', 'Hola. Soy Cut-real. Esta es mi voz.')}>Probar voz</button>

        <h3>Integraciones autorizadas</h3>
        <p className="hint">Elegí qué permisos concedés. Podés modificarlos o revocarlos cuando quieras. Solo se comparten datos cuando la función correspondiente está habilitada.</p>
        {availableIntegrations.map((integration) => {
          const active = grants.find((grant) => grant.integration_id === integration.id)
          const selected = selectedScopes[integration.id] ?? active?.scopes ?? []
          return <div className="panel" key={integration.id}>
            <div className="row"><strong>{integration.name}</strong><span className="grow" /><span className={`badge ${active ? 'ok' : ''}`}>{active ? 'autorizada' : 'sin autorizar'}</span></div>
            <div className="chk">{integration.allowed_scopes.map((scope) => <label key={scope}>
              <input type="checkbox" checked={selected.includes(scope)} onChange={(e) => setSelectedScopes((previous) => ({
                ...previous, [integration.id]: e.target.checked ? [...selected, scope] : selected.filter((item) => item !== scope),
              }))} />{scope}
            </label>)}</div>
            <div className="row end">
              <button className="btn primary sm" disabled={!selected.length} onClick={() => void authorizeIntegration(integration.id)}>{active ? 'Actualizar permisos' : 'Autorizar integración'}</button>
              {active && <button className="btn danger sm" onClick={() => guard(supabase.rpc('cr_revoke_my_grant', { p_grant_id: active.id }).then(loadGrants))}>Revocar</button>}
            </div>
          </div>
        })}
        {grants.filter((grant) => !availableIntegrations.some((item) => item.id === grant.integration_id)).map((grant) => (
          <div className="switch" key={grant.id}><span>{grant.integration} · integración deshabilitada<br /><span className="hint">Permisos: {grant.scopes.join(', ') || '—'}</span></span>
            <button className="btn danger sm" onClick={() => guard(supabase.rpc('cr_revoke_my_grant', { p_grant_id: grant.id }).then(loadGrants))}>Revocar</button></div>
        ))}
        {availableIntegrations.length === 0 && grants.length === 0 && <p className="hint">No hay integraciones habilitadas disponibles para autorizar.</p>}

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
