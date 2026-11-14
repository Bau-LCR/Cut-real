-- Marca las conversaciones técnicas temporales que se usan para mantener el contexto de una llamada.
-- Nunca se muestran en el historial de conversaciones normales.
alter table public.cr_conversations
  add column if not exists is_ephemeral boolean not null default false;

create or replace function public.cr_search_conversations(q text)
returns setof public.cr_conversations
language sql stable security invoker set search_path = public as $$
  select c.* from public.cr_conversations c
  where c.user_id = auth.uid()
    and not c.is_ephemeral
    and char_length(trim(q)) >= 2
    and (c.title ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or exists (select 1 from public.cr_messages m
                 where m.conversation_id = c.id
                   and m.content ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'))
  order by c.last_message_at desc limit 30
$$;
