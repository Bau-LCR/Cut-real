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

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code({ className, children }) {
    const lang = /language-([\w-]+)/.exec(className ?? '')?.[1]
    const text = String(children).replace(/\n$/, '')
    if (!lang && !text.includes('\n')) return <code>{children}</code>
    return (
      <pre>
        <div className="codehead"><span>{lang ?? 'texto'}</span><CopyButton text={text} label="Copiar código" /></div>
        <code className={className}>{text}</code>
      </pre>
    )
  },
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
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
