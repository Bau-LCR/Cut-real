import { Children, isValidElement, memo, useEffect, useState, type PointerEvent, type WheelEvent } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeHtmlArtifacts, normalizeMath } from '../lib/markdown'
import { callFn } from '../lib/functions'
import { Check, Copy } from './icons'

export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button className="icon-btn" title={label} aria-label={label} onClick={async () => {
      try { await navigator.clipboard.writeText(text) } catch {
        const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
      }
      setOk(true); setTimeout(() => setOk(false), 1600)
    }}>{ok ? <Check /> : <Copy />}</button>
  )
}

function detectGraphJson(raw: string): string | null {
  try {
    const value = JSON.parse(raw)
    if (value?.type === 'graph') return raw
    // Compatibilidad: los modelos a veces entregan una serie cartesiana como JSON genérico.
    if (value?.type !== 'line' || !Array.isArray(value.labels) || !Array.isArray(value.series) || !value.series.length) return null
    const xs = value.labels.map((x: unknown) => typeof x === 'number' ? x : Number(String(x).replace(',', '.')))
    if (!xs.length || !xs.every(Number.isFinite)) return null
    const series = value.series.filter((s: any) => Array.isArray(s.values) && s.values.length === xs.length && s.values.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)))
    if (!series.length) return null
    const ys = series.flatMap((s: any) => s.values)
    const pad = (min: number, max: number) => Math.max((max - min) * .12, Math.abs(max || min || 1) * .12, 1)
    const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys)
    return JSON.stringify({
      type: 'graph',
      title: value.title || 'Gráfica cartesiana',
      xMin: xMin - pad(xMin, xMax), xMax: xMax + pad(xMin, xMax),
      yMin: yMin - pad(yMin, yMax), yMax: yMax + pad(yMin, yMax),
      series: series.map((s: any) => ({ name: s.name || 'f(x)', segments: [xs.map((x: number, i: number) => [x, s.values[i]])] }))
    })
  } catch { return null }
}

function ChartBlock({ raw }: { raw: string }) {
  let chart: { type: 'bar' | 'line'; title?: string; labels: string[]; series: { name: string; values: number[] }[] } | null = null
  try {
    const value = JSON.parse(raw) as any
    if (['bar', 'line'].includes(value?.type) && Array.isArray(value.labels) && value.labels.length > 0 && value.labels.length <= 16 &&
      Array.isArray(value.series) && value.series.length > 0 && value.series.length <= 4 &&
      value.labels.every((x: unknown) => typeof x === 'string' && x.length <= 40) &&
      value.series.every((s: any) => typeof s.name === 'string' && Array.isArray(s.values) && s.values.length === value.labels.length && s.values.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)))) chart = value
  } catch { /* JSON inválido: se muestra como código normal */ }
  if (!chart) return <pre><code>{raw}</code></pre>
  const values = chart.series.flatMap((s) => s.values)
  const low = Math.min(0, ...values), high = Math.max(1, ...values)
  const y = (v: number) => 222 - ((v - low) / (high - low || 1)) * 180
  const zero = y(0), group = 500 / chart.labels.length
  const barW = Math.min(34, group / chart.series.length * 0.68)
  const points = (series: number[]) => series.map((v, i) => `${80 + group * (i + 0.5)},${y(v)}`).join(' ')
  return <figure className="chat-chart">
    {chart.title && <figcaption>{chart.title}</figcaption>}
    <svg viewBox="0 0 640 290" role="img" aria-label={chart.title || 'Gráfico de datos'}>
      <line x1="76" y1="42" x2="76" y2="222" className="chart-axis" />
      <line x1="76" y1={zero} x2="590" y2={zero} className="chart-axis" />
      {[0, 1, 2, 3].map((i) => { const value = high - (high - low) * i / 3; const yy = y(value); return <g key={i}><line x1="76" y1={yy} x2="590" y2={yy} className="chart-grid" /><text x="66" y={yy + 4} textAnchor="end" className="chart-tick">{Number(value.toFixed(2))}</text></g> })}
      {chart.type === 'bar' ? chart.series.flatMap((series, si) => series.values.map((v, i) => {
        const x = 80 + group * i + group / 2 - (barW * chart!.series.length) / 2 + si * barW
        const yy = y(v)
        return <rect key={series.name + i} x={x} y={Math.min(yy, zero)} width={barW - 3} height={Math.max(1, Math.abs(zero - yy))} rx="3" className={`chart-bar chart-series-${si}`}><title>{series.name}: {v}</title></rect>
      })) : chart.series.map((series, si) => <g key={series.name}><polyline points={points(series.values)} className={`chart-line chart-series-${si}`} />{series.values.map((v, i) => <circle key={i} cx={80 + group * (i + 0.5)} cy={y(v)} r="4" className={`chart-dot chart-series-${si}`}><title>{series.name}: {v}</title></circle>)}</g>)}
      {chart.labels.map((label, i) => <text key={label + i} x={80 + group * (i + 0.5)} y="248" textAnchor="middle" className="chart-label">{label.length > 12 ? label.slice(0, 11) + '…' : label}</text>)}
    </svg>
    <div className="chart-legend">{chart.series.map((series, i) => <span key={series.name}><i className={`chart-series-${i}`} />{series.name}</span>)}</div>
  </figure>
}

