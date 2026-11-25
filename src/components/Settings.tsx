import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useSpeech } from '../store/speech'
import { useUi } from '../store/ui'
import { X } from './icons'
import { localLearningEnabled, setLocalLearningEnabled, sharedLearningEnabled, setSharedLearningEnabled } from '../lib/localLearning'

export const PRIVACY_TEXT = 'Cut-real 2 es un servicio privado de acceso restringido: iniciar sesión o registrarse no habilita automáticamente una cuenta; el propietario o un administrador debe aprobar el acceso. Cut-real almacena datos de cuenta, configuración, conversaciones, archivos adjuntos y proyectos generales o de programación para prestar el servicio. Cada proyecto puede conservar una conversación privada asociada para mantener la continuidad entre solicitudes. Cuando pedís continuar un trabajo o resumir chats anteriores, Cut-real puede recuperar títulos y mensajes recientes de hasta 20 conversaciones de tu misma cuenta. Si habilitaste Memory Task y autorizaste records:read, también puede consultar recuerdos de esa misma cuenta externa para dar continuidad; solo guarda información allí cuando lo pedís expresamente y autorizaste records:write. Los datos permanecen vinculados a la cuenta. El Laboratorio neuronal está reservado a administradores y propietarios. Su núcleo calcula 121.000 unidades numéricas en el dispositivo; el editor visual permite modificar 921 nodos representativos. La arquitectura editable, sus conexiones y parámetros se sincronizan en la nube. La memoria privada de cada usuario puede guardar sus propias conversaciones en su navegador si mantiene activado el aprendizaje local. Compartir ejemplos para la red común es una opción separada, voluntaria y desactivada por defecto: solo comparte preguntas filtradas automáticamente para retirar algunos identificadores y su etiqueta de intención, nunca respuestas ni historiales completos. La anonimización automática no garantiza eliminar todos los datos personales. Los chats privados no se recopilan automáticamente para entrenamiento global. El Laboratorio permite importar manualmente el historial de la propia cuenta a la memoria local. El dictado del navegador puede enviar audio a un proveedor de reconocimiento externo según la configuración del navegador. El uso de chat tiene un límite de referencia de 70.000 tokens por usuario y día, con renovación diaria a las 00:00 UTC; el consumo se estima cuando el proveedor no informa el uso exacto. Las funciones de IA, búsqueda web, transcripción/voz y análisis de archivos pueden enviar el contenido estrictamente necesario a proveedores externos configurados por el administrador; esos proveedores lo procesan según sus propias condiciones y políticas. No ingreses contraseñas, datos bancarios, documentos de identidad ni información sensible propia o de terceros. El acceso administrativo a conversaciones y datos debe limitarse a soporte o revisión de reportes, exige un motivo y queda registrado cuando la función de auditoría está disponible. Podés solicitar información, corrección o eliminación de tus datos contactando al responsable del proyecto. Los datos pueden conservarse mientras sean necesarios para prestar el servicio, mantener la seguridad y cumplir obligaciones aplicables. Este aviso es informativo, no constituye asesoramiento legal y no reemplaza las políticas de los proveedores.'

interface Grant { id: string; integration_id: string; scopes: string[]; granted_at: string; integration: string }
interface AvailableIntegration { id: string; name: string; slug: string; allowed_scopes: string[] }

