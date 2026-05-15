alter table public.models
  add column enabled boolean not null default true;

create index idx_models_enabled on public.models(enabled);

-- Allow admins to update models (toggle enabled flag)
create policy "Admins can update models"
  on public.models for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
