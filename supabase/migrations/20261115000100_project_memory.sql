-- Una conversación técnica persistente y privada por proyecto.
-- Permite continuar solicitudes sin reiniciar el historial en cada modificación.
alter table public.cr_code_projects
  add column if not exists code_conversation_id uuid null
  references public.cr_conversations(id) on delete set null;

create index if not exists cr_code_projects_code_conversation_idx
  on public.cr_code_projects (code_conversation_id)
  where code_conversation_id is not null;
