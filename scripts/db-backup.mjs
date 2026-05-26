import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL is not set in .env');
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const filename = `backup-${date}.sql`;

console.log(`Running pg_dump → ${filename} ...`);

try {
  const sql = execSync(
    `pg_dump --no-password --clean --if-exists --no-owner --no-acl "${dbUrl}"`,
    { maxBuffer: 512 * 1024 * 1024 }
  );
  writeFileSync(filename, sql);
  console.log(`Done. ${(sql.length / 1024).toFixed(1)} KB written to ${filename}`);
} catch (e) {
  console.error('pg_dump failed:', e.message);
  process.exit(1);
}
