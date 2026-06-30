# User–Admin Messaging + FAQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in users open threaded conversations with admins (support / feedback / Q&A); users can mark a thread public to turn it into searchable FAQ content readable by anyone, including logged-out visitors.

**Architecture:** Direct Supabase client + RLS (matches existing `results_llm`, `recipes`, `tracked_repos`). Three new tables (`conversations`, `messages`, `conversation_reads`), client-side CRUD libs under `src/lib/support/`, a Svelte store that owns one real-time channel, and Svelte components under `src/lib/components/support/`. Real-time via Supabase `postgres_changes`. No new server endpoints.

**Tech Stack:** SvelteKit (Svelte 5 runes), `@supabase/ssr` browser client, Postgres RLS + triggers + `tsvector` FTS, Supabase Storage (public bucket), Vitest + jsdom for unit tests.

## Global Constraints

- **Inference protection (hard requirement):** Messaging is fully dormant whenever the `isRunning` store (`src/lib/stores/benchmark.ts`) is `true`. The store tears down its Supabase channel and stops all polling on `isRunning → true`, and re-subscribes + runs one catch-up fetch on `isRunning → false`. No WebSocket frames or reactive store updates on the main thread during a benchmark.
- **No email / external notifications.** In-app real-time + unread badges only.
- **Private by default.** Only the owning user (not admins) can flip `is_public`. Admins can do everything else.
- **Internal notes never leak.** `messages.is_internal = true` rows are admin-only via RLS and excluded from `search_tsv`.
- **Migrations are sequential.** Next file is `supabase/migrations/036_*.sql`. Follow the style of `034_results_llm_table.sql` (lowercase SQL, `create policy` per operation).
- **Role check pattern:** `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` (verbatim, as in existing policies).
- **Roles:** `anonymous | member | partner | intel | admin` (`src/lib/types/roles.ts`).
- **Client creation:** `import { createClient } from '$lib/supabase/client'` then `createClient()`.
- **Tests:** live under `tests/**/*.test.ts`, run with `npm test` (vitest), jsdom env, setup `tests/setup.ts`. Mock the Supabase client with a chainable mock object (see `tests/lib/recipes/crud.test.ts`).
- **Widget hidden on run pages:** reuse `class:hidden={$isRunningStore}` guard already used by nav/footer in `src/routes/+layout.svelte`.

---

## File Structure

**Create:**
- `supabase/migrations/036_support_messaging.sql` — tables, indexes, RLS, triggers, storage bucket.
- `src/lib/support/types.ts` — TS types for the three tables + attachment metadata.
- `src/lib/support/crud.ts` — conversation/message CRUD + read tracking + search.
- `src/lib/utils/image-compress.ts` — canvas resize + re-encode (pure).
- `src/lib/stores/support.ts` — conversations/unread store; owns real-time channel; obeys `isRunning`.
- `src/lib/components/support/SupportWidget.svelte` — floating button + slide-out panel.
- `src/lib/components/support/ConversationList.svelte`
- `src/lib/components/support/ConversationThread.svelte`
- `src/lib/components/support/MessageComposer.svelte`
- `src/lib/components/support/MessageBubble.svelte`
- `src/lib/components/support/AttachmentUploader.svelte`
- `src/lib/components/support/FaqSearch.svelte`
- `src/routes/support/+page.svelte` — full messaging page (logged-in gate).
- `src/routes/faq/+page.svelte` — public FAQ page.
- `src/routes/admin/support/+page.svelte` — admin inbox.
- Tests: `tests/lib/utils/image-compress.test.ts`, `tests/lib/support/crud.test.ts`, `tests/lib/stores/support.test.ts`.

**Modify:**
- `src/lib/supabase/types.ts` — add three table definitions to `Database`.
- `src/routes/+layout.svelte` — mount `<SupportWidget>`; add Support nav item; admin nav gets `/admin/support`.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/036_support_messaging.sql`

**Interfaces:**
- Produces: tables `public.conversations`, `public.messages`, `public.conversation_reads`; functions `public.bump_conversation()`, `public.guard_conversation_update()`, `public.support_refresh_tsv()`; public storage bucket `support-attachments`.

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Apply the migration**

Run: `psql "$DATABASE_URL" -f supabase/migrations/036_support_messaging.sql`
Expected: no errors; `CREATE TABLE` / `CREATE POLICY` / `INSERT 0 1` lines.

(If using local Supabase Docker, apply via the same mechanism used for prior migrations — check how `034` was applied. The migration must run cleanly on a fresh DB.)

- [ ] **Step 3: Smoke-verify in psql**

Run:
```sql
\d public.conversations
select count(*) from storage.buckets where id='support-attachments';
```
Expected: table shows all columns + `search_tsv tsvector`; bucket count = 1.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/036_support_messaging.sql
git commit -m "feat(db): add support messaging tables, RLS, triggers, storage bucket"
```

---

### Task 2: TypeScript types

**Files:**
- Create: `src/lib/support/types.ts`
- Modify: `src/lib/supabase/types.ts` (add three tables to `Database.public.Tables`)

**Interfaces:**
- Produces: `Conversation`, `Message`, `ConversationRead`, `Attachment`, `Category`, `ConvStatus` types; Database table entries `conversations`, `messages`, `conversation_reads`.

- [ ] **Step 1: Create `src/lib/support/types.ts`**

```ts
export type Category = 'bug' | 'feature' | 'howto' | 'other';
export type ConvStatus = 'open' | 'resolved';

export interface Attachment {
  path: string;   // storage object path within support-attachments bucket
  name: string;
  size: number;   // bytes after compression
  w?: number;
  h?: number;
}

export interface Conversation {
  id: string;
  user_id: string;
  category: Category;
  subject: string | null;
  status: ConvStatus;
  is_public: boolean;
  assigned_to: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachments: Attachment[];
  is_internal: boolean;
  created_at: string;
}

export interface ConversationRead {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
}
```

- [ ] **Step 2: Add tables to `src/lib/supabase/types.ts`**

Inside `Database.public.Tables`, add (matching the existing Row/Insert/Update shape used by `profiles`):

