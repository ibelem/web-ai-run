alter table public.recipes
  add column featured boolean not null default false,
  add column featured_order integer;

create index idx_recipes_featured on public.recipes(featured, featured_order)
  where featured = true;

-- Admins can update featured/featured_order on any public recipe
create policy "Admins can feature recipes"
  on public.recipes for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
