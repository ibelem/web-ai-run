-- Allow admin role to delete any result
create policy "Admins can delete any result"
  on public.results for delete
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
