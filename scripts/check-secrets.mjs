// Busca secretos expuestos en el proyecto y en el build. Falla (exit 1) si encuentra alguno.
// Uso: npm run check:secrets   (también corre en el workflow de GitHub antes de publicar)
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.temp'])
const SKIP_FILES = new Set(['package-lock.json'])
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.mjs.map'])

const PATTERNS = [
  ['Clave de Groq', /gsk_[A-Za-z0-9]{20,}/],
  ['Clave estilo OpenAI/otros (sk-…)', /\bsk-[A-Za-z0-9_-]{24,}/],
  ['Clave de Google (AIza…)', /AIza[0-9A-Za-z_-]{35}/],
  ['Secreto de cliente OAuth de Google', /GOCSPX-[A-Za-z0-9_-]{20,}/],
  ['Clave de Tavily', /tvly-[A-Za-z0-9_-]{20,}/],
  ['API key propia de Cut-real (crk_…)', /crk_[A-Za-z0-9_-]{43}/],
  ['API key de Memory Task (mt_live_…)', /mt_live_[A-Za-z0-9_-]{40,}/],
  ['JWT (¿anon/service_role pegada?)', /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ['Clave privada', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Token de GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['Secreto de Supabase (sb_secret_…)', /sb_secret_[A-Za-z0-9_-]{10,}/],
]

// Nombres de secretos que NUNCA deben aparecer en el código del navegador ni en el build.
const FRONTEND_FORBIDDEN = [/SERVICE_ROLE/i, /service_role/, /GROQ_API_KEY/, /GEMINI_API_KEY/, /TAVILY_API_KEY/, /TTS_API_KEY/, /GOOGLE_CLIENT_SECRET/, /MEMORY_TASK_API_KEY/, /MEMORY_TASK_IDENTITY_PRIVATE_JWK/]

const found = []
function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p, visit) }
    else if (!SKIP_FILES.has(name) && !BINARY.has(extname(name).toLowerCase())) visit(p)
  }
}

walk('.', (p) => {
  const text = readFileSync(p, 'utf8')
  for (const [label, re] of PATTERNS) if (re.test(text)) found.push(`${p}: ${label}`)
  if (/(^|\/)(?:\.env(\.[a-z]+)?|memory-task-secrets\.env)$/.test(p) && !p.endsWith('.example')) {
    const filled = text.split('\n').filter((l) => /^[A-Z0-9_]+=\S+/.test(l))
    if (filled.length) found.push(`${p}: archivo .env con valores (no debe ir en el repositorio ni en el ZIP)`)
  }
})

// El frontend (src/) y el build (dist/) no pueden mencionar secretos del servidor.
for (const root of ['src', 'dist']) {
  if (!existsSync(root)) continue
  walk(root, (p) => { const t = readFileSync(p, 'utf8'); for (const re of FRONTEND_FORBIDDEN) if (re.test(t)) found.push(`${p}: referencia a un secreto de servidor (${re})`) })
}

// Las variables VITE_* son públicas: solo se permiten las dos de Supabase y la ruta base.
const envEx = existsSync('.env.example') ? readFileSync('.env.example', 'utf8') : ''
for (const m of envEx.matchAll(/^(VITE_[A-Z_]+)=/gm)) if (!['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_BASE'].includes(m[1])) found.push(`.env.example: variable pública inesperada ${m[1]}`)

if (found.length) { console.error('✖ Posibles secretos expuestos:\n' + found.map((f) => '  - ' + f).join('\n')); process.exit(1) }
console.log('✔ Sin secretos expuestos (patrones de claves, .env con valores, y secretos de servidor en src/ y dist/).')
