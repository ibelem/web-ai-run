import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SharedRunConfig } from '$lib/supabase/types';

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Sign in to share configurations');

  const body: SharedRunConfig = await request.json();

  if (!body.models?.length) throw error(400, 'At least one model is required');
  if (!body.backends?.length) throw error(400, 'At least one backend is required');

  const id = generateId();

  const { error: dbError } = await (locals.supabase.from('shared_configs') as any)
    .insert({ id, owner_id: session.user.id, config: body });

  if (dbError) throw error(500, 'Failed to save configuration');

  return json({ id });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Sign in to delete configurations');

  const id = url.searchParams.get('id');
  if (!id) throw error(400, 'Missing id parameter');

  const { error: dbError } = await (locals.supabase.from('shared_configs') as any)
    .delete()
    .eq('id', id)
    .eq('owner_id', session.user.id);

  if (dbError) throw error(500, 'Failed to delete configuration');

  return json({ ok: true });
};
