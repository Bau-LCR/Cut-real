-- Datos iniciales. Editables luego desde el panel de administración.
-- Verificá los IDs vigentes en https://console.groq.com/docs/models antes de usarlos.

insert into public.cr_providers (slug, name, base_url, api_key_env, enabled, rpm_limit) values
  ('groq',   'Groq',                     'https://api.groq.com/openai/v1',                          'GROQ_API_KEY',   true,  30),
  ('gemini', 'Google Gemini (AI Studio)', 'https://generativelanguage.googleapis.com/v1beta/openai', 'GEMINI_API_KEY', false, 15)
on conflict (slug) do nothing;

insert into public.cr_models (provider_id, model_key, display_name, enabled, supports_vision, context_window, max_output_tokens, sort_order)
select p.id, v.model_key, v.display_name, v.enabled, v.vision, v.ctx, v.max_out, v.ord
from (values
  ('groq',   'llama-3.3-70b-versatile', 'Llama 3.3 70B',           true,  false, 131072, 8192, 10),
  ('groq',   'llama-3.1-8b-instant',    'Llama 3.1 8B (rápido)',   true,  false, 131072, 8192, 20),
  ('groq',   'openai/gpt-oss-120b',     'GPT-OSS 120B',            true,  false, 131072, 8192, 30),
  ('groq',   'openai/gpt-oss-20b',      'GPT-OSS 20B',             true,  false, 131072, 8192, 40),
  -- Gemini queda deshabilitado hasta configurar GEMINI_API_KEY y habilitarlo desde el panel.
  ('gemini', 'gemini-2.5-flash',        'Gemini 2.5 Flash',        false, true,  1048576, 8192, 50)
) as v(slug, model_key, display_name, enabled, vision, ctx, max_out, ord)
join public.cr_providers p on p.slug = v.slug
on conflict (provider_id, model_key) do nothing;

-- Memory Task: registro vacío y DESHABILITADO. No se asume nada de su estructura.
insert into public.cr_integrations (slug, name, status, allowed_scopes) values
  ('memory-task', 'Memory Task', 'disabled', array['identity:read', 'conversations:read', 'conversations:write'])
on conflict (slug) do nothing;
