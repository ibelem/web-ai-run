-- 036_support_messaging.sql
-- User<->admin threaded messaging + public FAQ.

-- ── Tables ────────────────────────────────────────────────────────────────
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in ('bug','feature','howto','other')),
  subject     text,
  status      text not null default 'open' check (status in ('open','resolved')),
  is_public   boolean not null default false,
  assigned_to uuid references auth.users(id),
  search_tsv  tsvector,
  last_message_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index conversations_user_id_idx  on public.conversations(user_id);
create index conversations_public_idx    on public.conversations(is_public) where is_public = true;
create index conversations_last_msg_idx  on public.conversations(last_message_at desc);
create index conversations_search_idx    on public.conversations using gin(search_tsv);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id),
  body            text not null,
  attachments     jsonb not null default '[]'::jsonb,
  is_internal     boolean not null default false,
  created_at      timestamptz not null default now()
);
create index messages_conversation_id_idx on public.messages(conversation_id, created_at);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ── Triggers ──────────────────────────────────────────────────────────────
-- Bump last_message_at on new message.
create function public.bump_conversation() returns trigger as $$
begin
  update public.conversations
     set last_message_at = new.created_at, updated_at = now()
   where id = new.conversation_id;
  return new;
end; $$ language plpgsql security definer;

create trigger on_message_insert
  after insert on public.messages
  for each row execute function public.bump_conversation();

-- Restrict non-admin owners to editing only is_public and status.
create function public.guard_conversation_update() returns trigger as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' then
    return new;
  end if;
  if new.user_id is distinct from old.user_id
     or new.category is distinct from old.category
     or new.subject is distinct from old.subject
     or new.assigned_to is distinct from old.assigned_to then
    raise exception 'Only is_public and status are editable by the conversation owner';
  end if;
  return new;
end; $$ language plpgsql security definer;

create trigger guard_conversation_update_trg
  before update on public.conversations
  for each row execute function public.guard_conversation_update();

-- Maintain search_tsv from subject + non-internal message bodies.
create function public.support_refresh_tsv(conv_id uuid) returns void as $$
begin
  update public.conversations c
     set search_tsv = to_tsvector('english',
           coalesce(c.subject,'') || ' ' ||
           coalesce((select string_agg(m.body,' ')
                       from public.messages m
                      where m.conversation_id = c.id and m.is_internal = false),''))
   where c.id = conv_id;
end; $$ language plpgsql security definer;

create function public.support_tsv_on_message() returns trigger as $$
begin
  perform public.support_refresh_tsv(new.conversation_id);
  return new;
end; $$ language plpgsql security definer;

create trigger support_tsv_message_trg
  after insert or update on public.messages
  for each row execute function public.support_tsv_on_message();

create function public.support_tsv_on_conversation() returns trigger as $$
begin
  if new.subject is distinct from old.subject then
    perform public.support_refresh_tsv(new.id);
  end if;
  return new;
end; $$ language plpgsql security definer;

create trigger support_tsv_conv_trg
  after update on public.conversations
  for each row execute function public.support_tsv_on_conversation();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.conversation_reads enable row level security;

create policy "conv_select_public" on public.conversations for select using (is_public = true);
create policy "conv_select_own"    on public.conversations for select using (auth.uid() = user_id);
create policy "conv_select_admin"  on public.conversations for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "conv_insert_own"    on public.conversations for insert with check (auth.uid() = user_id);
create policy "conv_update_own"    on public.conversations for update using (auth.uid() = user_id);
create policy "conv_update_admin"  on public.conversations for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "msg_select" on public.messages for select using (
  (is_internal = false and exists (
     select 1 from public.conversations c where c.id = conversation_id
     and (c.is_public or c.user_id = auth.uid()
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')))
  or
  (is_internal = true and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
);
create policy "msg_insert" on public.messages for insert with check (
  sender_id = auth.uid()
  and exists (select 1 from public.conversations c where c.id = conversation_id
              and (c.user_id = auth.uid()
                   or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'))
  and (is_internal = false or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
);
create policy "msg_update_admin" on public.messages for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "msg_delete_admin" on public.messages for delete
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "reads_all_own" on public.conversation_reads for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Grants ────────────────────────────────────────────────────────────────
grant select, insert, update on public.conversations to authenticated;
grant select on public.conversations to anon;            -- public FAQ
grant select, insert, update, delete on public.messages to authenticated;
grant select on public.messages to anon;                 -- public FAQ
grant select, insert, update, delete on public.conversation_reads to authenticated;

-- ── Storage bucket (public, for FAQ attachments) ──────────────────────────
insert into storage.buckets (id, name, public)
  values ('support-attachments','support-attachments', true)
  on conflict (id) do nothing;

create policy "support_attach_read" on storage.objects for select
  using (bucket_id = 'support-attachments');
create policy "support_attach_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'support-attachments');
