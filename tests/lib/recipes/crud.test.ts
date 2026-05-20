import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOr = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

const chainable = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  eq: mockEq,
  or: mockOr,
  order: mockOrder,
  single: mockSingle,
};

Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));

vi.mock('$lib/supabase/client', () => ({
  createClient: () => ({
    from: () => chainable,
  }),
}));

describe('recipes/crud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));
  });

  it('listRecipes calls supabase with correct filters for authenticated user', async () => {
    mockOrder.mockResolvedValueOnce({ data: [{ id: '1', name: 'Test' }], error: null });

    const { listRecipes } = await import('$lib/recipes/crud');
    const results = await listRecipes('user-123');

    expect(mockOr).toHaveBeenCalledWith('owner_id.eq.user-123,visibility.eq.public');
    expect(mockOrder).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(results).toHaveLength(1);
  });

  it('listRecipes filters to public only when no userId', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    const { listRecipes } = await import('$lib/recipes/crud');
    await listRecipes();

    expect(mockEq).toHaveBeenCalledWith('visibility', 'public');
  });

  it('createRecipe generates a slug and inserts', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'new-1', name: 'My Recipe', slug: 'my-recipe-abc' },
      error: null,
    });

    const { createRecipe } = await import('$lib/recipes/crud');
    const result = await createRecipe('user-1', 'My Recipe', [
      { hf_model_id: 'webnn/model', file_path: 'model.onnx', data_type: 'fp32' },
    ]);

    expect(mockInsert).toHaveBeenCalled();
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.name).toBe('My Recipe');
    expect(insertArg.slug).toMatch(/^my-recipe-/);
    expect(insertArg.owner_id).toBe('user-1');
    expect(insertArg.models).toHaveLength(1);
    expect(result.id).toBe('new-1');
  });

  it('deleteRecipe calls delete with correct id', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const { deleteRecipe } = await import('$lib/recipes/crud');
    await deleteRecipe('recipe-123');

    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', 'recipe-123');
  });
});
