-- Allow users to delete their own results
create policy "Users can delete own results"
  on public.results for delete
  using (auth.uid() = user_id);
