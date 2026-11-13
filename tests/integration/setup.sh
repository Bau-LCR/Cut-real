#!/usr/bin/env bash
# Levanta: Postgres (con las migraciones reales) + PostgREST + servidor simulado + Edge Functions en Deno.
# Requiere: postgresql, PostgREST en /tmp/pgrst/postgrest, python3-requests, node (npx deno).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB=crint
service postgresql start >/dev/null 2>&1 || true; sleep 2
pkill -f postgrest || true; pkill -f mock_server.py || true; pkill -f "deno run" || true; sleep 1
su postgres -c "psql -q -c 'drop database if exists $DB with (force)' -c 'create database $DB'" 2>&1 | grep -v NOTICE || true
for f in "$ROOT/tests/db/stub.sql" "$ROOT"/supabase/migrations/*.sql; do su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $f" 2>&1 | grep -E "ERROR" && exit 1; done
su postgres -c "psql -q -d $DB" <<SQL
alter table public.cr_providers drop constraint cr_providers_base_url_check;           -- solo en test: el 'Groq' falso es http://
update public.cr_providers set base_url='http://127.0.0.1:54321/openai/v1' where slug='groq';
do \$\$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login password 'pw' noinherit; end if; end \$\$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to authenticator;
insert into auth.users (id,email,email_confirmed_at) values
 ('11111111-1111-1111-1111-111111111111','ana@example.com',now()),('22222222-2222-2222-2222-222222222222','owner@example.com',now()),('33333333-3333-3333-3333-333333333333','bob@example.com',now());
insert into cr_profiles (user_id,email,display_name) select id,email,split_part(email,'@',1) from auth.users;
insert into cr_user_roles (user_id,role) values ('11111111-1111-1111-1111-111111111111','user'),('22222222-2222-2222-2222-222222222222','owner'),('33333333-3333-3333-3333-333333333333','user');
insert into cr_user_settings (user_id) select id from auth.users;
grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
SQL
SECRET="test-secret-test-secret-test-secret-123456"
SERVICE_JWT=$(python3 - <<PY
import hmac,hashlib,base64,json
b=lambda x: base64.urlsafe_b64encode(x).rstrip(b'=')
h=b(json.dumps({"alg":"HS256","typ":"JWT"}).encode()); p=b(json.dumps({"role":"service_role","iss":"test"}).encode())
print((h+b'.'+p+b'.'+b(hmac.new(b"$SECRET",h+b'.'+p,hashlib.sha256).digest())).decode())
PY
)
pkill -f postgrest || true; pkill -f mock_server.py || true; pkill -f "deno run" || true; sleep 1
PGRST_DB_URI="postgres://authenticator:pw@127.0.0.1/$DB" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT=54322 setsid nohup /tmp/pgrst/postgrest >/tmp/postgrest.log 2>&1 &
setsid nohup python3 "$ROOT/tests/integration/mock_server.py" >/tmp/mock.log 2>&1 &
cd "$ROOT"
for pair in chat:8001 admin:8002 api:8003; do
  fn=${pair%%:*}; port=${pair##*:}
  SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY="$SERVICE_JWT" GROQ_API_KEY=test-groq DENO_SERVE_ADDRESS=tcp:127.0.0.1:$port \
    setsid nohup npx deno run -A --no-lock supabase/functions/$fn/index.ts >/tmp/fn-$fn.log 2>&1 &
done
sleep 14; echo 'servicios arriba'; tail -n 2 /tmp/postgrest.log; tail -n 2 /tmp/fn-chat.log
