alter table public.models drop column enabled;
drop index if exists idx_models_enabled;

alter table public.orgs drop column enabled;
