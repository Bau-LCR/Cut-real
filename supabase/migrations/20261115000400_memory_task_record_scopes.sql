-- Permisos reales de lectura y escritura para la API de registros de Memory Task.
update public.cr_integrations
   set allowed_scopes = array['identity:read', 'records:read', 'records:write']
 where slug = 'memory-task';
