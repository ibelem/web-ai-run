drop policy if exists "Members can update own running results" on public.results;

create policy "Members can update own results"
  on public.results for update
  using (auth.uid() = user_id and status = 'running')
  with check (auth.uid() = user_id);
