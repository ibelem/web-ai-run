create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.orgs (name) values
  ('Xenova'),
  ('onnx-community'),
  ('webnn'),
  ('webgpu'),
  ('litert-community');

alter table public.orgs enable row level security;

create policy "public read orgs" on public.orgs
  for select using (true);

create policy "admin manage orgs" on public.orgs
  for all using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
