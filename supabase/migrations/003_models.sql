create table public.models (
  id uuid primary key default gen_random_uuid(),
  hf_model_id text not null,
  file_path text not null,
  data_type text not null,
  size_bytes bigint not null,
  runtime text not null check (runtime in ('onnx', 'litert')),
  source_org text not null,
  last_synced timestamptz not null default now(),
  unique(hf_model_id, file_path)
);

create index idx_models_runtime on public.models(runtime);
create index idx_models_source on public.models(source_org);

alter table public.models enable row level security;

-- Anyone can read models (public catalog)
create policy "Anyone can read models"
  on public.models for select
  using (true);

-- Only service role can insert/update (Edge Function sync)
create policy "Service role can manage models"
  on public.models for all
  using (auth.role() = 'service_role');
