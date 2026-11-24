-- Preferencia visual sincronizada por cuenta y compartida entre dispositivos.
alter table public.cr_user_settings
  add column if not exists appearance text not null default 'original'
  check (appearance in ('original', 'white', 'liquid-glass', 'cybercore'));
