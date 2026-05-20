alter table public.results
  add column compilation_ms     float,
  add column first_inference_ms float,
  add column time_to_first_ms   float,
  add column average_ms         float,
  add column median_ms          float,
  add column best_ms            float,
  add column p90_ms             float,
  add column throughput_fps     float,
  add column inference_times    float[] not null default '{}';

create index idx_results_average_ms on public.results(average_ms);
create index idx_results_p90_ms     on public.results(p90_ms);
create index idx_results_best_ms    on public.results(best_ms);

alter table public.results drop column metrics;
