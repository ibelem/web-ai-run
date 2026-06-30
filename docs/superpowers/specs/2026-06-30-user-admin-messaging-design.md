# User–Admin Messaging + FAQ — Design

**Date:** 2026-06-30
**Status:** Approved design, pre-implementation
**Author:** brainstormed with Claude

## Goal

Let logged-in users ask questions to admins (support, feedback, general Q&A) in
threaded conversations. Admins reply when available — the feature is built around
the reality that admins answer asynchronously, often after the user has moved on.
Users can mark a conversation public, which turns it into searchable FAQ content
readable by anyone, including logged-out visitors.

Hard constraint: the feature must be **completely dormant during model inference
runs** so it never affects benchmark measurements.

## Scope

In scope:
- Threaded conversations between a user and admins.
- New conversation = category (Bug / Feature / How-to / Other) + free-form message
  + optional attachments (images compressed client-side).
- Real-time updates via Supabase `postgres_changes` (no email).
- Private by default; the **owning user** (not admins) can flip a conversation
  public → it becomes FAQ.
- Simple status: `open` / `resolved` (user or admin can resolve).
- Full-text search + filters over own conversations and the public FAQ.
- Per-conversation unread tracking via `last_read_at`.
- Full admin tooling: reply, edit/delete any message, resolve, toggle public,
  assign to an admin, internal notes (hidden from users), bulk actions.
- Floating widget (logged-in only) + dedicated `/support` page + public `/faq`.
- Widget and all messaging hidden + subscriptions torn down on `/inference/run`
  and `/llm/run` (any time `isRunning` is true).

Out of scope (YAGNI / later):
- Email or any external notifications.
- Workflow states beyond open/resolved.
- Admin-curated standalone FAQ entries (FAQ is fed only by user-made-public threads).
- Auto-resolve on inactivity.
- Per-message read receipts.

## Architecture

Approach A: **direct Supabase client + RLS**, matching the existing `results`,
`results_llm`, and `tracked_repos` pattern. The browser talks to Supabase via the
JS client; RLS enforces visibility. Real-time uses Supabase `postgres_changes`
subscriptions. No new server endpoints — if admin bulk actions later prove painful
in RLS, add a single server endpoint then, not now.

## Data Model

Three new tables in `public`, all with RLS enabled.

### `conversations`
```sql
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,  -- the asker
  category    text not null check (category in ('bug','feature','howto','other')),
  subject     text,                            -- optional; derived from first message if blank
  status      text not null default 'open'     check (status in ('open','resolved')),
  is_public   boolean not null default false,  -- user-controlled FAQ flag
  assigned_to uuid references auth.users(id),  -- admin assignment (nullable)
  search_tsv  tsvector,                         -- full-text index, maintained by trigger
  last_message_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index conversations_user_id_idx   on public.conversations(user_id);
create index conversations_public_idx     on public.conversations(is_public) where is_public = true;
create index conversations_last_msg_idx   on public.conversations(last_message_at desc);
create index conversations_search_idx     on public.conversations using gin(search_tsv);
```

### `messages`
```sql
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id),
  body            text not null,
  attachments     jsonb not null default '[]'::jsonb,  -- [{path, name, size, w, h}]
  is_internal     boolean not null default false,      -- admin-only note, hidden from users
  created_at      timestamptz not null default now()
);
create index messages_conversation_id_idx on public.messages(conversation_id, created_at);
```

### `conversation_reads`
```sql
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
```

### Rationale
- `attachments` as jsonb, not a separate table — matches the existing `metrics` /
  `webnn_capability` jsonb pattern; attachments are always read with their message.
- `is_internal` on messages — admin notes live inline in the thread; RLS hides them
  from non-admins.
- `last_message_at` denormalized onto `conversations` (trigger-maintained) — enables
  list sorting + unread compare without aggregating messages per query.
- `search_tsv` — standard Supabase full-text approach; trigger maintains it from
  `subject` + message bodies.