type GraphData = {
  type: 'graph'; title?: string; xMin: number; xMax: number; yMin: number; yMax: number
  series: { name: string; segments: number[][][] }[]
  points?: { x: number; y: number; label?: string }[]
}
function GraphBlock({ raw }: { raw: string }) {
  const [view,setView]=useState<{xMin:number;xMax:number;yMin:number;yMax:number}|null>(null)
  const [dragState,setDragState]=useState<{x:number;y:number}|null>(null)
  let graph:GraphData|null=null
  try {
    const v=JSON.parse(raw) as GraphData
    const domainOk=[v.xMin,v.xMax,v.yMin,v.yMax].every(Number.isFinite)&&v.xMin<v.xMax&&v.yMin<v.yMax
    const seriesOk=Array.isArray(v.series)&&v.series.length>0&&v.series.length<=6&&v.series.every(s=>typeof s.name==='string'&&Array.isArray(s.segments)&&s.segments.every(seg=>Array.isArray(seg)&&seg.length>=2&&seg.length<=500&&seg.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))))
    if(v.type==='graph'&&domainOk&&seriesOk)graph=v
  } catch { /* JSON inválido: se muestra como código */ }
  if(!graph)return <pre><code>{raw}</code></pre>
  const d=view??{xMin:graph.xMin,xMax:graph.xMax,yMin:graph.yMin,yMax:graph.yMax}
  const W=800,H=440,L=66,R=24,T=24,B=48
  const sx=(x:number)=>L+(x-d.xMin)/(d.xMax-d.xMin)*(W-L-R)
  const sy=(y:number)=>T+(d.yMax-y)/(d.yMax-d.yMin)*(H-T-B)
  const step=(range:number)=>{const rough=range/8,p=Math.pow(10,Math.floor(Math.log10(rough||1))),n=rough/p;return(n<1.5?1:n<3.5?2:n<7.5?5:10)*p}
  const xs:number[]=[],ys:number[]=[],dx=step(d.xMax-d.xMin),dy=step(d.yMax-d.yMin)
  for(let x=Math.ceil(d.xMin/dx)*dx;x<=d.xMax&&xs.length<30;x+=dx)xs.push(Number(x.toPrecision(6)))
  for(let y=Math.ceil(d.yMin/dy)*dy;y<=d.yMax&&ys.length<30;y+=dy)ys.push(Number(y.toPrecision(6)))
  const fmt=(n:number)=>Number(n.toPrecision(4)).toString()
  const down=(e:PointerEvent<SVGSVGElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);setDragState({x:e.clientX,y:e.clientY})}
  const move=(e:React.PointerEvent<SVGSVGElement>)=>{if(!dragState)return;const r=e.currentTarget.getBoundingClientRect(),ox=(e.clientX-dragState.x)/r.width*(d.xMax-d.xMin),oy=(e.clientY-dragState.y)/r.height*(d.yMax-d.yMin);setView({xMin:d.xMin-ox,xMax:d.xMax-ox,yMin:d.yMin+oy,yMax:d.yMax+oy});setDragState({x:e.clientX,y:e.clientY})}
  const wheel=(e:WheelEvent<SVGSVGElement>)=>{e.preventDefault();const f=e.deltaY<0?.85:1.18,cx=(d.xMin+d.xMax)/2,cy=(d.yMin+d.yMax)/2;setView({xMin:cx-(cx-d.xMin)*f,xMax:cx+(d.xMax-cx)*f,yMin:cy-(cy-d.yMin)*f,yMax:cy+(d.yMax-cy)*f})}
  return <figure className="chat-graph">
    <div className="chat-graph-head"><figcaption>{graph.title||'Gráfica cartesiana'}</figcaption><button className="btn ghost sm" onClick={()=>setView(null)}>Restablecer vista</button></div>
    <svg viewBox={'0 0 '+W+' '+H} role="img" aria-label={graph.title||'Gráfica interactiva'} onPointerDown={down} onPointerMove={move} onPointerUp={()=>setDragState(null)} onPointerCancel={()=>setDragState(null)} onWheel={wheel}>
      {xs.map(x=><g key={'x'+x}><line x1={sx(x)} y1={T} x2={sx(x)} y2={H-B} className="graph-grid"/><text x={sx(x)} y={H-B+20} textAnchor="middle" className="graph-tick">{fmt(x)}</text></g>)}
      {ys.map(y=><g key={'y'+y}><line x1={L} y1={sy(y)} x2={W-R} y2={sy(y)} className="graph-grid"/><text x={L-10} y={sy(y)+4} textAnchor="end" className="graph-tick">{fmt(y)}</text></g>)}
      {d.xMin<=0&&d.xMax>=0&&<line x1={sx(0)} y1={T} x2={sx(0)} y2={H-B} className="graph-axis"/>}
      {d.yMin<=0&&d.yMax>=0&&<line x1={L} y1={sy(0)} x2={W-R} y2={sy(0)} className="graph-axis"/>}
      {graph.series.map((s,i)=>s.segments.map((seg,k)=><polyline key={s.name+k} points={seg.map(p=>sx(p[0])+','+sy(p[1])).join(' ')} className={'graph-line graph-series-'+i}/>))}
      {(graph.points??[]).map((p,i)=><g key={i}><circle cx={sx(p.x)} cy={sy(p.y)} r="5" className="graph-point"/><text x={sx(p.x)+9} y={sy(p.y)-9} className="graph-point-label">{p.label||'('+fmt(p.x)+', '+fmt(p.y)+')'}</text></g>)}
      <text x={W-R} y={H-8} textAnchor="end" className="graph-axis-label">x</text><text x={L+8} y={T+10} className="graph-axis-label">y</text>
    </svg>
    <div className="graph-legend">{graph.series.map((s,i)=><span key={s.name}><i className={'graph-series-'+i}/>{s.name}</span>)}</div>
    <small className="graph-hint">Arrastrá para mover la vista · Usá la rueda del mouse para acercar o alejar</small>
  </figure>
}

