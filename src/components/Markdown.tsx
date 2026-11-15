import { memo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeHtmlArtifacts, normalizeMath } from '../lib/markdown'
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

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code({ className, children }) {
    const lang = /language-([\w-]+)/.exec(className ?? '')?.[1]
    const text = String(children).replace(/\n$/, '')
    if (lang === 'chart') return <ChartBlock raw={text} />
    if (!lang && !text.includes('\n')) return <code>{children}</code>
    return (
      <pre>
        <div className="codehead"><span>{lang ?? 'texto'}</span><CopyButton text={text} label="Copiar código" /></div>
        <code className={className}>{text}</code>
      </pre>
    )
  },
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ src, alt }) => typeof src === 'string' && /^https?:\\/\\//i.test(src)
    ? <img src={src} alt={alt ?? 'Imagen encontrada'} loading="lazy" referrerPolicy="no-referrer" />
    : null,
  table: ({ children }) => <div className="tablewrap"><table>{children}</table></div>,
}

export const Markdown = memo(function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className={`md${streaming ? ' cursor' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]} components={components}>
        {normalizeHtmlArtifacts(normalizeMath(text))}
      </ReactMarkdown>
    </div>
  )
})
