create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null unique,
  visibility text not null default 'personal' check (visibility in ('personal', 'public')),
  models jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_recipes_slug on public.recipes(slug);
create index idx_recipes_owner on public.recipes(owner_id);

alter table public.recipes enable row level security;

-- Anyone can read public recipes
create policy "Anyone can read public recipes"
  on public.recipes for select
  using (visibility = 'public');

-- Owners can read their own recipes
create policy "Owners can read own recipes"
  on public.recipes for select
  using (auth.uid() = owner_id);

-- Members+ can create recipes
create policy "Members can create recipes"
  on public.recipes for insert
  with check (auth.uid() = owner_id);

-- Owners can update their recipes
create policy "Owners can update own recipes"
  on public.recipes for update
  using (auth.uid() = owner_id);

-- Owners can delete their recipes
create policy "Owners can delete own recipes"
  on public.recipes for delete
  using (auth.uid() = owner_id);
