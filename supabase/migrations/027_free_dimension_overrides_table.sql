-- Drop the column added in 026 (already ran)
alter table public.models drop column if exists free_dimension_overrides;

-- Standalone table: works for any model, even those not in the catalog
create table public.free_dimension_overrides (
  id uuid primary key default gen_random_uuid(),
  hf_model_id text not null,
  file_path text not null,
  overrides jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hf_model_id, file_path)
);

create index idx_fdo_model on public.free_dimension_overrides(hf_model_id);

alter table public.free_dimension_overrides enable row level security;

-- Anyone can read (needed by /run page cache)
create policy "Anyone can read overrides"
  on public.free_dimension_overrides for select
  using (true);

-- Intel+ can manage
create policy "Intel and admin can manage overrides"
  on public.free_dimension_overrides for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('intel', 'admin')
  );
