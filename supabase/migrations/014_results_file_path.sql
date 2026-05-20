alter table public.results add column file_path text not null default '';

create index idx_results_model_file on public.results(model_id, file_path);
