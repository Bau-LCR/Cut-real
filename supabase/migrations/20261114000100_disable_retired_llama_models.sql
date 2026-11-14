-- Cut-real 2: ocultar modelos Llama retirados/no funcionales.
-- No elimina registros ni conversaciones; solo evita que aparezcan como modelos disponibles.
update public.cr_models
set enabled = false
where lower(model_key) like '%llama%';
