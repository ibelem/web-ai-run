import { describe, it, expect } from 'vitest';
import { computeUnread } from '$lib/stores/support';
import type { Conversation } from '$lib/support/types';

function conv(id: string, lastMsg: string, userId = 'me'): Conversation {
  return {
    id,
    user_id: userId,
    category: 'other',
    subject: null,
    status: 'open',
    is_public: false,
    assigned_to: null,
    last_message_at: lastMsg,
    created_at: lastMsg,
    updated_at: lastMsg
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
