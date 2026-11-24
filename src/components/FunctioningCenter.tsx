import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { useTelemetry } from '../store/telemetry'
import { useUi } from '../store/ui'

const NODES = [
  { id: 'input', x: 90, y: 205, label: 'ENTRADA', sub: 'Mensaje / voz' },
  { id: 'context', x: 270, y: 95, label: 'CONTEXTO', sub: 'Historial y archivos' },
  { id: 'tools', x: 270, y: 315, label: 'HERRAMIENTAS', sub: 'Búsqueda / funciones' },
  { id: 'gateway', x: 475, y: 205, label: 'CUT-REAL', sub: 'Orquestación' },
  { id: 'model', x: 680, y: 205, label: 'MODELO IA', sub: 'Proveedor externo' },
  { id: 'stream', x: 880, y: 95, label: 'FLUJO', sub: 'Fragmentos recibidos' },
  { id: 'answer', x: 880, y: 315, label: 'RESPUESTA', sub: 'Texto / audio' },
]
const LINKS = [['input','context'],['input','tools'],['context','gateway'],['tools','gateway'],['gateway','model'],['model','stream'],['model','answer'],['stream','answer']]
const ACTIVE: Record<string, string[]> = {
  idle: [], preparing: ['input','context'], sending: ['input','context','gateway'], model: ['input','context','gateway','model'],
  streaming: ['input','context','gateway','model','stream','answer'], done: ['input','context','gateway','model','stream','answer'],
  error: ['input','gateway','model'], cancelled: ['input','gateway','model'],
}
export function FunctioningCenter() {
  const close = useUi((s) => s.setFunctioning)
  const trace = useTelemetry()
  const [mode, setMode] = useState<'2d' | '3d'>('3d')
  const [detailMode, setDetailMode] = useState<'simple' | 'full'>('full')
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
  const totalTokens = trace.tokenUsage ?? (trace.inputTokensEstimate + trace.outputTokensEstimate)
  const tokenLabel = trace.tokenUsage != null ? 'TOTAL REAL' : 'TOTAL ESTIMADO'
  const node = (id: string) => NODES.find((n) => n.id === id)!
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
              <svg viewBox="0 0 980 410" role="img" aria-label="Esquema interactivo del recorrido de una consulta" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className={`functioning-svg ${mode}`}>
                <defs><pattern id="fn-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="currentColor" strokeOpacity=".10" strokeWidth="1"/></pattern><filter id="fn-glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <rect width="980" height="410" fill="url(#fn-grid)" />
                <g transform={`translate(${pan.x} ${pan.y}) translate(490 205) scale(${zoom}) translate(-490 -205)`}>
                  {LINKS.map(([a,b]) => { const p=node(a), q=node(b); const hot=active.includes(a)&&active.includes(b); return <g key={a+b}><path d={`M ${p.x} ${p.y} C ${(p.x+q.x)/2} ${p.y}, ${(p.x+q.x)/2} ${q.y}, ${q.x} ${q.y}`} className={`fn-link ${hot?'hot':''}`}/>{hot && <circle r="4" className="fn-packet"><animateMotion dur="1.8s" repeatCount="indefinite" path={`M ${p.x} ${p.y} C ${(p.x+q.x)/2} ${p.y}, ${(p.x+q.x)/2} ${q.y}, ${q.x} ${q.y}`}/></circle>}</g> })}
                  {NODES.map((n) => { const hot=active.includes(n.id); return <g key={n.id} transform={`translate(${n.x} ${n.y})`} className={`fn-node ${hot?'active':''} ${trace.phase==='done'?'complete':''}`}><rect x="-70" y="-32" width="140" height="64" rx="13"/><circle cx="-51" cy="-12" r="4"/><text x="0" y="1" textAnchor="middle" className="fn-node-title">{n.label}</text><text x="0" y="18" textAnchor="middle" className="fn-node-sub">{n.sub}</text></g> })}
                </g>
              </svg>
              <div className="functioning-zoom"><button onClick={() => zoomBy(.1)} aria-label="Acercar">＋</button><span>{Math.round(zoom*100)}%</span><button onClick={() => zoomBy(-.1)} aria-label="Alejar">−</button><button onClick={() => {setZoom(1);setPan({x:0,y:0})}} aria-label="Restablecer vista">↺</button></div>
            </div>
            <div className="functioning-legend"><span><i className="legend-idle"/>En espera</span><span><i className="legend-active"/>Actividad registrada</span><span><i className="legend-packet"/>Datos en tránsito</span><span className="functioning-note">Esquema del flujo real de la aplicación; no representa neuronas ni pesos internos del proveedor.</span></div>
          </div>
          <aside className="functioning-side">
            <div className="functioning-card"><div className="functioning-card-title">ESTADO ACTUAL <span>{trace.phase.toUpperCase()}</span></div><h2>{trace.phase === 'idle' ? 'Esperando una consulta' : trace.phase === 'preparing' ? 'Preparando el mensaje' : trace.phase === 'sending' ? 'Enviando solicitud' : trace.phase === 'model' ? 'Modelo conectado' : trace.phase === 'streaming' ? 'Respuesta en camino' : trace.phase === 'done' ? 'Proceso completado' : trace.phase === 'error' ? 'Proceso con error' : 'Proceso detenido'}</h2><p>{trace.events.at(-1)?.detail ?? 'Cuando envíes un mensaje, vas a ver aquí los eventos que Cut-real recibe en tiempo real.'}</p><div className="functioning-stats"><div><small>MODELO</small><b>{trace.model}</b></div><div><small>TIEMPO TOTAL</small><b>{elapsed === '—' ? '—' : `${elapsed} s`}</b></div><div><small>FRAGMENTOS</small><b>{trace.chunks}</b></div><div><small>{tokenLabel}</small><b>{trace.startedAt ? totalTokens.toLocaleString('es-AR') : '—'} tokens</b></div></div></div>
            {detailMode === 'full' && <div className="functioning-card functioning-token-breakdown"><div className="functioning-card-title">DESGLOSE DE TOKENS <span>{trace.tokenUsage != null ? 'PROVEEDOR' : 'ESTIMACIÓN LOCAL'}</span></div><div><span>Entrada escrita</span><b>≈ {trace.inputTokensEstimate.toLocaleString('es-AR')}</b></div><div><span>Prompt completo</span><b>{trace.promptTokens != null ? trace.promptTokens.toLocaleString('es-AR') : 'Pendiente de confirmación'}</b></div><div><span>Salida generada</span><b>{trace.completionTokens != null ? trace.completionTokens.toLocaleString('es-AR') : '≈ ' + trace.outputTokensEstimate.toLocaleString('es-AR')}</b></div><div className="functioning-token-total"><span>Total de la llamada</span><b>{trace.tokenUsage != null ? trace.tokenUsage.toLocaleString('es-AR') : '≈ ' + totalTokens.toLocaleString('es-AR')} tokens</b></div><small>El proveedor informa el total al terminar. Antes de eso, las cifras son estimaciones locales.</small></div>}
            <div className="functioning-card functioning-audio"><div className="functioning-card-title">AUDIO / VOZ <span>{trace.voicePhase.toUpperCase()}</span></div><div className="functioning-audio-orb" style={{'--audio-level':trace.voiceLevel} as CSSProperties}><span/><span/><span/></div><p>El indicador responde a los estados y al nivel de voz que Cut-real recibe o reproduce.</p></div>
            <div className="functioning-card functioning-transcript"><div className="functioning-card-title">TRÁFICO DE CONVERSACIÓN <span>LOCAL</span></div><small>ENTRADA</small><p>{trace.input || 'Todavía no hay una consulta registrada.'}</p><small>SALIDA</small><p>{trace.output || 'La respuesta aparecerá aquí a medida que llegue.'}</p></div>
          </aside>
        </div>
        <footer className="functioning-events"><div className="functioning-card-title">REGISTRO DE EVENTOS <span>{trace.events.length} EVENTOS · TOKENS ACUMULADOS</span></div><div className="functioning-event-list">{trace.events.length ? [...trace.events].reverse().map((ev) => <div className="functioning-event" key={ev.id}><i className={ev.phase}/><time>{new Date(ev.at).toLocaleTimeString()}</time><b>{ev.title}</b><span>{ev.detail}{detailMode === 'full' && ev.tokenEstimate != null ? ' · ≈ ' + ev.tokenEstimate.toLocaleString('es-AR') + ' tokens' : ''}</span></div>) : <p>Los eventos de la próxima consulta aparecerán en este registro.</p>}</div></footer>
      </section>
    </div>
  )
}
