alter table public.recipes
  add column description text,
  add column links jsonb not null default '[]';