- Separate `conversation_reads` table (not a column) — clean per-user, per-conversation
  read state; admins get their own read rows too.

## RLS Policies

### `conversations`
```sql
-- Read: world-readable if public; otherwise owner or admin
create policy "conv_select_public" on conversations for select using (is_public = true);
create policy "conv_select_own"    on conversations for select using (auth.uid() = user_id);
create policy "conv_select_admin"  on conversations for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Insert: any logged-in user, only as themselves
create policy "conv_insert_own" on conversations for insert with check (auth.uid() = user_id);

-- Update: owner can change is_public + status; admin can change anything
create policy "conv_update_own"   on conversations for update using (auth.uid() = user_id);
create policy "conv_update_admin" on conversations for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

**Column guard (RLS can't restrict which columns change).** A `conv_update_own`
policy alone would let an owner alter `category`, `assigned_to`, `user_id`, etc. on
their own row. A BEFORE UPDATE trigger restricts non-admin owners to `is_public` and
`status` only:
```sql
create function public.guard_conversation_update() returns trigger as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' then
    return new;  -- admins may change anything
  end if;
  -- non-admin owner: only is_public and status may differ
  if new.user_id     is distinct from old.user_id
     or new.category is distinct from old.category
     or new.subject  is distinct from old.subject
     or new.assigned_to is distinct from old.assigned_to then
    raise exception 'Only is_public and status are editable by the conversation owner';
  end if;
  return new;
end; $$ language plpgsql security definer;

create trigger guard_conversation_update_trg
  before update on public.conversations
  for each row execute function public.guard_conversation_update();
