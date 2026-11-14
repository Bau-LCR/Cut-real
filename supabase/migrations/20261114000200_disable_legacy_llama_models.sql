-- Retira los dos modelos Llama solicitados del selector de Cut-real.
-- En la configuración vigente el modelo rápido registrado es Llama 3.1 8B
-- (llama-3.1-8b-instant); no existe un registro 80B.
update public.cr_models
   set enabled = false
 where model_key in ('llama-3.3-70b-versatile', 'llama-3.1-8b-instant');

-- Evita que una preferencia predeterminada apunte a uno de los modelos retirados.
update public.cr_user_settings
   set default_model_id = null, updated_at = now()
 where default_model_id in (
   select id from public.cr_models
    where model_key in ('llama-3.3-70b-versatile', 'llama-3.1-8b-instant')
 );
