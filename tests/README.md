# Pruebas

| Qué | Cómo | Requiere |
|---|---|---|
| Unitarias (17) | `npm test` | Node |
| Tipos + build + secretos | `npm run verify` | Node |
| Edge Functions (tipos) | `npx deno check supabase/functions/*/index.ts` | Node (descarga Deno vía npm) |
| Base de datos / RLS | Aplicar `tests/db/stub.sql`, las migraciones y `tests/db/rls.test.sql` con `psql` sobre un Postgres vacío (el stub imita `auth`/`storage` de Supabase) | PostgreSQL |
| Integración del backend (62) | `bash tests/integration/setup.sh && python3 tests/integration/run_tests.py` | PostgreSQL, binario de PostgREST en `/tmp/pgrst/postgrest`, Deno, `python3-requests`. Usa un Groq falso; las funciones y el SQL son los reales |
| Interfaz (20) | `VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=x npx vite --port 5199` y `python3 tests/e2e/ui_smoke.py http://localhost:5199` | `pip install playwright` + Chromium |

Ninguna prueba usa credenciales reales ni llama a servicios externos.
