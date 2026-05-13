-- Fix: Google OAuth stores avatar as 'picture', not 'avatar_url'
-- Update the handle_new_user trigger to check both fields

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Backfill existing Google users who have null avatar_url but have 'picture' in metadata
update public.profiles p
set avatar_url = u.raw_user_meta_data ->> 'picture'
from auth.users u
where p.id = u.id
  and p.avatar_url is null
  and u.raw_user_meta_data ->> 'picture' is not null;
