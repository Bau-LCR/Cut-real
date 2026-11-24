-- Permite que cada usuario actualice únicamente su preferencia de apariencia.
-- La política RLS cr_settings_update sigue limitando la fila a auth.uid().
grant update (appearance) on public.cr_user_settings to authenticated;
