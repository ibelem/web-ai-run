-- Last time the user actually loaded a page (throttled by the app), as opposed
-- to last_sign_in_at which only records explicit sign-in events.
alter table public.profiles add column last_seen_at timestamptz;

update public.profiles set last_seen_at = last_sign_in_at where last_sign_in_at is not null;

-- Security definer so a user can bump only their own timestamp without
-- needing a broader UPDATE policy on profiles.
create function public.touch_last_seen() returns void as $$
begin
  update public.profiles set last_seen_at = now() where id = auth.uid();
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
