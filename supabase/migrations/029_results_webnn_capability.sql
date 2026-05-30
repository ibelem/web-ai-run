alter table public.results
  add column if not exists webnn_capability jsonb;

create index if not exists idx_results_webnn_capability_ops
  on public.results using gin ((webnn_capability -> 'unsupported_ops'));
