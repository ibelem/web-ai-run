import { createClient } from '$lib/supabase/client';
import type { Conversation, Message, Category, ConvStatus, Attachment } from './types';

const BUCKET = 'support-attachments';

export async function listConversations(opts: { userId?: string; admin?: boolean }): Promise<Conversation[]> {
  const db = createClient();
  let q = (db.from('conversations') as any).select('*');
  if (!opts.admin && opts.userId) q = q.eq('user_id', opts.userId);
  const { data, error } = await q.order('last_message_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

// Build a prefix tsquery so live typing matches partial words:
// "web gpu" -> "web:* & gpu:*" (matches "webgpu", "gpus", etc.)
export function toPrefixQuery(search: string): string {
  return search
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((term) => term.length > 2)
    .map((term) => term + ':*')
    .join(' & ');
}

export async function listPublicConversations(search?: string): Promise<Conversation[]> {
  const db = createClient();
  let q = (db.from('conversations') as any).select('*').eq('is_public', true);
  if (search && search.trim()) {
    const tsquery = toPrefixQuery(search);
    if (tsquery) q = q.textSearch('search_tsv', tsquery);
  }
  const { data, error } = await q.order('last_message_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const db = createClient();
  const { data, error } = await (db.from('messages') as any)
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

// Derive a short subject from the first message when the user didn't set one.
export function deriveSubject(body: string, max = 60): string {
  const clean = body.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd() + '…';
}

export async function createConversation(input: {
  userId: string;
  category: Category;
  subject?: string;
  body: string;
  attachments?: Attachment[];
}): Promise<Conversation> {
  const db = createClient();
  const subject = input.subject?.trim() || deriveSubject(input.body);
  const { data: conv, error: cErr } = await (db.from('conversations') as any)
    .insert({ user_id: input.userId, category: input.category, subject })
    .select('*')
    .single();
  if (cErr) throw cErr;
  const c = conv as Conversation;
  const { error: mErr } = await (db.from('messages') as any)
    .insert({
      conversation_id: c.id,
      sender_id: input.userId,
      body: input.body,
      attachments: input.attachments ?? []
    })
    .select('*')
    .single();
  if (mErr) throw mErr;
  return c;
}

export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  attachments?: Attachment[];
  isInternal?: boolean;
}): Promise<Message> {
  const db = createClient();
  const { data, error } = await (db.from('messages') as any)
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      body: input.body,
      attachments: input.attachments ?? [],
      is_internal: input.isInternal ?? false
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Message;
}

export async function setPublic(conversationId: string, isPublic: boolean): Promise<void> {
  const db = createClient();
  const { error } = await (db.from('conversations') as any).update({ is_public: isPublic }).eq('id', conversationId);
  if (error) throw error;
}

export async function setStatus(conversationId: string, status: ConvStatus): Promise<void> {
  const db = createClient();
  const { error } = await (db.from('conversations') as any).update({ status }).eq('id', conversationId);
  if (error) throw error;
}

export async function markRead(conversationId: string, userId: string): Promise<void> {
  const db = createClient();
  const { error } = await (db.from('conversation_reads') as any).upsert(
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
