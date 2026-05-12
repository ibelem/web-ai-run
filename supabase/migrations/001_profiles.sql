-- Profiles table: extends Supabase auth.users with app-specific fields
create type public.app_role as enum ('anonymous', 'member', 'partner', 'intel', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'member',
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: users can read their own profile, admins can read all
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can read all profiles"
  on public.profiles for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Users can update own profile (non-role fields)"
  on public.profiles for update
  using (auth.uid() = id)
  with check (role = (select role from public.profiles where id = auth.uid()));

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Function to set custom claims (role) in JWT
create or replace function public.set_user_role(target_user_id uuid, new_role public.app_role)
returns void as $$
begin
  -- Only admins can call this
  if (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' then
    raise exception 'Only admins can set roles';
  end if;

  update public.profiles set role = new_role, updated_at = now() where id = target_user_id;
  update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', new_role) where id = target_user_id;
end;
$$ language plpgsql security definer;
