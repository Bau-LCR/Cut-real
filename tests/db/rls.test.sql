-- Pruebas de seguridad de las migraciones (ejecutar con psql sobre una base con stubs o Supabase local).
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; raise exception 'FALLO (debía rechazarse): %', label;
  exception when insufficient_privilege or check_violation or others then
    if sqlerrm like 'FALLO%' then raise; end if;
    raise notice 'ok  rechazado: %', label;
  end;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'bob@example.com', now()),
  ('00000000-0000-0000-0000-0000000000c3', 'alice@example.com', now());
insert into cutreal_private.config values ('initial_admin_email', 'OWNER@example.com');

-- Bootstrap: solo el correo configurado se convierte en owner, y una sola vez
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select cr_ensure_profile();
reset role;
do $$ begin assert (select role from cr_user_roles where user_id='00000000-0000-0000-0000-0000000000b2')='user', 'bob no debe ser owner'; end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select cr_ensure_profile();
reset role;
do $$ begin assert (select role from cr_user_roles where user_id='00000000-0000-0000-0000-0000000000a1')='owner', 'owner no promovido'; end $$;
update auth.users set email='owner@example.com' where id='00000000-0000-0000-0000-0000000000c3'; -- segundo con mismo correo imposible; simulamos intento
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
select cr_ensure_profile();
reset role;
do $$ begin assert (select role from cr_user_roles where user_id='00000000-0000-0000-0000-0000000000c3')='user', 'segundo owner no permitido'; end $$;
update auth.users set email='alice@example.com' where id='00000000-0000-0000-0000-0000000000c3';

-- Bob: crea conversación; Alice no puede verla
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
insert into cr_conversations (user_id, title) values ('00000000-0000-0000-0000-0000000000b2', 'Secreto de Bob');
select pg_temp.expect_fail($$insert into cr_conversations (user_id, title) values ('00000000-0000-0000-0000-0000000000c3','suplantación')$$, 'crear conversación a nombre de otro');
select pg_temp.expect_fail($$update cr_user_roles set role='admin'$$, 'auto-promoverse a admin');
select pg_temp.expect_fail($$insert into cr_user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000b2','admin') on conflict (user_id) do update set role='admin'$$, 'insertar rol admin');
select pg_temp.expect_fail($$update cr_profiles set email='x@y.z'$$, 'editar email del perfil (columna protegida)');
select pg_temp.expect_fail($$insert into cr_messages (conversation_id, user_id, role, content) select id, user_id, 'assistant', 'falso' from cr_conversations$$, 'insertar mensajes desde el navegador');
select pg_temp.expect_fail($$select * from cr_api_keys$$, 'leer api keys');
select pg_temp.expect_fail($$select * from cr_audit_logs$$, 'leer auditoría');
select pg_temp.expect_fail($$select * from cr_providers$$, 'leer proveedores (api_key_env)');
select pg_temp.expect_fail($$select cr_rate_limit('x',1,60)$$, 'invocar cr_rate_limit');
select pg_temp.expect_fail($$select cr_admin_stats(7)$$, 'invocar cr_admin_stats');
select pg_temp.expect_fail($$select * from cutreal_private.config$$, 'leer config privada');
do $$ begin assert (select count(*) from cr_available_models) = 4, 'catálogo de modelos habilitados'; end $$;

reset role;
insert into cr_messages (conversation_id, user_id, role, content)
  select id, user_id, 'user', 'hola mundo búsqueda' from cr_conversations;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from cr_messages) = 1, 'bob ve su mensaje';
  assert (select count(*) from cr_search_conversations('búsq')) = 1, 'búsqueda por contenido';
  assert (select count(*) from cr_search_conversations('%')) = 0, 'comodín % escapado';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select count(*) from cr_conversations) = 0, 'alice NO ve conversaciones de bob';
  assert (select count(*) from cr_messages) = 0, 'alice NO ve mensajes de bob';
  assert (select count(*) from cr_search_conversations('Secreto')) = 0, 'búsqueda no cruza usuarios';
end $$;
delete from cr_conversations; -- no borra nada ajeno
reset role;
do $$ begin assert (select count(*) from cr_conversations)=1, 'alice no pudo borrar la conversación de bob'; end $$;

-- Suspensión: bob suspendido ya no lee nada
update cr_user_roles set suspended = true where user_id='00000000-0000-0000-0000-0000000000b2';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin assert (select count(*) from cr_conversations) = 0, 'suspendido no lee conversaciones'; end $$;
reset role;

-- Rate limit (service_role)
set role service_role;
do $$ begin
  assert cr_rate_limit('t', 2, 60), 'hit 1'; assert cr_rate_limit('t', 2, 60), 'hit 2'; assert not cr_rate_limit('t', 2, 60), 'hit 3 bloqueado';
end $$;
reset role;
\echo 'TODAS LAS PRUEBAS RLS PASARON'