```ts
      conversations: {
        Row: {
          id: string; user_id: string;
          category: 'bug' | 'feature' | 'howto' | 'other';
          subject: string | null;
          status: 'open' | 'resolved';
          is_public: boolean; assigned_to: string | null;
          last_message_at: string; created_at: string; updated_at: string;
        };
        Insert: {
          user_id: string;
          category: 'bug' | 'feature' | 'howto' | 'other';
          subject?: string | null;
          status?: 'open' | 'resolved';
          is_public?: boolean; assigned_to?: string | null;
        };
        Update: {
          subject?: string | null;
          status?: 'open' | 'resolved';
          is_public?: boolean; assigned_to?: string | null;
        };
      };
      messages: {
        Row: {
          id: string; conversation_id: string; sender_id: string;
          body: string; attachments: unknown; is_internal: boolean; created_at: string;
        };
        Insert: {
          conversation_id: string; sender_id: string; body: string;
          attachments?: unknown; is_internal?: boolean;
        };
        Update: { body?: string; attachments?: unknown; is_internal?: boolean };
      };
      conversation_reads: {
        Row: { conversation_id: string; user_id: string; last_read_at: string };
        Insert: { conversation_id: string; user_id: string; last_read_at?: string };
        Update: { last_read_at?: string };
      };
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: no NEW errors referencing `src/lib/support/types.ts` or the added tables (svelte-check baseline is 54 pre-existing errors; do not add to it).

- [ ] **Step 4: Commit**

```bash
git add src/lib/support/types.ts src/lib/supabase/types.ts
git commit -m "feat(support): add TS types for messaging tables"
```

---

### Task 3: Image compression util

**Files:**
- Create: `src/lib/utils/image-compress.ts`
- Test: `tests/lib/utils/image-compress.test.ts`

**Interfaces:**
- Produces: `computeTargetSize(w: number, h: number, max?: number): { w: number; h: number }` and `compressImage(file: File, opts?: { maxEdge?: number; quality?: number }): Promise<{ blob: Blob; w: number; h: number }>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/utils/image-compress.test.ts
import { describe, it, expect } from 'vitest';
import { computeTargetSize } from '$lib/utils/image-compress';

