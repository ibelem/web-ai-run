-- Storage RLS for avatars bucket.
-- The bucket itself must be created as a PUBLIC bucket in the Supabase dashboard
-- (Storage → New bucket → Name: "avatars", Public: true) before applying policies.

-- Allow authenticated users to upload/update/delete only their own folder.
-- Object paths are: {userId}/avatar.jpg
-- storage.foldername(name) returns an array; element [1] is the first path segment.
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

create policy "Users manage own avatar"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Public read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
