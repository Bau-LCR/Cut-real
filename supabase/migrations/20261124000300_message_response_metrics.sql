-- Métricas de rendimiento por respuesta de Cut-real.
alter table public.cr_messages
  add column if not exists token_usage integer check (token_usage is null or token_usage >= 0),
  add column if not exists duration_ms integer check (duration_ms is null or duration_ms >= 0);
