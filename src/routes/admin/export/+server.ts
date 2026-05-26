import { error, redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

function escapeStr(val: string): string {
  return val.replace(/'/g, "''");
}

function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return `'${escapeStr(JSON.stringify(val))}'`;
  return `'${escapeStr(String(val))}'`;
}

function toInserts(table: string, rows: Record<string, unknown>[], chunkSize = 100): string {
  if (rows.length === 0) return `-- ${table}: 0 rows\n`;
  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `"${c}"`).join(', ');
  const lines: string[] = [`-- ${table}: ${rows.length} rows`];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize);
    const values = batch
      .map(r => `  (${cols.map(c => sqlLiteral(r[c])).join(', ')})`)
      .join(',\n');
    lines.push(
      `INSERT INTO "${table}" (${colList}) VALUES\n${values}\nON CONFLICT (id) DO NOTHING;`
    );
  }
  return lines.join('\n');
}

export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(303, '/');
  if (session.user.app_metadata?.role !== 'admin') throw error(403, 'Admin access required');

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw error(500, 'SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to your .env and Vercel environment variables.');
  }

  const admin = createClient(PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const [profiles, models, recipes, sharedConfigs, results] = await Promise.all([
    admin.from('profiles').select('*'),
    admin.from('models').select('*'),
    admin.from('recipes').select('*'),
    admin.from('shared_configs').select('*'),
    admin.from('results').select('*'),
  ]);

  const ts = new Date().toISOString();
  const sql = [
    `-- Web AI Benchmark database backup`,
    `-- Generated: ${ts}`,
    `-- Restore: psql $DATABASE_URL < this-file.sql`,
    `-- For a full wipe+restore, TRUNCATE the tables first (in reverse FK order):`,
    `--   TRUNCATE results, shared_configs, recipes, models, profiles CASCADE;`,
    ``,
    toInserts('profiles',       (profiles.data      ?? []) as Record<string, unknown>[]),
    ``,
    toInserts('models',         (models.data        ?? []) as Record<string, unknown>[]),
    ``,
    toInserts('recipes',        (recipes.data       ?? []) as Record<string, unknown>[]),
    ``,
    toInserts('shared_configs', (sharedConfigs.data ?? []) as Record<string, unknown>[]),
    ``,
    toInserts('results',        (results.data       ?? []) as Record<string, unknown>[]),
    ``,
  ].join('\n');

  const filename = `web-ai-backup-${ts.slice(0, 10)}.sql`;

  return new Response(sql, {
    headers: {
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="${filename}"`,
    }
  });
};