function GeneratedImage({ id, alt }: { id: string; alt?: string }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    callFn<{ url: string }>('generated-image', { id })
      .then((result) => { if (active) setUrl(result.url) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [id])
  if (failed) return <span className="generated-image-error">No se pudo cargar esta imagen</span>
  if (!url) return <span className="generated-image-loading">Cargando imagen…</span>
  return <img src={url} alt={alt ?? 'Imagen generada por Cut-real'} loading="lazy" referrerPolicy="no-referrer" />
}

const components: Components = {
  pre: ({ children }) => {
    // ReactMarkdown puede entregar JSON dentro de <pre><code> aunque el bloque no tenga
    // una etiqueta de lenguaje reconocible. Detectarlo aquí evita mostrar datos de gráfica como código.
    const child = Children.toArray(children)[0]
    if (isValidElement(child)) {
      const raw = String((child.props as { children?: unknown }).children ?? '').replace(/\n$/, '')
      const graphJson = detectGraphJson(raw)
      if (graphJson) return <GraphBlock raw={graphJson} />
    }
    return <>{children}</>
  },
  code({ className, children }) {
    const lang = /language-([\w-]+)/.exec(className ?? '')?.[1]
    const text = String(children).replace(/\n$/, '')
    if (lang === 'chart') return <ChartBlock raw={text} />
    if (lang === 'graph') return <GraphBlock raw={text} />
    const graphJson = detectGraphJson(text)
    if (graphJson) return <GraphBlock raw={graphJson} />
    if (!lang && !text.includes('\n')) return <code>{children}</code>
    return (
      <pre>
        <div className="codehead"><span>{lang ?? 'texto'}</span><CopyButton text={text} label="Copiar código" /></div>
        <code className={className}>{text}</code>
      </pre>
    )
  },
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ src, alt }) => {
    if (typeof src !== 'string') return null
    if (src.startsWith('cutreal-image:')) return <GeneratedImage id={src.slice('cutreal-image:'.length)} alt={alt} />
    return /^https?:\/\//i.test(src) ? <img src={src} alt={alt ?? 'Imagen encontrada'} loading="lazy" referrerPolicy="no-referrer" /> : null
  },
  table: ({ children }) => {
    const nodes = Children.toArray(children)
    const body = nodes.find((node) => isValidElement(node) && node.type === 'tbody')
    if (!body || !Children.toArray((body as any).props.children).length) return null
    return <div className="tablewrap"><table>{children}</table></div>
  },
}

export const Markdown = memo(function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className={`md${streaming ? ' cursor' : ''}`}>
      <ReactMarkdown urlTransform={(url) => url.startsWith('cutreal-image:') ? url : defaultUrlTransform(url)} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]} components={components}>
        {normalizeHtmlArtifacts(normalizeMath(text))}
      </ReactMarkdown>
    </div>
  )
})
