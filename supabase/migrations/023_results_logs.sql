alter table public.results add column if not exists logs text[] not null default '{}';
