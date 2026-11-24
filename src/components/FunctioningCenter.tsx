import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { useTelemetry } from '../store/telemetry'
import { useUi } from '../store/ui'

const NODES = [
  { id: 'input', x: 85, y: 220, label: 'ENTRADA', sub: 'Mensaje / voz' },
  { id: 'context', x: 265, y: 85, label: 'CONTEXTO', sub: 'Historial e instrucciones' },
  { id: 'attachments', x: 265, y: 220, label: 'ADJUNTOS', sub: 'Texto e imágenes' },
  { id: 'tools', x: 265, y: 355, label: 'HERRAMIENTAS', sub: 'Web / imágenes' },
  { id: 'gateway', x: 475, y: 220, label: 'CUT-REAL', sub: 'Orquestación y límites' },
  { id: 'model', x: 685, y: 220, label: 'PROVEEDOR IA', sub: 'Modelo seleccionado' },
  { id: 'stream', x: 885, y: 85, label: 'STREAMING', sub: 'Fragmentos de salida' },
  { id: 'post', x: 885, y: 220, label: 'POSTPROCESO', sub: 'Documentos / formato' },
  { id: 'storage', x: 885, y: 355, label: 'PERSISTENCIA', sub: 'Guardar respuesta' },
  { id: 'answer', x: 1050, y: 220, label: 'INTERFAZ', sub: 'Mensaje al usuario' },
]
const LINKS = [
  ['input','context'],['input','attachments'],['input','tools'],
  ['context','gateway'],['attachments','gateway'],['tools','gateway'],
  ['gateway','model'],['model','stream'],['model','post'],['stream','post'],
  ['post','storage'],['post','answer'],['storage','answer'],
]
const ACTIVE: Record<string, string[]> = {
  idle: [],
  preparing: ['input','context','attachments'],
  sending: ['input','context','attachments','tools','gateway'],
  model: ['input','context','attachments','tools','gateway','model'],
  streaming: ['input','context','attachments','tools','gateway','model','stream','post','storage','answer'],
  done: ['input','context','attachments','tools','gateway','model','stream','post','storage','answer'],
  error: ['input','context','attachments','gateway','model'],
  cancelled: ['input','context','attachments','gateway','model'],
}
export function FunctioningCenter() {
  const close = useUi((s) => s.setFunctioning)
  const trace = useTelemetry()
  const [mode, setMode] = useState<'2d' | '3d'>('3d')
  const [detailMode, setDetailMode] = useState<'simple' | 'full'>('full')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const active = ACTIVE[trace.phase] ?? []
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [close])
  const elapsed = trace.durationMs != null ? (trace.durationMs / 1000).toFixed(2) : trace.startedAt ? ((trace.updatedAt - trace.startedAt) / 1000).toFixed(1) : '—'
  const totalTokens = trace.tokenUsage ?? ((trace.promptTokens ?? trace.inputTokensEstimate) + trace.outputTokensEstimate)
  const tokenLabel = trace.usageExact ? 'TOTAL REAL' : 'TOTAL ESTIMADO'
  const node = (id: string) => NODES.find((n) => n.id === id)!
  const selected = selectedNode ? node(selectedNode) : null
  const nodeDetails: Record<string, string> = {
    input: 'Recibe el texto escrito o la transcripción de voz. La estimación de tokens de entrada mostrada aquí es orientativa y no incluye necesariamente instrucciones ni contexto.',
    context: 'El servidor selecciona y recorta el historial, incorpora las instrucciones del sistema y prepara el prompt. El contador de prompt es el dato más cercano al volumen real enviado al proveedor.',
    attachments: 'Los archivos procesados aportan texto extraído; las imágenes pueden enviarse al modelo con visión o pasar por el puente visual auxiliar cuando está configurado.',
    tools: 'Solo se activa cuando la solicitud requiere búsqueda web, búsqueda de imágenes u otra herramienta disponible. Los resultados se incorporan al contexto de la respuesta.',
    gateway: 'La capa de orquestación valida la sesión, aplica límites, elige el proveedor y modelo, construye la solicitud y coordina la transmisión.',
    model: 'El proveedor externo procesa el prompt y genera la respuesta. Sus detalles internos, capas, pesos y activaciones no están expuestos a Cut-real.',
    stream: 'La respuesta llega en fragmentos. Cut-real los acumula y actualiza la interfaz; el contador de salida durante la generación es una estimación.',
    post: 'La aplicación procesa marcadores de documentos e imágenes, fuentes y formatos especiales antes de finalizar el mensaje.',
    storage: 'La respuesta final, su estado y las métricas disponibles se guardan en el historial de la cuenta.',
    answer: 'La interfaz representa el mensaje final, sus fuentes, adjuntos y métricas de tokens y duración cuando están disponibles.',
  }
  const onDown = (e: PointerEvent<SVGSVGElement>) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; e.currentTarget.setPointerCapture(e.pointerId) }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => { if (!drag.current) return; setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }) }
  const onUp = () => { drag.current = null }
  const zoomBy = (delta: number) => setZoom((z) => Math.max(.65, Math.min(1.65, +(z + delta).toFixed(2))))
  return (
    <div className="functioning-backdrop" role="dialog" aria-modal="true" aria-label="Centro de funcionamiento de Cut-real" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false) }}>
      <section className="functioning-window">
        <header className="functioning-head">
          <div className="functioning-brand"><span className="functioning-live-dot" /><div><b>Centro de funcionamiento</b><small>VISUALIZACIÓN EN TIEMPO REAL · CUT-REAL 2</small></div></div>
          <div className="functioning-head-actions"><span className="functioning-live">● {trace.phase === 'idle' ? 'EN ESPERA' : trace.phase === 'done' ? 'COMPLETADO' : trace.phase === 'error' ? 'ERROR' : trace.phase === 'cancelled' ? 'DETENIDO' : 'EN VIVO'}</span><button className="icon-btn" onClick={() => close(false)} aria-label="Cerrar">✕</button></div>
        </header>
        <div className="functioning-content">
          <div className="functioning-visual">
            <div className="functioning-toolbar"><div><b>Mapa de procesamiento</b><small>Arrastrá para mover · Usá los controles para acercar</small></div><div className="functioning-toolbar-controls"><div className="functioning-modes"><button className={mode === '2d' ? 'selected' : ''} onClick={() => setMode('2d')}>2D</button><button className={mode === '3d' ? 'selected' : ''} onClick={() => setMode('3d')}>3D</button></div><div className="functioning-modes"><button className={detailMode === 'simple' ? 'selected' : ''} onClick={() => setDetailMode('simple')}>Simple</button><button className={detailMode === 'full' ? 'selected' : ''} onClick={() => setDetailMode('full')}>Completo</button></div></div></div>
            <div className="functioning-canvas">
              <svg viewBox="0 0 1120 440" role="img" aria-label="Esquema interactivo del recorrido de una consulta" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className={`functioning-svg ${mode === '3d' ? 'view-3d' : 'view-2d'}`}>
                <defs><pattern id="fn-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="currentColor" strokeOpacity=".10" strokeWidth="1"/></pattern><filter id="fn-glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <rect width="1120" height="440" fill="url(#fn-grid)" />
                <g transform={`translate(${pan.x} ${pan.y}) translate(560 220) scale(${zoom}) translate(-560 -220)`}>
                  {LINKS.map(([a,b]) => { const p=node(a), q=node(b); const hot=active.includes(a)&&active.includes(b); return <g key={a+b}><path d={`M ${p.x} ${p.y} C ${(p.x+q.x)/2} ${p.y}, ${(p.x+q.x)/2} ${q.y}, ${q.x} ${q.y}`} className={`fn-link ${hot?'hot':''}`}/>{hot && <circle r="4" className="fn-packet"><animateMotion dur="1.8s" repeatCount="indefinite" path={`M ${p.x} ${p.y} C ${(p.x+q.x)/2} ${p.y}, ${(p.x+q.x)/2} ${q.y}, ${q.x} ${q.y}`}/></circle>}</g> })}
                  {NODES.map((n) => { const hot=active.includes(n.id); return <g key={n.id} transform={`translate(${n.x} ${n.y})`} className={`fn-node ${hot?'active':''} ${trace.phase==='done'?'complete':''} ${selectedNode===n.id?'selected':''}`} role="button" tabIndex={0} aria-label={`Ver detalles de ${n.label}`} onClick={() => setSelectedNode(n.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedNode(n.id) } }}>{mode === '3d' && <><path d="M -70 -32 L -58 -44 H 82 L 70 -32 Z" className="fn-node-depth-top"/><path d="M 70 -32 L 82 -44 V 20 L 70 32 Z" className="fn-node-depth-side"/></>}<rect x="-70" y="-32" width="140" height="64" rx="9"/><circle cx="-51" cy="-12" r="4"/><text x="0" y="1" textAnchor="middle" className="fn-node-title">{n.label}</text><text x="0" y="18" textAnchor="middle" className="fn-node-sub">{n.sub}</text><text x="0" y="47" textAnchor="middle" className="fn-node-metric">{n.id === 'input' ? '≈ ' + trace.inputTokensEstimate + ' tokens de usuario' : n.id === 'context' ? (trace.promptTokens != null ? '≈ ' + trace.promptTokens + ' tokens de prompt' : 'Prompt: calculando') : n.id === 'attachments' ? 'Incluidos en ≈ ' + (trace.promptTokens ?? trace.inputTokensEstimate) + ' tokens de prompt' : n.id === 'tools' ? (trace.events.some((ev) => ev.title === 'Fuentes recibidas') ? 'Resultados dentro del prompt' : '0 tokens adicionales') : n.id === 'gateway' ? '0 propios · ≈ ' + (trace.promptTokens ?? trace.inputTokensEstimate) + ' de prompt' : n.id === 'model' ? (trace.completionTokens != null ? (trace.promptTokens ?? 0) + ' entrada · ' + trace.completionTokens + ' salida' : 'Entrada y salida en cálculo') : n.id === 'stream' ? '≈ ' + trace.outputTokensEstimate + ' tokens de salida' : n.id === 'post' ? '0 tokens de modelo · formato' : n.id === 'storage' ? '0 tokens de modelo · guardado' : (trace.tokenUsage != null ? trace.tokenUsage + ' tokens total' : 'Total ≈ ' + totalTokens + ' tokens')}</text></g> })}
                </g>
              </svg>
              <div className="functioning-zoom"><button onClick={() => zoomBy(.1)} aria-label="Acercar">＋</button><span>{Math.round(zoom*100)}%</span><button onClick={() => zoomBy(-.1)} aria-label="Alejar">−</button><button onClick={() => {setZoom(1);setPan({x:0,y:0})}} aria-label="Restablecer vista">↺</button></div>
            </div>
            <div className="functioning-legend"><span><i className="legend-idle"/>En espera</span><span><i className="legend-active"/>Actividad registrada</span><span><i className="legend-packet"/>Datos en tránsito</span><span className="functioning-note">Esquema del flujo real de la aplicación; no representa neuronas ni pesos internos del proveedor.</span></div>
          </div>
          <aside className="functioning-side">
            <div className="functioning-card"><div className="functioning-card-title">ESTADO ACTUAL <span>{trace.phase.toUpperCase()}</span></div><h2>{trace.phase === 'idle' ? 'Esperando una consulta' : trace.phase === 'preparing' ? 'Preparando el mensaje' : trace.phase === 'sending' ? 'Enviando solicitud' : trace.phase === 'model' ? 'Modelo conectado' : trace.phase === 'streaming' ? 'Respuesta en camino' : trace.phase === 'done' ? 'Proceso completado' : trace.phase === 'error' ? 'Proceso con error' : 'Proceso detenido'}</h2><p>{trace.events.at(-1)?.detail ?? 'Cuando envíes un mensaje, vas a ver aquí los eventos que Cut-real recibe en tiempo real.'}</p><div className="functioning-stats"><div><small>MODELO</small><b>{trace.model}</b></div><div><small>TIEMPO TOTAL</small><b>{elapsed === '—' ? '—' : `${elapsed} s`}</b></div><div><small>FRAGMENTOS</small><b>{trace.chunks}</b></div><div><small>{tokenLabel}</small><b>{trace.startedAt ? totalTokens.toLocaleString('es-AR') : '—'} tokens</b></div></div></div>
            {detailMode === 'full' && selected && <div className="functioning-card functioning-node-details"><div className="functioning-card-title">DETALLE DE ETAPA <span>SELECCIONADA</span></div><h3>{selected.label}</h3><p>{nodeDetails[selected.id]}</p><div><span>Tokens asociados</span><b>{selected.id === 'input' ? '≈ ' + trace.inputTokensEstimate : selected.id === 'stream' ? '≈ ' + trace.outputTokensEstimate : selected.id === 'model' ? (trace.tokenUsage ?? totalTokens) : (trace.promptTokens ?? trace.inputTokensEstimate) } tokens</b></div><small>Los valores por etapa son referencias del flujo, no una medición independiente del consumo interno de cada componente.</small></div>}
            {detailMode === 'full' && <div className="functioning-card functioning-token-breakdown"><div className="functioning-card-title">DESGLOSE DE TOKENS <span>{trace.usageExact ? 'PROVEEDOR' : 'ESTIMACIÓN LOCAL'}</span></div><div><span>Entrada escrita</span><b>≈ {trace.inputTokensEstimate.toLocaleString('es-AR')}</b></div><div><span>Prompt completo</span><b>{trace.promptTokens != null ? trace.promptTokens.toLocaleString('es-AR') : 'Pendiente de confirmación'}</b></div><div><span>Salida generada</span><b>{trace.completionTokens != null ? trace.completionTokens.toLocaleString('es-AR') : '≈ ' + trace.outputTokensEstimate.toLocaleString('es-AR')}</b></div><div className="functioning-token-total"><span>Total de la llamada</span><b>{trace.usageExact && trace.tokenUsage != null ? trace.tokenUsage.toLocaleString('es-AR') : '≈ ' + (trace.tokenUsage ?? totalTokens).toLocaleString('es-AR')} tokens</b></div><small>El proveedor informa el total al terminar. Antes de eso, las cifras son estimaciones locales.</small></div>}
            <div className="functioning-card functioning-audio"><div className="functioning-card-title">AUDIO / VOZ <span>{trace.voicePhase.toUpperCase()}</span></div><div className="functioning-audio-orb" style={{'--audio-level':trace.voiceLevel} as CSSProperties}><span/><span/><span/></div><p>El indicador responde a los estados y al nivel de voz que Cut-real recibe o reproduce.</p></div>
            <div className="functioning-card functioning-transcript"><div className="functioning-card-title">TRÁFICO DE CONVERSACIÓN <span>LOCAL</span></div><small>ENTRADA</small><p>{trace.input || 'Todavía no hay una consulta registrada.'}</p><small>SALIDA</small><p>{trace.output || 'La respuesta aparecerá aquí a medida que llegue.'}</p></div>
          </aside>
        </div>
        <footer className="functioning-events"><div className="functioning-card-title">REGISTRO DE EVENTOS <span>{trace.events.length} EVENTOS · TOKENS ACUMULADOS</span></div><div className="functioning-event-list">{trace.events.length ? [...trace.events].reverse().map((ev) => <div className="functioning-event" key={ev.id}><i className={ev.phase}/><time>{new Date(ev.at).toLocaleTimeString()}</time><b>{ev.title}</b><span>{ev.detail}{detailMode === 'full' && ev.tokenEstimate != null ? ' · ≈ ' + ev.tokenEstimate.toLocaleString('es-AR') + ' tokens' : ''}</span></div>) : <p>Los eventos de la próxima consulta aparecerán en este registro.</p>}</div></footer>
      </section>
    </div>
  )
}
