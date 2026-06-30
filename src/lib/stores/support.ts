import { writable, derived, get } from 'svelte/store';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '$lib/supabase/client';
import { isRunning } from '$lib/stores/benchmark';
import { listConversations } from '$lib/support/crud';
import type { Conversation } from '$lib/support/types';

interface SupportState {
  conversations: Conversation[];
  reads: Record<string, string>; // conversation_id -> last_read_at ISO
  loading: boolean;
  active: boolean; // false while a benchmark run is in progress
}

export const support = writable<SupportState>({
  conversations: [],
  reads: {},
  loading: false,
  active: true
});

export function computeUnread(
  convs: Conversation[],
  reads: Record<string, string>,
  _userId: string
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
  const { data: readRows } = await (db.from('conversation_reads') as any)
    .select('conversation_id,last_read_at')
    .eq('user_id', currentUserId!);
  const reads: Record<string, string> = {};
  for (const r of (readRows ?? []) as { conversation_id: string; last_read_at: string }[]) {
    reads[r.conversation_id] = r.last_read_at;
  }
  support.update((s) => ({ ...s, conversations: convs, reads, loading: false }));
}

function openChannel() {
  if (channel) return;
  const db = createClient();
  channel = db
    .channel('support')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
      refresh();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
      refresh();
    })
    .subscribe();
}

function closeChannel() {
  if (channel) {
    channel.unsubscribe();
    channel = null;
  }
}

export function initSupport(userId: string, admin: boolean): void {
  currentUserId = userId;
  isAdmin = admin;
  // React to run state: dormant during inference, live otherwise.
  unsubRunning = isRunning.subscribe((running) => {
    if (running) {
      support.update((s) => ({ ...s, active: false }));
      closeChannel();
    } else {
      support.update((s) => ({ ...s, active: true }));
      openChannel();
      refresh(); // catch-up fetch after a run ends
    }
  });
  if (!get(isRunning)) {
    openChannel();
    refresh();
  }
}

export function teardownSupport(): void {
  closeChannel();
  if (unsubRunning) {
    unsubRunning();
    unsubRunning = null;
  }
  currentUserId = null;
  isAdmin = false;
}
