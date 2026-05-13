alter table public.models add column category text not null default 'uncategorized';
create index idx_models_category on public.models(category);
create index idx_models_data_type on public.models(data_type);
