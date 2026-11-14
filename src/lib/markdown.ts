/** Muchos modelos escriben matemáticas con \( \) y \[ \]; remark-math espera $ y $$. Se omite el código. */
export function normalizeMath(md: string): string {
  return md.split(/(```[\s\S]*?```|`[^`\n]+`)/g).map((part, i) => i % 2 === 1 ? part
    : part.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$${m}$$\n`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`)).join('')
}


/** Convierte etiquetas HTML que algunos modelos imprimen como texto en Markdown legible.
 * Los bloques de código se preservan literalmente para no alterar ejemplos de programación.
 */
export function normalizeHtmlArtifacts(input: string): string {
  return input.split(/(```[\s\S]*?```|`[^`\n]+`)/g).map((part, index) => {
    if (index % 2 === 1) return part
    let value = part
    if (/&lt;\/?(?:br|ul|ol|li|table|thead|tbody|tr|td|th|p|div|h[1-6])\b/i.test(value)) {
      value = value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    }
    value = value.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_whole, body: string) => {
      const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => {
        const cells = [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)]
          .map((cell) => cell[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim())
        return cells.length ? '| ' + cells.join(' | ') + ' |' : ''
      }).filter(Boolean)
      if (rows.length > 1) rows.splice(1, 0, '| ' + rows[0].split('|').slice(1, -1).map(() => '---').join(' | ') + ' |')
      return '\n' + rows.join('\n') + '\n'
    })
    return value
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/li\s*>/gi, '\n')
      .replace(/<\/?(?:ul|ol|thead|tbody|tr|p|div|section|article|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<\/?(?:td|th)\b[^>]*>/gi, ' | ')
      .replace(/<\/?[a-z][a-z0-9-]*\b[^>]*>/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  }).join('')
}
