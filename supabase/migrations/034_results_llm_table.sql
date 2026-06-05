create table public.results_llm (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid,

  hf_model_id text not null,
  model_dir text,
  data_type text not null,

  backend text not null,
  runtime text not null,
  runtime_version text not null,
  prompt text not null,
  prompt_tokens int,
  max_new_tokens int not null,
  runs int not null,
  warmup_runs int not null default 1,

  status text not null,
  error_message text,
  error_phase text,

  ttft_ms float,
  ttft_p90_ms float,
  tpot_ms float,
  tps float,
  decode_ms float,
  e2e_ms float,
  e2e_tps float,
  output_tokens int,

  compilation_ms float,
  load_and_compile_ms float,
  warmup_ttft_ms float,

  ttft_ms_runs jsonb,
  decode_ms_runs jsonb,
  tps_runs jsonb,
  e2e_ms_runs jsonb,

  cpu text,
  gpu text,
  os text,
  browser text,
  browser_version text,
  gpu_driver_version text,
  npu_driver_version text,

  webnn_ep text,
  webnn_capability jsonb,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index results_llm_user_id_idx       on public.results_llm(user_id);
create index results_llm_hf_model_id_idx   on public.results_llm(hf_model_id);
create index results_llm_completed_at_idx  on public.results_llm(completed_at desc);
create index results_llm_run_id_idx        on public.results_llm(run_id);

alter table public.results_llm enable row level security;

create policy "Users can view own llm results"
  on public.results_llm for select using (auth.uid() = user_id);

create policy "Public llm results visible"
  on public.results_llm for select using (true);

create policy "Users can insert own llm results"
  on public.results_llm for insert with check (auth.uid() = user_id);

create policy "Users can delete own llm results"
  on public.results_llm for delete using (auth.uid() = user_id);

create policy "Admins can delete any llm result"
  on public.results_llm for delete
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