```

### `messages`
```sql
-- Read: any message in a conversation you can see, EXCEPT internal notes (admin-only)
create policy "msg_select" on messages for select using (
  (is_internal = false and exists (
     select 1 from conversations c where c.id = conversation_id
     and (c.is_public or c.user_id = auth.uid()
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')))
  or
  (is_internal = true and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
);

-- Insert: participant only (conversation owner or admin); sender_id must be self;
-- only admins may write internal notes
create policy "msg_insert" on messages for insert with check (
  sender_id = auth.uid()
  and exists (select 1 from conversations c where c.id = conversation_id
              and (c.user_id = auth.uid()
                   or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'))
  and (is_internal = false or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
);

-- Update/Delete: admin only (edit/delete any message)
create policy "msg_update_admin" on messages for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "msg_delete_admin" on messages for delete
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

### `conversation_reads`
Owner-only for all operations: `auth.uid() = user_id`.

### Guarantees
- Logged-out visitors see only public conversations and their non-internal messages.
- A user cannot make someone else's conversation public (update scoped to owner).
- Internal notes never reach non-admins, even on public threads.
- Only admins write internal notes and edit/delete messages.

## Storage

Attachments live in a **public** Supabase Storage bucket (`support-attachments`) so
images on public FAQ threads render for logged-out visitors. Upload path namespaced
by conversation id. Images are compressed client-side before upload (see util below).

## Components & Routes

### Routes
- `/support` — full messaging page. Two-pane: conversation list (left) + active
  thread (right). Logged-in only; logged-out sees a gate: "Sign in to ask a question"
  with a link to `/login`.
- `/faq` — public FAQ. Searchable list of public conversations; click to read full
  thread. World-readable (works logged-out).
- `/admin/support` — admin inbox. All conversations, filters, bulk actions,
  assignment, internal notes. Added to the existing `adminGroups` nav.

### Components — `src/lib/components/support/`
- `SupportWidget.svelte` — floating button + slide-out panel. Mounted once in root
  layout, gated on `$isAuthenticated && !$isRunningStore`.
- `ConversationList.svelte` — threads with unread badges, category chips, status.
  Reused by `/support` and `/admin/support`.
- `ConversationThread.svelte` — message timeline + composer. Reused everywhere.
- `MessageComposer.svelte` — textarea + category picker (new convo only) + attachment
  upload with client-side compression.
- `MessageBubble.svelte` — single message; handles attachments and `is_internal`
  styling for admins.
- `FaqSearch.svelte` — search box + filters for `/faq`.
- `AttachmentUploader.svelte` — drag/drop, compresses images before upload.

### Store — `src/lib/stores/support.ts`
Holds conversations list, unread counts, and the active real-time channel. Mirrors
the `auth` / `cart` store pattern. **Subscribes to the `isRunning` store** (see below).

### Util — `src/lib/utils/image-compress.ts`
Canvas-based resize (max 1920px longest edge) + re-encode (quality ~0.85). Pure,
unit-testable. Returns a `Blob` + dimensions for the attachments metadata.

## Real-time, Unread, and Inference Protection

### Inference protection (hard requirement)
Messaging is **fully dormant whenever `isRunning` is true**. The support store
subscribes to the existing `isRunning` store:

- `isRunning` → **true**: `channel.unsubscribe()`, stop all polling, freeze the store.
  Zero messaging network or main-thread work during the run. (The widget is also
  unmounted via the layout guard, but tearing down the subscription is the real
  protection — a hidden-but-live subscription would still process WebSocket frames
  on the main thread and could skew TTFT/latency.)
- `isRunning` → **false**: re-open the channel, run one catch-up fetch (conversations
  where `last_message_at > last_read_at`), repaint badges.

No messages are missed — data sits in Postgres the whole time; we simply weren't
listening. Cost: one indexed select when the run ends, and badges update a beat later
instead of live. Correct tradeoff for a "reply when the user isn't testing" feature.

### Real-time subscriptions
When active (not running) and the user is on `/support` or has the widget open:
- Users subscribe to `messages` inserts and `conversations` updates for their visible
  set → live thread updates + unread badge bumps.
- Admins on `/admin/support` subscribe to all `messages` / `conversations` changes
  (RLS already grants admins full visibility).

One channel owned by the store, opened on mount, closed on unmount — same lifecycle
as the existing `onAuthStateChange` cleanup in `+layout.svelte`.

### Unread computation
- A conversation is unread if `last_message_at > conversation_reads.last_read_at`
  (or no read row exists) **and** the latest message was not sent by the current user.
- Opening a thread upserts `conversation_reads` with `last_read_at = now()`.
- Floating-button badge = count of unread conversations.

### `last_message_at` trigger
```sql
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
```

### `search_tsv` trigger
Maintains `conversations.search_tsv` from `subject` plus concatenated non-internal
message bodies on message insert/update and conversation update. (Internal notes are
excluded so FAQ search never matches hidden admin text.)

## UX for non-logged-in users
- Floating button: not rendered. Anonymous users never see it.
- `/support` direct access while logged out: gate with "Sign in to ask a question" →
  `/login`.
- `/faq`: fully readable and searchable logged-out. Public-thread attachments render
  from the public Storage bucket. Internal notes never appear (RLS).

## Error Handling
- Attachment upload failure: surface inline in the composer ("Upload failed, retry"),
  do not block the text message from sending.
- Real-time channel drop: store attempts re-subscribe with backoff; falls back to a
  one-shot fetch so the UI is never permanently stale.
- Send failure (RLS/network): keep the draft in the composer, show a retry affordance.
- Catch-up fetch after a run: if it fails, badges simply remain at their pre-run state
  until the next successful fetch — no crash, no lost data.

## Testing
- `image-compress.ts`: unit tests for resize math and quality bounds (pure function).
- RLS policy tests: verify logged-out sees only public+non-internal; non-owner cannot
  make a thread public; non-admin cannot read internal notes or write them.
- Unread logic: a user's own reply does not mark their thread unread; another party's
  reply does.
- Inference protection: assert the store unsubscribes when `isRunning` flips true and
  re-subscribes + catches up when it flips false.

## Migration
New numbered migration in `supabase/migrations/` (next sequential number) creating the
three tables, indexes, RLS policies, triggers, and the `support-attachments` public
bucket. Follows the existing migration style (see `034_results_llm_table.sql`).
