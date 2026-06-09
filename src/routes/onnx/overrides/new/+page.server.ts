import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { isAtLeast } from '$lib/types/roles';
import { loginUrl } from '$lib/utils/login-redirect';

function requireAuth(session: any) {
  if (!session) throw redirect(303, '/login');
  const role = session.user.app_metadata?.role ?? 'anonymous';
  if (!isAtLeast(role, 'member')) throw error(403, 'Login required');
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(303, loginUrl(url.pathname + url.search));
  const role = session.user.app_metadata?.role ?? 'anonymous';
  if (!isAtLeast(role, 'member')) throw error(403, 'Login required');
  return {};
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const session = await locals.getSession();
    requireAuth(session);

    const formData = await request.formData();
    const hfModelId = (formData.get('hf_model_id') as string)?.trim();
    const filePath = (formData.get('file_path') as string)?.trim();
    const raw = (formData.get('overrides') as string)?.trim();

    if (!hfModelId) return { success: false, error: 'HuggingFace model ID is required' };
    if (!filePath) return { success: false, error: 'File path is required' };
    if (!raw) return { success: false, error: 'Overrides are required' };

    let parsed: Record<string, number>;
    try {
      parsed = parseOverridesString(raw);
    } catch (e: any) {
      return { success: false, error: e.message };
    }

    const { error: dbError } = await (locals.supabase.from('free_dimension_overrides') as any)
      .upsert(
        {
          hf_model_id: hfModelId,
          file_path: filePath,
          overrides: parsed,
          updated_by: session!.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'hf_model_id,file_path' }
      );

    if (dbError) return { success: false, error: dbError.message };

    throw redirect(303, '/onnx/overrides');
  },
};

function parseOverridesString(raw: string): Record<string, number> {
  if (!raw) throw new Error('Overrides cannot be empty');
  const result: Record<string, number> = {};
  const pairs = raw.split(',').map(s => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const [key, val] = pair.split(':').map(s => s.trim());
    if (!key) throw new Error(`Invalid pair: "${pair}"`);
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) throw new Error(`Invalid value for "${key}": must be a non-negative integer`);
    result[key] = num;
  }
  if (Object.keys(result).length === 0) throw new Error('At least one override is required');
  return result;
}