export function Settings() {
  const { me, voice, appearance, webSearchDefault, defaultModelId, privacyAck, updateProfile, saveSettings } = useAuth()
  const models = useChat((s) => s.models)
  const setSettings = useUi((s) => s.setSettings)
  const toast = useUi((s) => s.toast)
  const [name, setName] = useState(me?.display_name ?? '')
  const [grants, setGrants] = useState<Grant[]>([])
  const [availableIntegrations, setAvailableIntegrations] = useState<AvailableIntegration[]>([])
  const [selectedScopes, setSelectedScopes] = useState<Record<string, string[]>>({})
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([])
  const [tokenUsage, setTokenUsage] = useState<{ used: number; limit: number | null; unlimited: boolean; resets_at: string } | null>(null)
  const [usageClock, setUsageClock] = useState(Date.now())
  const [appearanceSaving, setAppearanceSaving] = useState(false)
  const [learnFromChats, setLearnFromChats] = useState(localLearningEnabled())
  const [shareTraining,setShareTraining]=useState(sharedLearningEnabled())

  const changeAppearance = async (value: 'original' | 'white' | 'liquid-glass' | 'cybercore', label: string) => {
    if (appearanceSaving || value === appearance) return
    setAppearanceSaving(true)
    try {
      await saveSettings({ appearance: value })
      toast('info', `Apariencia ${label} guardada en tu cuenta.`)
    } catch (e) { toast('error', (e as Error).message) }
    finally { setAppearanceSaving(false) }
  }

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
    let active = true
    const loadUsage = async () => {
      const { data, error } = await supabase.rpc('cr_get_my_token_usage')
      if (!active) return
      if (!error && data) setTokenUsage(data as { used: number; limit: number | null; unlimited: boolean; resets_at: string })
    }
    void loadUsage()
    const refresh = window.setInterval(() => { void loadUsage(); setUsageClock(Date.now()) }, 30000)
    return () => { active = false; window.clearInterval(refresh) }
  }, [])
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
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Configuración">
        <h2>Configuración <button className="icon-btn" onClick={() => setSettings(false)} aria-label="Cerrar"><X /></button></h2>
        <p className="hint">{me?.email}</p>
        <section className="panel" aria-label="Uso de tokens">
          <h3>Uso de tokens</h3>
          {tokenUsage ? <>
            <div className="row"><strong>{tokenUsage.used.toLocaleString('es-AR')} tokens</strong><span className="grow" /><span className="hint">{tokenUsage.unlimited ? 'Sin límite diario' : 'de ' + (tokenUsage.limit ?? 70000).toLocaleString('es-AR')}</span></div>
            {!tokenUsage.unlimited && <div className="usage-meter" role="progressbar" aria-valuenow={Math.min(100, Math.round(tokenUsage.used / (tokenUsage.limit ?? 70000) * 100))} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: Math.min(100, tokenUsage.used / (tokenUsage.limit ?? 70000) * 100) + '%' }} />
            </div>}
            <p className="hint">{tokenUsage.unlimited
              ? 'Tu cuenta administrativa no tiene un límite diario interno. El consumo se sigue registrando.'
              : 'Consumo acumulado de hoy en todos tus chats. Se renueva en ' + (() => { const ms = Math.max(0, new Date(tokenUsage.resets_at).getTime() - usageClock); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); return h + ' h ' + m + ' min' })() + ' (00:00 UTC).'}
            </p>
          </> : <p className="hint">Cargando consumo de tokens…</p>}
        </section>

        <section className="settings-section settings-appearance">
        <div className="settings-section-heading"><div><h3>Apariencia</h3><p className="hint">Elegí un tema visual para tu cuenta.</p></div><span className="settings-section-tag">PERSONALIZACIÓN</span></div>
        <p className="hint">El cambio se guarda y se sincroniza automáticamente entre tus dispositivos.</p>
        <div className="appearance-options" role="group" aria-label="Estilo de apariencia">
          {([
            { id: 'original', name: 'Original', desc: 'Diseño actual · carbón y azul', swatch: 'appearance-swatch-original' },
            { id: 'white', name: 'White', desc: 'Interfaz clara y luminosa', swatch: 'appearance-swatch-white' },
            { id: 'liquid-glass', name: 'Liquid Glass', desc: 'Cristal azul translúcido y reflejos', swatch: 'appearance-swatch-glass' },
            { id: 'cybercore', name: 'Cybercore', desc: 'Cromo, neón y futurismo Y2K', swatch: 'appearance-swatch-cyber' },
          ] as const).map((style) => (
            <button key={style.id} type="button" className={`appearance-option ${appearance === style.id ? 'selected' : ''}`} aria-pressed={appearance === style.id}
              disabled={appearanceSaving} onClick={() => void changeAppearance(style.id, style.name)}>
              <span className={`appearance-swatch ${style.swatch}`} aria-hidden="true"><i /><i /><i /></span>
              <span className="appearance-copy"><strong>{style.name}</strong><small>{style.desc}</small></span>
              <span className="appearance-check" aria-hidden="true">{appearance === style.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
        {appearanceSaving && <p className="hint" role="status">Guardando apariencia…</p>}
        </section>

        <section className="settings-section"><div className="settings-section-heading"><h3>Perfil</h3><span className="settings-section-tag">CUENTA</span></div>
        <div className="row">
          <input className="field grow" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Nombre para mostrar" />
          <button className="btn" disabled={!name.trim() || name === me?.display_name} onClick={() => guard(updateProfile(name).then(() => toast('info', 'Nombre actualizado.')))}>Guardar</button>
        </div>

        </section>
        <section className="settings-section"><div className="settings-section-heading"><h3>Modelo y búsqueda</h3><span className="settings-section-tag">PREFERENCIAS</span></div>
        <label className="lbl" htmlFor="dm">Modelo predeterminado</label>
        <select id="dm" className="field" value={defaultModelId ?? ''} onChange={(e) => guard(saveSettings({ default_model_id: e.target.value || null }))}>
          <option value="">Primero de la lista</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
        <label className="switch"><span>Activar búsqueda web por defecto<br /><span className="hint">Requiere un proveedor de búsqueda configurado en el servidor.</span></span>
          <input type="checkbox" checked={webSearchDefault} onChange={(e) => guard(saveSettings({ web_search_default: e.target.checked }))} /></label>

        </section>
        <section className="settings-section"><div className="settings-section-heading"><h3>Aprendizaje local</h3><span className="settings-section-tag">PRIVACIDAD</span></div>
          <label className="switch"><span>Usar mis conversaciones para memoria y entrenamiento local<br /><span className="hint">Activado por defecto. Guarda las conversaciones en este dispositivo para mejorar la memoria y los ejemplos del clasificador. No las envía a un servidor de entrenamiento. Podés desactivarlo cuando quieras.</span></span>
            <input type="checkbox" checked={learnFromChats} onChange={(e) => { setLearnFromChats(e.target.checked); setLocalLearningEnabled(e.target.checked) }} /></label>
          <label className="switch"><span>Compartir ejemplos anonimizados para mejorar la red común<br /><span className="hint">Desactivado por defecto y separado de la memoria privada. Si lo activás, se comparte solo el texto de la pregunta tras ocultar correos, enlaces, teléfonos e identificadores; no se comparte la respuesta ni el historial completo. La anonimización automática puede no detectar todos los datos personales: no incluyas información sensible.</span></span><input type="checkbox" checked={shareTraining} onChange={e=>{setShareTraining(e.target.checked);setSharedLearningEnabled(e.target.checked)}}/></label>
        </section>

        <section className="settings-section"><div className="settings-section-heading"><h3>Voz</h3><span className="settings-section-tag">AUDIO</span></div>
        <div className="grid2">
          <div><label className="lbl" htmlFor="eng">Motor de voz</label>
            <select id="eng" className="field" value={voice.engine} onChange={(e) => { const engine = e.target.value as 'browser' | 'remote'; guard(saveSettings({ voice: { ...voice, engine, voice_uri: engine === 'remote' ? 'Puck' : '' } })) }}>
              <option value="browser">Navegador (sin costo)</option><option value="remote">Proveedor externo (Gemini TTS)</option>
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
            <option value="">Automática (según el dispositivo)</option>
            {browserVoices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
          </select>
          <p className="hint">Las voces del navegador dependen de Windows, Chrome y los paquetes de idioma instalados.</p>
        </div>}
        <div>
          <label className="lbl" htmlFor="call-engine">Voz durante las llamadas</label>
          <select id="call-engine" className="field" value={voice.call_engine ?? 'browser'} onChange={(e) => guard(saveSettings({ voice: { ...voice, call_engine: e.target.value as 'browser' | 'remote' } }))}>
            <option value="browser">Dispositivo · rápida y sin consumo de API</option>
            <option value="remote">Gemini · voz natural, puede tardar más y consumir cuota</option>
          </select>
          <p className="hint">La opción del dispositivo evita esperar una segunda generación de audio después de la respuesta. La voz natural de Gemini sigue disponible si la preferís.</p>
        </div>
        {voice.engine === 'remote' && <div>
          <label className="lbl" htmlFor="remote-voice">Voz natural de Cut-real</label>
          <select id="remote-voice" className="field" value={voice.voice_uri || 'Puck'} onChange={(e) => guard(saveSettings({ voice: { ...voice, voice_uri: e.target.value } }))}>
            <option value="Puck">Puck · animada (predeterminada)</option>
            <option value="Kore">Kore · firme y clara</option>
            <option value="Charon">Charon · informativa</option>
            <option value="Aoede">Aoede · ligera</option>
            <option value="Zephyr">Zephyr · brillante</option>
            <option value="Enceladus">Enceladus · aireada</option>
            <option value="Gacrux">Gacrux · madura</option>
            <option value="Sulafat">Sulafat · cálida</option>
          </select>
          <p className="hint">Usa Gemini 3.8 Flash TTS en el servidor. Puck es la voz predeterminada. Si el proveedor falla, Cut-real intenta usar la voz del dispositivo como respaldo (Raúl si está disponible).</p>
        </div>}
                <button className="btn sm" onClick={() => void useSpeech.getState().speak('settings-test', 'Hola. Soy Cut-real. Esta es mi voz.')}>Probar voz</button>

        </section>
        <section className="settings-section"><div className="settings-section-heading"><h3>Integraciones autorizadas</h3><span className="settings-section-tag">PERMISOS</span></div>
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

        </section>
        <section className="settings-section"><div className="settings-section-heading"><h3>Privacidad</h3><span className="settings-section-tag">DATOS</span></div>
        <p className="hint">{PRIVACY_TEXT}</p>
        {!privacyAck && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => guard(saveSettings({ ack: true }))}>Entendido</button>}
        </section>
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
