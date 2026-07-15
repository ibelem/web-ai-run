alter table public.results     rename column webnn_capability to capability;
alter table public.results_llm rename column webnn_capability to capability;

alter index if exists idx_results_webnn_capability_ops
  rename to idx_results_capability_ops;
