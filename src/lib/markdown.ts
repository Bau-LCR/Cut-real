/** Muchos modelos escriben matemáticas con \( \) y \[ \]; remark-math espera $ y $$. Se omite el código. */
export function normalizeMath(md: string): string {
  return md.split(/(```[\s\S]*?```|`[^`\n]+`)/g).map((part, i) => i % 2 === 1 ? part
    : part.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$${m}$$\n`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`)).join('')
}
