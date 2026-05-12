create table public.results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  user_id uuid not null references public.profiles(id) on delete cascade,
  model_id text not null,
  backend text not null,
  data_type text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'timeout', 'crashed', 'error')),
  timeout_phase text
    check (timeout_phase in ('download', 'compilation', 'inference') or timeout_phase is null),
  error_message text,
  cpu text not null,
  gpu text not null,
  os text not null,
  os_version text not null,
  browser text not null,
  browser_version text not null,
  metrics jsonb,
  iterations integer not null,
  iterations_completed integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_results_user on public.results(user_id);
create index idx_results_model on public.results(model_id);
create index idx_results_run on public.results(run_id);
create index idx_results_status on public.results(user_id, status);
create index idx_results_created on public.results(created_at desc);

alter table public.results enable row level security;

-- Users can read their own results
create policy "Users can read own results"
  on public.results for select
  using (auth.uid() = user_id);

-- Intel/Admin can read all results (hidden leaderboard)
create policy "Intel and Admin can read all results"
  on public.results for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('intel', 'admin'));

-- Members+ can insert their own results
create policy "Members can insert own results"
  on public.results for insert
  with check (auth.uid() = user_id);

-- Members+ can update their own running results (two-phase write)
create policy "Members can update own running results"
  on public.results for update
  using (auth.uid() = user_id and status = 'running');
