-- Allow authenticated users to read display fields from any profile.
-- Required so recipe cards can show owner names and avatars for public recipes
-- owned by other users. Without this the profiles join silently returns null
-- (blocked by RLS) causing "? Unknown" in the recipe list.
create policy "Authenticated users can read public profile fields"
  on public.profiles for select
  using (auth.role() = 'authenticated');
