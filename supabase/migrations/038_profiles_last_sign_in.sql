-- Denormalized last-sign-in timestamp on profiles, kept in sync by a trigger
-- on account_events (same pattern as conversations.last_message_at in
-- 036_support_messaging.sql). Avoids an aggregate query per admin page load.
alter table public.profiles add column last_sign_in_at timestamptz;

create function public.bump_last_sign_in() returns trigger as $$
begin
  if new.event_type = 'sign_in' then
    update public.profiles set last_sign_in_at = new.created_at where id = new.user_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_account_event_sign_in
  after insert on public.account_events
  for each row execute function public.bump_last_sign_in();
