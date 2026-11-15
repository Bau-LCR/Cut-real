-- Modelo multimodal auxiliar para dar visión indirecta a modelos de texto como GPT-OSS.
-- GPT-OSS continúa generando la respuesta; Qwen describe las imágenes y su análisis se agrega al contexto.
insert into public.cr_models (
  provider_id, model_key, display_name, enabled, supports_vision,
  context_window, max_output_tokens, sort_order
)
select p.id, 'qwen/qwen3.8-27b', 'Qwen 3.8 27B (Visión auxiliar)', true, true,
       131072, 4096, 25
from public.cr_providers p
where p.slug = 'groq'
on conflict (provider_id, model_key) do update
set display_name = excluded.display_name,
    enabled = true,
    supports_vision = true,
    context_window = excluded.context_window,
    max_output_tokens = excluded.max_output_tokens;
