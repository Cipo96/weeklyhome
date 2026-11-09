import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function findTests(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTests(full));
    } else if (entry.name.endsWith('.test.js')) {
      results.push(full);
    }
  }
  return results;
}

const files = findTests('dist');
if (files.length === 0) {
  console.error('Nessun file di test trovato in dist/');
  process.exit(1);
}

const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 0);
