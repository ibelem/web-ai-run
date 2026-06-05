alter table public.recipes
  add column kind text not null default 'inference'
  check (kind in ('inference', 'llm'));
