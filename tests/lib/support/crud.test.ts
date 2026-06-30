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
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
  or: mockOr,
  order: mockOrder,
  single: mockSingle,
  upsert: mockUpsert,
  textSearch: mockTextSearch
};
Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));

vi.mock('$lib/supabase/client', () => ({
  createClient: () => ({ from: () => chainable })
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
    expect(mockTextSearch).toHaveBeenCalledWith('search_tsv', 'webgpu:*');
  });

  it('createConversation inserts conversation then first message', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'c1', user_id: 'u1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'm1' }, error: null });
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

  it('toPrefixQuery builds an AND prefix tsquery and drops short terms', async () => {
    const { toPrefixQuery } = await import('$lib/support/crud');
    expect(toPrefixQuery('web gpu')).toBe('web:* & gpu:*');
    expect(toPrefixQuery('a webgpu')).toBe('webgpu:*'); // 1-2 char terms dropped
    expect(toPrefixQuery('   ')).toBe('');
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
