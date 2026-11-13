// Genera derivados del logo oficial SIN alterar su diseño:
// solo recorta el margen transparente y cambia el tamaño. Los originales no se modifican.
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

const SRC = 'public/brand/Logo_Original.png'
const trimmed = await sharp(SRC).trim({ threshold: 1 }).toBuffer() // quita solo píxeles transparentes
const meta = await sharp(trimmed).metadata()
const side = Math.max(meta.width, meta.height)
const squared = await sharp(trimmed)
  .extend({
    top: Math.floor((side - meta.height) / 2), bottom: Math.ceil((side - meta.height) / 2),
    left: Math.floor((side - meta.width) / 2), right: Math.ceil((side - meta.width) / 2),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).toBuffer()

const sizes = { 'favicon-16.png': 16, 'favicon-32.png': 32, 'favicon-48.png': 48, 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 }
for (const [name, px] of Object.entries(sizes)) {
  // 6% de aire para que no toque el borde; fondo transparente (apple-touch usa carbón porque iOS no admite alfa)
  const pad = Math.round(px * 0.06)
  const bg = name === 'apple-touch-icon.png' ? { r: 14, g: 15, b: 18, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 }
  await sharp(squared).resize(px - pad * 2, px - pad * 2, { fit: 'contain' })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: bg })
    .png().toFile(`public/brand/${name}`)
}
// favicon.ico (PNG embebido, formato ICO válido)
const png32 = await sharp(`public/brand/favicon-32.png`).toBuffer()
const head = Buffer.alloc(22)
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4)
head[6] = 32; head[7] = 32; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12)
head.writeUInt32LE(png32.length, 14); head.writeUInt32LE(22, 18)
await writeFile('public/favicon.ico', Buffer.concat([head, png32]))
console.log('Brand assets listos')
