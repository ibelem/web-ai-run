-- Account/security event log for admin investigation of support requests, abuse
-- reports, and account issues. Deliberately narrow — discrete, security-relevant
-- events rather than full page-view/behavioral tracking.
create table public.account_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'sign_in', 'role_changed', 'result_uploaded', 'result_deleted', 'recipe_deleted'
  )),
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index account_events_user_id_created_at_idx on public.account_events(user_id, created_at desc);

alter table public.account_events enable row level security;

-- Only 'sign_in' may be self-reported by the signing-in user (see
-- src/routes/login/+page.svelte and src/routes/auth/callback/+server.ts).
-- Every other event type is written by a security-definer trigger below,
-- which bypasses RLS as the function owner — so a client can never forge a
-- role_changed/result_uploaded/etc. row for itself.
create policy "Users can log their own sign-ins"
  on public.account_events for insert
  with check (auth.uid() = user_id and event_type = 'sign_in');

create policy "Admins can read all account events"
  on public.account_events for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can delete account events"
  on public.account_events for delete
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── Role changes ─────────────────────────────────────────────────────────
create function public.log_role_changed() returns trigger as $$
begin
  if old.role is distinct from new.role then
    insert into public.account_events (user_id, event_type, metadata)
    values (new.id, 'role_changed', jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_profile_role_change
  after update on public.profiles
  for each row execute function public.log_role_changed();

-- ── Benchmark results uploaded/deleted ──────────────────────────────────
create function public.log_result_uploaded() returns trigger as $$
begin
  insert into public.account_events (user_id, event_type, metadata)
  values (new.user_id, 'result_uploaded', jsonb_build_object('table', tg_table_name, 'result_id', new.id));
  return new;
end;
$$ language plpgsql security definer;

create function public.log_result_deleted() returns trigger as $$
begin
  insert into public.account_events (user_id, event_type, metadata)
  values (old.user_id, 'result_deleted', jsonb_build_object('table', tg_table_name, 'result_id', old.id));
  return old;
end;
$$ language plpgsql security definer;

create trigger on_result_insert after insert on public.results
  for each row execute function public.log_result_uploaded();
create trigger on_result_delete after delete on public.results
  for each row execute function public.log_result_deleted();

create trigger on_result_llm_insert after insert on public.results_llm
  for each row execute function public.log_result_uploaded();
create trigger on_result_llm_delete after delete on public.results_llm
  for each row execute function public.log_result_deleted();

-- ── Recipe deleted ───────────────────────────────────────────────────────
create function public.log_recipe_deleted() returns trigger as $$
begin
  insert into public.account_events (user_id, event_type, metadata)
  values (old.owner_id, 'recipe_deleted', jsonb_build_object('recipe_id', old.id, 'name', old.name, 'kind', old.kind));
  return old;
end;
$$ language plpgsql security definer;

create trigger on_recipe_delete after delete on public.recipes
  for each row execute function public.log_recipe_deleted();