describe('computeTargetSize', () => {
  it('leaves small images unchanged', () => {
    expect(computeTargetSize(800, 600, 1920)).toEqual({ w: 800, h: 600 });
  });
  it('scales landscape down to max edge', () => {
    expect(computeTargetSize(3840, 2160, 1920)).toEqual({ w: 1920, h: 1080 });
  });
  it('scales portrait down to max edge', () => {
    expect(computeTargetSize(2160, 3840, 1920)).toEqual({ w: 1080, h: 1920 });
  });
  it('rounds to integer pixels', () => {
    const r = computeTargetSize(1000, 333, 500);
    expect(Number.isInteger(r.w)).toBe(true);
    expect(Number.isInteger(r.h)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- image-compress`
Expected: FAIL — cannot find module `$lib/utils/image-compress`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/utils/image-compress.ts
export function computeTargetSize(w: number, h: number, max = 1920): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const scale = max / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export async function compressImage(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {}
): Promise<{ blob: Blob; w: number; h: number }> {
  const { maxEdge = 1920, quality = 0.85 } = opts;
  const bitmap = await createImageBitmap(file);
  const { w, h } = computeTargetSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', quality)
  );
  return { blob, w, h };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- image-compress`
Expected: PASS (4 tests). `compressImage` is not unit-tested here (needs canvas); covered manually in QA.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/image-compress.ts tests/lib/utils/image-compress.test.ts
git commit -m "feat(support): add client-side image compression util"
```

---

### Task 4: CRUD library

**Files:**
- Create: `src/lib/support/crud.ts`
- Test: `tests/lib/support/crud.test.ts`

**Interfaces:**
- Consumes: `createClient` from `$lib/supabase/client`; types from `$lib/support/types`.
- Produces:
  - `listConversations(opts: { userId?: string; admin?: boolean }): Promise<Conversation[]>`
  - `listPublicConversations(search?: string): Promise<Conversation[]>`
  - `getMessages(conversationId: string): Promise<Message[]>`
  - `createConversation(input: { userId: string; category: Category; subject?: string; body: string; attachments?: Attachment[] }): Promise<Conversation>`
  - `sendMessage(input: { conversationId: string; senderId: string; body: string; attachments?: Attachment[]; isInternal?: boolean }): Promise<Message>`
  - `setPublic(conversationId: string, isPublic: boolean): Promise<void>`
  - `setStatus(conversationId: string, status: ConvStatus): Promise<void>`
  - `markRead(conversationId: string, userId: string): Promise<void>`
  - `uploadAttachment(conversationId: string, blob: Blob, name: string): Promise<string>` (returns storage path)

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/support/crud.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOr = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();
const mockUpsert = vi.fn();
const mockTextSearch = vi.fn();

const chainable = {
  select: mockSelect, insert: mockInsert, update: mockUpdate,
  eq: mockEq, or: mockOr, order: mockOrder, single: mockSingle,
  upsert: mockUpsert, textSearch: mockTextSearch,
};
Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));

vi.mock('$lib/supabase/client', () => ({
  createClient: () => ({ from: () => chainable }),
}));

describe('support/crud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));
  });

  it('listConversations for a user filters by user_id and orders by last_message_at', async () => {
    mockOrder.mockResolvedValueOnce({ data: [{ id: '1' }], error: null });
    const { listConversations } = await import('$lib/support/crud');
    const r = await listConversations({ userId: 'u1' });
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
    expect(mockOrder).toHaveBeenCalledWith('last_message_at', { ascending: false });
    expect(r).toHaveLength(1);
  });

  it('listConversations for admin does not filter by user_id', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    const { listConversations } = await import('$lib/support/crud');
    await listConversations({ admin: true });
    expect(mockEq).not.toHaveBeenCalledWith('user_id', expect.anything());
  });

  it('listPublicConversations filters is_public and applies text search when given', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    const { listPublicConversations } = await import('$lib/support/crud');
    await listPublicConversations('webgpu');
    expect(mockEq).toHaveBeenCalledWith('is_public', true);
    expect(mockTextSearch).toHaveBeenCalledWith('search_tsv', 'webgpu');
  });

  it('createConversation inserts conversation then first message', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'c1', user_id: 'u1' }, error: null })  // conversation
      .mockResolvedValueOnce({ data: { id: 'm1' }, error: null });                // message
    const { createConversation } = await import('$lib/support/crud');
    const c = await createConversation({ userId: 'u1', category: 'bug', body: 'help' });
    expect(mockInsert).toHaveBeenCalled();
    expect(c.id).toBe('c1');
  });

  it('setPublic updates is_public', async () => {
    mockEq.mockResolvedValueOnce({ error: null });
    const { setPublic } = await import('$lib/support/crud');
    await setPublic('c1', true);
    expect(mockUpdate).toHaveBeenCalledWith({ is_public: true });
    expect(mockEq).toHaveBeenCalledWith('id', 'c1');
  });

  it('markRead upserts a read row', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });
    const { markRead } = await import('$lib/support/crud');
    await markRead('c1', 'u1');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: 'c1', user_id: 'u1' }),
      expect.objectContaining({ onConflict: 'conversation_id,user_id' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- support/crud`
Expected: FAIL — cannot find module `$lib/support/crud`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/support/crud.ts
import { createClient } from '$lib/supabase/client';
import type { Conversation, Message, Category, ConvStatus, Attachment } from './types';

const BUCKET = 'support-attachments';

export async function listConversations(opts: { userId?: string; admin?: boolean }): Promise<Conversation[]> {
  const db = createClient();
  let q = db.from('conversations').select('*');
  if (!opts.admin && opts.userId) q = q.eq('user_id', opts.userId);
  const { data, error } = await q.order('last_message_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function listPublicConversations(search?: string): Promise<Conversation[]> {
  const db = createClient();
  let q = db.from('conversations').select('*').eq('is_public', true);
  if (search && search.trim()) q = q.textSearch('search_tsv', search.trim());
  const { data, error } = await q.order('last_message_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const db = createClient();
  const { data, error } = await db.from('messages').select('*')
    .eq('conversation_id', conversationId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function createConversation(input: {
  userId: string; category: Category; subject?: string; body: string; attachments?: Attachment[];
}): Promise<Conversation> {
  const db = createClient();
  const { data: conv, error: cErr } = await db.from('conversations')
    .insert({ user_id: input.userId, category: input.category, subject: input.subject ?? null })
    .select('*').single();
  if (cErr) throw cErr;
  const c = conv as Conversation;
  const { error: mErr } = await db.from('messages')
    .insert({ conversation_id: c.id, sender_id: input.userId, body: input.body, attachments: input.attachments ?? [] })
    .select('*').single();
  if (mErr) throw mErr;
  return c;
}

export async function sendMessage(input: {
  conversationId: string; senderId: string; body: string; attachments?: Attachment[]; isInternal?: boolean;
}): Promise<Message> {
  const db = createClient();
  const { data, error } = await db.from('messages')
    .insert({
      conversation_id: input.conversationId, sender_id: input.senderId, body: input.body,
      attachments: input.attachments ?? [], is_internal: input.isInternal ?? false,
    })
    .select('*').single();
  if (error) throw error;
  return data as Message;
}

export async function setPublic(conversationId: string, isPublic: boolean): Promise<void> {
  const db = createClient();
  const { error } = await db.from('conversations').update({ is_public: isPublic }).eq('id', conversationId);
  if (error) throw error;
}

export async function setStatus(conversationId: string, status: ConvStatus): Promise<void> {
  const db = createClient();
  const { error } = await db.from('conversations').update({ status }).eq('id', conversationId);
  if (error) throw error;
}

export async function markRead(conversationId: string, userId: string): Promise<void> {
  const db = createClient();
  const { error } = await db.from('conversation_reads').upsert(
    { conversation_id: conversationId, user_id: userId, last_read_at: new Date().toISOString() },
    { onConflict: 'conversation_id,user_id' }
  );
  if (error) throw error;
}

export async function uploadAttachment(conversationId: string, blob: Blob, name: string): Promise<string> {
  const db = createClient();
  const path = `${conversationId}/${crypto.randomUUID()}-${name}`;
  const { error } = await db.storage.from(BUCKET).upload(path, blob, { upsert: false });
  if (error) throw error;
  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- support/crud`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/support/crud.ts tests/lib/support/crud.test.ts
git commit -m "feat(support): add conversation/message CRUD library"
```

---

### Task 5: Support store with inference protection

**Files:**
- Create: `src/lib/stores/support.ts`
- Test: `tests/lib/stores/support.test.ts`

**Interfaces:**
- Consumes: `isRunning` from `$lib/stores/benchmark`; `createClient` from `$lib/supabase/client`; `listConversations`, `markRead` from `$lib/support/crud`.
- Produces: `support` writable store `{ conversations: Conversation[]; loading: boolean; active: boolean }`; `unreadCount` derived store (number); functions `initSupport(userId: string, admin: boolean): void` and `teardownSupport(): void`; exported pure helper `computeUnread(convs: Conversation[], reads: Record<string, string>, userId: string): number`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/stores/support.test.ts
import { describe, it, expect } from 'vitest';
import { computeUnread } from '$lib/stores/support';
import type { Conversation } from '$lib/support/types';

function conv(id: string, lastMsg: string, userId = 'me'): Conversation {
  return {
    id, user_id: userId, category: 'other', subject: null, status: 'open',
    is_public: false, assigned_to: null, last_message_at: lastMsg,
    created_at: lastMsg, updated_at: lastMsg,
  };
}

describe('computeUnread', () => {
  it('counts a conversation with no read row as unread', () => {
    expect(computeUnread([conv('c1', '2026-01-02T00:00:00Z')], {}, 'me')).toBe(1);
  });
  it('counts conversation as read when last_read_at >= last_message_at', () => {
    const reads = { c1: '2026-01-02T00:00:00Z' };
    expect(computeUnread([conv('c1', '2026-01-02T00:00:00Z')], reads, 'me')).toBe(0);
  });
  it('counts as unread when a newer message arrived after last read', () => {
    const reads = { c1: '2026-01-01T00:00:00Z' };
    expect(computeUnread([conv('c1', '2026-01-02T00:00:00Z')], reads, 'me')).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- stores/support`
Expected: FAIL — cannot find module `$lib/stores/support`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/stores/support.ts
import { writable, derived, get } from 'svelte/store';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '$lib/supabase/client';
import { isRunning } from '$lib/stores/benchmark';
import { listConversations } from '$lib/support/crud';
import type { Conversation } from '$lib/support/types';

interface SupportState {
  conversations: Conversation[];
  reads: Record<string, string>;   // conversation_id -> last_read_at ISO
  loading: boolean;
  active: boolean;                  // false while a benchmark run is in progress
}

export const support = writable<SupportState>({
  conversations: [], reads: {}, loading: false, active: true,
});

export function computeUnread(
  convs: Conversation[], reads: Record<string, string>, _userId: string
): number {
  return convs.filter((c) => {
    const r = reads[c.id];
    if (!r) return true;
    return new Date(c.last_message_at).getTime() > new Date(r).getTime();
  }).length;
}

export const unreadCount = derived(support, ($s) => computeUnread($s.conversations, $s.reads, ''));

let channel: RealtimeChannel | null = null;
let currentUserId: string | null = null;
let isAdmin = false;
let unsubRunning: (() => void) | null = null;

async function refresh() {
  support.update((s) => ({ ...s, loading: true }));
  const db = createClient();
  const convs = await listConversations(isAdmin ? { admin: true } : { userId: currentUserId! });
  // Load this user's read markers so unread can be computed.
  const { data: readRows } = await db.from('conversation_reads')
    .select('conversation_id,last_read_at').eq('user_id', currentUserId!);
  const reads: Record<string, string> = {};
  for (const r of (readRows ?? []) as { conversation_id: string; last_read_at: string }[]) {
    reads[r.conversation_id] = r.last_read_at;
  }
  support.update((s) => ({ ...s, conversations: convs, reads, loading: false }));
}

function openChannel() {
  if (channel) return;
  const db = createClient();
  channel = db.channel('support')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { refresh(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => { refresh(); })
    .subscribe();
}

function closeChannel() {
  if (channel) { channel.unsubscribe(); channel = null; }
}

export function initSupport(userId: string, admin: boolean): void {
  currentUserId = userId; isAdmin = admin;
  // React to run state: dormant during inference, live otherwise.
  unsubRunning = isRunning.subscribe((running) => {
    if (running) {
      support.update((s) => ({ ...s, active: false }));
      closeChannel();
    } else {
      support.update((s) => ({ ...s, active: true }));
      openChannel();
      refresh();   // catch-up fetch after a run ends
    }
  });
  if (!get(isRunning)) { openChannel(); refresh(); }
}

export function teardownSupport(): void {
  closeChannel();
  if (unsubRunning) { unsubRunning(); unsubRunning = null; }
  currentUserId = null; isAdmin = false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- stores/support`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/support.ts tests/lib/stores/support.test.ts
git commit -m "feat(support): add store with isRunning-gated realtime channel"
```

---

### Task 6: Presentational components — MessageBubble, AttachmentUploader, MessageComposer

**Files:**
- Create: `src/lib/components/support/MessageBubble.svelte`
- Create: `src/lib/components/support/AttachmentUploader.svelte`
- Create: `src/lib/components/support/MessageComposer.svelte`

**Interfaces:**
- Consumes: `Message`, `Attachment`, `Category` types; `compressImage` from `$lib/utils/image-compress`.
- Produces (component props):
  - `MessageBubble`: `{ message: Message; isOwn: boolean; isAdminViewer: boolean }`
  - `AttachmentUploader`: `{ files: { blob: Blob; name: string; w: number; h: number }[] = $bindable([]) }`
  - `MessageComposer`: `{ showCategory?: boolean; onsend: (payload: { body: string; category?: Category; files: { blob: Blob; name: string; w: number; h: number }[] }) => Promise<void> }`

- [ ] **Step 1: Write `MessageBubble.svelte`**

```svelte
<script lang="ts">
  import type { Message } from '$lib/support/types';
  import { PUBLIC_SUPABASE_URL } from '$env/static/public';
  let { message, isOwn, isAdminViewer }: { message: Message; isOwn: boolean; isAdminViewer: boolean } = $props();
  const base = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/support-attachments/`;
</script>

<div class="bubble" class:own={isOwn} class:internal={message.is_internal}>
  {#if message.is_internal && isAdminViewer}
    <span class="internal-tag">Internal note</span>
  {/if}
  <p class="body">{message.body}</p>
  {#if message.attachments?.length}
    <div class="attachments">
      {#each message.attachments as a}
        <a href={base + a.path} target="_blank" rel="noopener">
          <img src={base + a.path} alt={a.name} loading="lazy" crossorigin="anonymous" />
        </a>
      {/each}
    </div>
  {/if}
  <time>{new Date(message.created_at).toLocaleString()}</time>
</div>

<style>
  .bubble { padding: var(--space-2); border-radius: var(--radius-lg); background: var(--color-surface-sunken); margin-bottom: var(--space-2); max-width: 80%; }
  .bubble.own { background: var(--color-nav-item-active); margin-left: auto; }
  .bubble.internal { border: 1px dashed var(--color-warning); }
  .internal-tag { font-size: var(--text-xs); color: var(--color-warning); font-weight: 600; }
  .body { white-space: pre-wrap; margin: 0 0 var(--space-1); }
  .attachments { display: flex; gap: var(--space-1); flex-wrap: wrap; }
  .attachments img { max-width: 160px; border-radius: var(--radius-base); }
  time { font-size: var(--text-xs); color: var(--color-text-muted); }
</style>
```

- [ ] **Step 2: Write `AttachmentUploader.svelte`**

```svelte
<script lang="ts">
  import { compressImage } from '$lib/utils/image-compress';
  let { files = $bindable([]) }: { files: { blob: Blob; name: string; w: number; h: number }[] } = $props();
  let error = $state('');

  async function onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    error = '';
    for (const file of Array.from(input.files ?? [])) {
      try {
        const { blob, w, h } = await compressImage(file);
        files = [...files, { blob, name: file.name.replace(/\.[^.]+$/, '.webp'), w, h }];
      } catch {
        error = `Could not process ${file.name}`;
      }
    }
    input.value = '';
  }
  function remove(i: number) { files = files.filter((_, idx) => idx !== i); }
</script>

<div class="uploader">
  <label class="pick">
    Attach image
    <input type="file" accept="image/*" multiple onchange={onPick} hidden />
  </label>
  {#if error}<span class="err">{error}</span>{/if}
  {#if files.length}
    <ul class="thumbs">
      {#each files as f, i}
        <li>{f.name} <button type="button" onclick={() => remove(i)}>×</button></li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .pick { cursor: pointer; font-size: var(--text-sm); color: var(--color-primary); }
  .err { color: var(--color-warning); font-size: var(--text-sm); }
  .thumbs { list-style: none; padding: 0; margin: var(--space-1) 0 0; font-size: var(--text-sm); }
</style>
```

- [ ] **Step 3: Write `MessageComposer.svelte`**

```svelte
<script lang="ts">
  import type { Category } from '$lib/support/types';
  import AttachmentUploader from './AttachmentUploader.svelte';
  let { showCategory = false, onsend }: {
    showCategory?: boolean;
    onsend: (payload: { body: string; category?: Category; files: { blob: Blob; name: string; w: number; h: number }[] }) => Promise<void>;
  } = $props();

  let body = $state('');
  let category = $state<Category>('howto');
  let files = $state<{ blob: Blob; name: string; w: number; h: number }[]>([]);
  let sending = $state(false);
  let error = $state('');

  async function submit() {
    if (!body.trim() || sending) return;
    sending = true; error = '';
    try {
      await onsend({ body: body.trim(), category: showCategory ? category : undefined, files });
      body = ''; files = [];
    } catch {
      error = 'Send failed. Your draft is kept — try again.';
    } finally {
      sending = false;
    }
  }
</script>

<div class="composer">
  {#if showCategory}
    <select bind:value={category} aria-label="Category">
      <option value="bug">Bug</option>
      <option value="feature">Feature request</option>
      <option value="howto">How-to question</option>
      <option value="other">Other</option>
    </select>
  {/if}
  <textarea bind:value={body} placeholder="Type your message…" rows="3"></textarea>
  <AttachmentUploader bind:files />
  {#if error}<p class="err">{error}</p>{/if}
  <button class="send" onclick={submit} disabled={sending || !body.trim()}>
    {sending ? 'Sending…' : 'Send'}
  </button>
</div>

<style>
  .composer { display: flex; flex-direction: column; gap: var(--space-1); }
  textarea { width: 100%; resize: vertical; padding: var(--space-1); border: 1px solid var(--color-border); border-radius: var(--radius-base); }
  .send { align-self: flex-end; }
  .err { color: var(--color-warning); font-size: var(--text-sm); margin: 0; }
</style>
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no new errors from these three components.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/support/MessageBubble.svelte src/lib/components/support/AttachmentUploader.svelte src/lib/components/support/MessageComposer.svelte
git commit -m "feat(support): add message bubble, uploader, composer components"
```

---

### Task 7: ConversationThread + ConversationList components

**Files:**
- Create: `src/lib/components/support/ConversationThread.svelte`
- Create: `src/lib/components/support/ConversationList.svelte`

**Interfaces:**
- Consumes: `getMessages`, `sendMessage`, `setPublic`, `setStatus`, `markRead`, `uploadAttachment` from `$lib/support/crud`; `compressImage` already used in composer; `MessageBubble`, `MessageComposer`; types.
- Produces (props):
  - `ConversationThread`: `{ conversation: Conversation; viewerId: string; isAdminViewer: boolean }`
  - `ConversationList`: `{ conversations: Conversation[]; reads: Record<string,string>; activeId?: string; onselect: (c: Conversation) => void }`

- [ ] **Step 1: Write `ConversationThread.svelte`**

```svelte
<script lang="ts">
  import type { Conversation, Message, Category } from '$lib/support/types';
  import { getMessages, sendMessage, setPublic, setStatus, markRead, uploadAttachment } from '$lib/support/crud';
  import MessageBubble from './MessageBubble.svelte';
  import MessageComposer from './MessageComposer.svelte';

  let { conversation, viewerId, isAdminViewer }: { conversation: Conversation; viewerId: string; isAdminViewer: boolean } = $props();
  let messages = $state<Message[]>([]);
  let isPublic = $state(conversation.is_public);
  let status = $state(conversation.status);

  $effect(() => {
    let cancelled = false;
    getMessages(conversation.id).then((m) => { if (!cancelled) messages = m; });
    markRead(conversation.id, viewerId);
    return () => { cancelled = true; };
  });

  async function handleSend(p: { body: string; category?: Category; files: { blob: Blob; name: string; w: number; h: number }[] }) {
    const attachments = [];
    for (const f of p.files) {
      const path = await uploadAttachment(conversation.id, f.blob, f.name);
      attachments.push({ path, name: f.name, size: f.blob.size, w: f.w, h: f.h });
    }
    await sendMessage({ conversationId: conversation.id, senderId: viewerId, body: p.body, attachments });
    messages = await getMessages(conversation.id);
  }

  async function togglePublic() { isPublic = !isPublic; await setPublic(conversation.id, isPublic); }
  async function toggleResolved() {
    status = status === 'open' ? 'resolved' : 'open';
    await setStatus(conversation.id, status);
  }
  const canTogglePublic = $derived(viewerId === conversation.user_id);
</script>

<div class="thread">
  <header>
    <span class="cat">{conversation.category}</span>
    <span class="status" class:resolved={status === 'resolved'}>{status}</span>
    {#if canTogglePublic}
      <button onclick={togglePublic}>{isPublic ? 'Make private' : 'Make public (FAQ)'}</button>
    {/if}
    <button onclick={toggleResolved}>{status === 'open' ? 'Mark resolved' : 'Reopen'}</button>
  </header>
  <div class="messages">
    {#each messages as m (m.id)}
      <MessageBubble message={m} isOwn={m.sender_id === viewerId} {isAdminViewer} />
    {/each}
  </div>
  <MessageComposer onsend={handleSend} />
</div>

<style>
  .thread { display: flex; flex-direction: column; height: 100%; }
  header { display: flex; align-items: center; gap: var(--space-2); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
  .cat { text-transform: capitalize; font-weight: 600; }
  .status.resolved { color: var(--color-primary); }
  .messages { flex: 1; overflow-y: auto; padding: var(--space-2) 0; }
</style>
```

- [ ] **Step 2: Write `ConversationList.svelte`**

```svelte
<script lang="ts">
  import type { Conversation } from '$lib/support/types';
  let { conversations, reads, activeId, onselect }: {
    conversations: Conversation[]; reads: Record<string, string>;
    activeId?: string; onselect: (c: Conversation) => void;
  } = $props();
  function unread(c: Conversation): boolean {
    const r = reads[c.id];
    return !r || new Date(c.last_message_at).getTime() > new Date(r).getTime();
  }
</script>

<ul class="list">
  {#each conversations as c (c.id)}
    <li>
      <button class="row" class:active={c.id === activeId} class:unread={unread(c)} onclick={() => onselect(c)}>
        <span class="cat">{c.category}</span>
        <span class="subj">{c.subject ?? '(no subject)'}</span>
        {#if c.is_public}<span class="pub">FAQ</span>{/if}
        {#if unread(c)}<span class="dot" aria-label="unread"></span>{/if}
      </button>
    </li>
  {/each}
</ul>

<style>
  .list { list-style: none; margin: 0; padding: 0; }
  .row { display: flex; align-items: center; gap: var(--space-1); width: 100%; padding: var(--space-2); border: none; background: none; text-align: left; cursor: pointer; border-bottom: 1px solid var(--color-border); }
  .row.active { background: var(--color-nav-item-active); }
  .row.unread .subj { font-weight: 700; }
  .cat { font-size: var(--text-xs); text-transform: uppercase; color: var(--color-text-muted); }
  .subj { flex: 1; }
  .pub { font-size: var(--text-xs); color: var(--color-primary); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); }
</style>
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: no new errors from these two components.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/support/ConversationThread.svelte src/lib/components/support/ConversationList.svelte
git commit -m "feat(support): add conversation thread and list components"
```

---

### Task 8: Floating widget + layout integration

**Files:**
- Create: `src/lib/components/support/SupportWidget.svelte`
- Modify: `src/routes/+layout.svelte` (mount widget; add Support nav link; add admin nav entry)

**Interfaces:**
- Consumes: `support`, `unreadCount`, `initSupport`, `teardownSupport` from `$lib/stores/support`; `isAuthenticated`, `auth` from `$lib/stores/auth`; `isRunning` from `$lib/stores/benchmark`; `ConversationList`, `ConversationThread`, `MessageComposer`, `createConversation`.
- Produces: a self-contained widget that mounts once.

- [ ] **Step 1: Write `SupportWidget.svelte`**

```svelte
<script lang="ts">
  import { support, unreadCount } from '$lib/stores/support';
  import { auth } from '$lib/stores/auth';
  import ConversationList from './ConversationList.svelte';
  import ConversationThread from './ConversationThread.svelte';
  import MessageComposer from './MessageComposer.svelte';
  import { createConversation } from '$lib/support/crud';
  import type { Conversation, Category } from '$lib/support/types';

  let open = $state(false);
  let active = $state<Conversation | null>(null);
  let composingNew = $state(false);

  const viewerId = $derived($auth.user?.id ?? '');
  const isAdminViewer = $derived($auth.role === 'admin');

  async function startNew(p: { body: string; category?: Category; files: { blob: Blob; name: string; w: number; h: number }[] }) {
    const c = await createConversation({ userId: viewerId, category: p.category ?? 'other', body: p.body });
    composingNew = false;
    active = c;
  }
</script>

<button class="fab" onclick={() => (open = !open)} aria-label="Support messages">
  💬
  {#if $unreadCount > 0}<span class="badge">{$unreadCount}</span>{/if}
</button>

{#if open}
  <div class="panel">
    <header>
      <strong>Support</strong>
      <button onclick={() => { composingNew = true; active = null; }}>New</button>
      <button onclick={() => (open = false)} aria-label="Close">×</button>
    </header>
    {#if composingNew}
      <MessageComposer showCategory onsend={startNew} />
    {:else if active}
      <button class="back" onclick={() => (active = null)}>← All conversations</button>
      <ConversationThread conversation={active} {viewerId} {isAdminViewer} />
    {:else}
      <ConversationList conversations={$support.conversations} reads={$support.reads}
        onselect={(c) => (active = c)} />
    {/if}
  </div>
{/if}

<style>
  .fab { position: fixed; right: var(--space-3); bottom: var(--space-3); width: 52px; height: 52px; border-radius: 50%; background: var(--color-primary); color: var(--color-text-on-primary); border: none; font-size: 22px; cursor: pointer; z-index: var(--z-overlay); box-shadow: var(--shadow-dropdown); }
  .badge { position: absolute; top: -2px; right: -2px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--color-warning); color: #fff; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
  .panel { position: fixed; right: var(--space-3); bottom: calc(var(--space-3) + 64px); width: 360px; max-height: 70vh; display: flex; flex-direction: column; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-dropdown); z-index: var(--z-overlay); padding: var(--space-2); overflow: hidden; }
  header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
  header strong { flex: 1; }
  .back { align-self: flex-start; background: none; border: none; color: var(--color-primary); cursor: pointer; }
</style>
```

- [ ] **Step 2: Mount widget in `src/routes/+layout.svelte`**

Add to the script imports:
```ts
  import SupportWidget from '$lib/components/support/SupportWidget.svelte';
  import { initSupport, teardownSupport } from '$lib/stores/support';
```

Inside the existing `onMount` (after `auth.set(...)`), start/stop support when authenticated:
```ts
    if (data.session?.user) {
      initSupport(data.session.user.id, role === 'admin');
    }
```
And in the `onMount` return cleanup (alongside `subscription.unsubscribe()`):
```ts
    return () => { subscription.unsubscribe(); teardownSupport(); };
```

Mount the widget next to `<CartPanel>`, gated so it never shows during a run or when logged out:
```svelte
{#if $isAuthenticated && !$isRunningStore}
  <SupportWidget />
{/if}
```

- [ ] **Step 3: Add Support + FAQ nav links**

In the `nav-right` cluster (near the `Sign in` / user menu), add a Support link for authenticated users and a public FAQ link:
```svelte
    <a href="/faq" class="nav-item">FAQ</a>
    {#if $isAuthenticated}
      <a href="/support" class="nav-item">Support</a>
    {/if}
```
Add `/admin/support` to the `adminGroups` array:
```ts
    { links: [{ href: '/admin/support', label: 'Support', title: 'Admin: all user support conversations.' }] },
```

- [ ] **Step 4: Typecheck + manual smoke**

Run: `npm run check`
Expected: no new errors.
Run: `npm run dev`, log in, confirm the 💬 button appears, and that navigating to `/inference/run` hides it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/support/SupportWidget.svelte src/routes/+layout.svelte
git commit -m "feat(support): add floating widget and layout integration"
```

---

### Task 9: `/support` full page (with logged-out gate)

**Files:**
- Create: `src/routes/support/+page.svelte`

**Interfaces:**
- Consumes: `support` store, `auth`, `ConversationList`, `ConversationThread`, `MessageComposer`, `createConversation`.

- [ ] **Step 1: Write the page**

```svelte
<script lang="ts">
  import { support } from '$lib/stores/support';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import ConversationList from '$lib/components/support/ConversationList.svelte';
  import ConversationThread from '$lib/components/support/ConversationThread.svelte';
  import MessageComposer from '$lib/components/support/MessageComposer.svelte';
  import { createConversation } from '$lib/support/crud';
  import type { Conversation, Category } from '$lib/support/types';

  let active = $state<Conversation | null>(null);
  let composingNew = $state(false);
  const viewerId = $derived($auth.user?.id ?? '');
  const isAdminViewer = $derived($auth.role === 'admin');

  async function startNew(p: { body: string; category?: Category; files: { blob: Blob; name: string; w: number; h: number }[] }) {
    const c = await createConversation({ userId: viewerId, category: p.category ?? 'other', body: p.body });
    composingNew = false; active = c;
  }
</script>

{#if !$isAuthenticated}
  <div class="gate">
    <h1>Sign in to ask a question</h1>
    <p>Support conversations are private to your account.</p>
    <a class="btn" href="/login">Sign in</a>
  </div>
{:else}
  <div class="layout">
    <aside>
      <button class="new" onclick={() => { composingNew = true; active = null; }}>New conversation</button>
      <ConversationList conversations={$support.conversations} reads={$support.reads}
        activeId={active?.id} onselect={(c) => { active = c; composingNew = false; }} />
    </aside>
    <section>
      {#if composingNew}
        <MessageComposer showCategory onsend={startNew} />
      {:else if active}
        <ConversationThread conversation={active} {viewerId} {isAdminViewer} />
      {:else}
        <p class="empty">Select a conversation or start a new one.</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .gate { max-width: 420px; margin: var(--space-6) auto; text-align: center; }
  .btn { display: inline-block; margin-top: var(--space-2); padding: var(--space-1) var(--space-3); background: var(--color-primary); color: var(--color-text-on-primary); border-radius: var(--radius-base); text-decoration: none; }
  .layout { display: grid; grid-template-columns: 320px 1fr; gap: var(--space-3); min-height: 60vh; }
  aside { border-right: 1px solid var(--color-border); }
  .new { width: 100%; margin-bottom: var(--space-2); }
  .empty { color: var(--color-text-muted); }
  @media (max-width: 640px) { .layout { grid-template-columns: 1fr; } aside { border-right: none; } }
</style>
```

- [ ] **Step 2: Manual smoke**

Run: `npm run dev`
Expected: logged out → gate with Sign in link; logged in → two-pane layout; can create a conversation and see it appear.

- [ ] **Step 3: Commit**

```bash
git add src/routes/support/+page.svelte
git commit -m "feat(support): add /support page with logged-out gate"
```

---

### Task 10: `/faq` public page

**Files:**
- Create: `src/routes/faq/+page.svelte`
- Create: `src/lib/components/support/FaqSearch.svelte`

**Interfaces:**
- Consumes: `listPublicConversations`, `getMessages` from `$lib/support/crud`; `MessageBubble`.
- Produces: `FaqSearch` props `{ value = $bindable(''); onsearch: (q: string) => void }`.

- [ ] **Step 1: Write `FaqSearch.svelte`**

```svelte
<script lang="ts">
  let { value = $bindable(''), onsearch }: { value?: string; onsearch: (q: string) => void } = $props();
</script>
<form class="search" onsubmit={(e) => { e.preventDefault(); onsearch(value); }}>
  <input type="search" bind:value placeholder="Search the FAQ…" aria-label="Search FAQ" />
  <button type="submit">Search</button>
</form>
<style>
  .search { display: flex; gap: var(--space-1); margin-bottom: var(--space-3); }
  input { flex: 1; padding: var(--space-1); border: 1px solid var(--color-border); border-radius: var(--radius-base); }
</style>
```

- [ ] **Step 2: Write `/faq/+page.svelte`**

```svelte
<script lang="ts">
  import { listPublicConversations, getMessages } from '$lib/support/crud';
  import FaqSearch from '$lib/components/support/FaqSearch.svelte';
  import MessageBubble from '$lib/components/support/MessageBubble.svelte';
  import type { Conversation, Message } from '$lib/support/types';

  let convs = $state<Conversation[]>([]);
  let expanded = $state<string | null>(null);
  let threadCache = $state<Record<string, Message[]>>({});
  let query = $state('');
  let loading = $state(true);

  async function load(q = '') {
    loading = true;
    convs = await listPublicConversations(q);
    loading = false;
  }
  $effect(() => { load(); });

  async function toggle(c: Conversation) {
    if (expanded === c.id) { expanded = null; return; }
    expanded = c.id;
    if (!threadCache[c.id]) threadCache = { ...threadCache, [c.id]: await getMessages(c.id) };
  }
</script>

<h1>FAQ</h1>
<FaqSearch bind:value={query} onsearch={(q) => load(q)} />

{#if loading}
  <p>Loading…</p>
{:else if convs.length === 0}
  <p>No public questions yet{query ? ' for that search' : ''}.</p>
{:else}
  <ul class="faq">
    {#each convs as c (c.id)}
      <li>
        <button class="q" onclick={() => toggle(c)}>
          <span class="cat">{c.category}</span>
          {c.subject ?? '(question)'}
        </button>
        {#if expanded === c.id}
          <div class="a">
            {#each threadCache[c.id] ?? [] as m (m.id)}
              <MessageBubble message={m} isOwn={false} isAdminViewer={false} />
            {/each}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .faq { list-style: none; padding: 0; }
  .q { width: 100%; text-align: left; padding: var(--space-2); border: none; border-bottom: 1px solid var(--color-border); background: none; cursor: pointer; font-weight: 600; }
  .cat { font-size: var(--text-xs); text-transform: uppercase; color: var(--color-text-muted); margin-right: var(--space-1); }
  .a { padding: var(--space-2); }
</style>
```

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`, open `/faq` while logged out.
Expected: page loads, lists any public conversations, search works, expanding shows non-internal messages only.

- [ ] **Step 4: Commit**

```bash
git add src/routes/faq/+page.svelte src/lib/components/support/FaqSearch.svelte
git commit -m "feat(support): add public /faq page with search"
```

---

### Task 11: `/admin/support` inbox

**Files:**
- Create: `src/routes/admin/support/+page.svelte`

**Interfaces:**
- Consumes: `support` store (admin mode is set by `initSupport(..., true)` when role is admin), `auth`, `ConversationList`, `ConversationThread`, `MessageComposer` (with internal-note option), `sendMessage`, `setStatus`.

- [ ] **Step 1: Write the page**

```svelte
<script lang="ts">
  import { support } from '$lib/stores/support';
  import { auth } from '$lib/stores/auth';
  import ConversationList from '$lib/components/support/ConversationList.svelte';
  import ConversationThread from '$lib/components/support/ConversationThread.svelte';
  import { sendMessage } from '$lib/support/crud';
  import type { Conversation } from '$lib/support/types';

  let active = $state<Conversation | null>(null);
  let categoryFilter = $state<'all' | 'bug' | 'feature' | 'howto' | 'other'>('all');
  let statusFilter = $state<'all' | 'open' | 'resolved'>('all');
  let internalNote = $state('');

  const viewerId = $derived($auth.user?.id ?? '');
  const filtered = $derived($support.conversations.filter((c) =>
    (categoryFilter === 'all' || c.category === categoryFilter) &&
    (statusFilter === 'all' || c.status === statusFilter)
  ));

  async function addInternalNote() {
    if (!active || !internalNote.trim()) return;
    await sendMessage({ conversationId: active.id, senderId: viewerId, body: internalNote.trim(), isInternal: true });
    internalNote = '';
  }
</script>

<h1>Support inbox</h1>
<div class="filters">
  <select bind:value={categoryFilter}>
    <option value="all">All categories</option>
    <option value="bug">Bug</option><option value="feature">Feature</option>
    <option value="howto">How-to</option><option value="other">Other</option>
  </select>
  <select bind:value={statusFilter}>
    <option value="all">All statuses</option>
    <option value="open">Open</option><option value="resolved">Resolved</option>
  </select>
</div>

<div class="layout">
  <aside>
    <ConversationList conversations={filtered} reads={$support.reads}
      activeId={active?.id} onselect={(c) => (active = c)} />
  </aside>
  <section>
    {#if active}
      <ConversationThread conversation={active} {viewerId} isAdminViewer={true} />
      <div class="internal">
        <textarea bind:value={internalNote} rows="2" placeholder="Internal note (only admins see this)"></textarea>
        <button onclick={addInternalNote} disabled={!internalNote.trim()}>Add internal note</button>
      </div>
    {:else}
      <p class="empty">Select a conversation.</p>
    {/if}
  </section>
</div>

<style>
  .filters { display: flex; gap: var(--space-2); margin-bottom: var(--space-2); }
  .layout { display: grid; grid-template-columns: 340px 1fr; gap: var(--space-3); min-height: 60vh; }
  aside { border-right: 1px solid var(--color-border); }
  .internal { margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1); border-top: 1px dashed var(--color-warning); padding-top: var(--space-2); }
  .internal textarea { width: 100%; padding: var(--space-1); border: 1px solid var(--color-border); border-radius: var(--radius-base); }
  .empty { color: var(--color-text-muted); }
  @media (max-width: 640px) { .layout { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 2: Manual smoke**

Run: `npm run dev`, log in as admin, open `/admin/support`.
Expected: all conversations visible, filters work, can reply, can add an internal note (which a non-admin must NOT see — verify by reloading `/faq` or `/support` as that user).

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin/support/+page.svelte
git commit -m "feat(support): add admin support inbox with filters and internal notes"
```

---

### Task 12: Full test + check pass, then QA the inference-protection guarantee

**Files:** none (verification task)

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: all support tests pass; pre-existing failures (4 unrelated, noted in project history) unchanged. No NEW failures.

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: svelte-check error count not increased beyond the 54 pre-existing.

- [ ] **Step 3: QA inference protection (the hard requirement)**

Run: `npm run dev`, log in, open browser devtools → Network → WS.
1. Confirm a `support` realtime WebSocket is open while idle.
2. Start a benchmark run (`/inference/run`). Confirm: the 💬 widget disappears AND the support WebSocket closes (no frames during the run).
3. Let the run finish. Confirm: the widget reappears, the WS reopens, and a single catch-up fetch fires.

Expected: zero messaging WS activity during the run. If the socket stays open during a run, the `isRunning` subscription in `src/lib/stores/support.ts` is wired wrong — fix before proceeding.

- [ ] **Step 4: Final commit (if any QA fixes were made)**

```bash
git add -A
git commit -m "test(support): verify suite green and inference-protection holds"
```
