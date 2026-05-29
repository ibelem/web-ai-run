import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { isAtLeast } from '$lib/types/roles';

function requireAuth(session: any) {
  if (!session) throw redirect(303, '/login');
  const role = session.user.app_metadata?.role ?? 'anonymous';
  if (!isAtLeast(role, 'member')) throw error(403, 'Login required');
}

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  requireAuth(session);
  return {};
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const session = await locals.getSession();
    requireAuth(session);

    const formData = await request.formData();
    const raw = (formData.get('data') as string)?.trim();

    if (!raw) return { success: false, error: 'No data provided' };

    let entries: Array<{ hf_model_id: string; file_path: string; overrides: Record<string, number> }>;
    try {
      entries = parseImportData(raw);
    } catch (e: any) {
      return { success: false, error: e.message };
    }

    if (entries.length === 0) return { success: false, error: 'No valid entries found' };

    let updated = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      const { error: upsertErr } = await (locals.supabase.from('free_dimension_overrides') as any)
        .upsert(
          {
            hf_model_id: entry.hf_model_id,
            file_path: entry.file_path,
            overrides: entry.overrides,
            updated_by: session!.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'hf_model_id,file_path' }
        );

      if (upsertErr) {
        errors.push(`Failed: ${entry.hf_model_id} / ${entry.file_path}: ${upsertErr.message}`);
      } else {
        updated++;
      }
    }

    if (updated > 0 && errors.length === 0) {
      throw redirect(303, '/onnx/overrides');
    }

    return {
      success: updated > 0,
      error: errors.length > 0 ? `Updated ${updated}, failed ${errors.length}: ${errors.slice(0, 5).join('; ')}` : undefined,
      updated,
      total: entries.length,
    };
  },
};

function parseImportData(raw: string): Array<{ hf_model_id: string; file_path: string; overrides: Record<string, number> }> {
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON');
  }

  if (!Array.isArray(json)) throw new Error('JSON must be an array');

  return json.map((item: any, i: number) => {
    if (!item.hf_model_id || !item.file_path || !item.overrides) {
      throw new Error(`Row ${i + 1}: missing required fields (hf_model_id, file_path, overrides)`);
    }
    validateOverrides(item.overrides, i + 1);
    return { hf_model_id: item.hf_model_id, file_path: item.file_path, overrides: item.overrides };
  });
}

function validateOverrides(obj: any, lineNum: number): void {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new Error(`Row ${lineNum}: overrides must be an object`);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'number' || v <= 0 || !Number.isInteger(v)) {
      throw new Error(`Row ${lineNum}: "${k}" must be a positive integer`);
    }
  }
}
