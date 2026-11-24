-- Distingue consumo real informado por el proveedor de estimaciones del servidor.
alter table public.cr_messages
  add column if not exists usage_exact boolean not null default false;
