alter table public.models rename column category to task;
drop index if exists idx_models_category;
create index idx_models_task on public.models(task);
