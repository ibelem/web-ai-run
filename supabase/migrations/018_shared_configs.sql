-- Shared benchmark configurations (short URL for sharing run page state)
create table public.shared_configs (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  config jsonb not null,
  created_at timestamptz not null default now()
);

-- Anyone can read shared configs (they're meant to be shared)
alter table public.shared_configs enable row level security;

create policy "Shared configs are publicly readable"
  on public.shared_configs for select using (true);

create policy "Authenticated users can create shared configs"
  on public.shared_configs for insert
  with check (auth.uid() = owner_id);

create policy "Owners can delete their shared configs"
  on public.shared_configs for delete
  using (auth.uid() = owner_id);
