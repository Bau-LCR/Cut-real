-- Agrega la categoría de simulación científica al espacio de proyectos.
alter table public.cr_work_projects
  drop constraint if exists cr_work_projects_category;
alter table public.cr_work_projects
  add constraint cr_work_projects_category
  check (category in ('investigacion','presentacion','documento','diseno','programacion','datos','multimedia','simulacion','otro'));
