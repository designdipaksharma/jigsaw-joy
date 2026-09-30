#!/usr/bin/env node
/**
 * Post-build checks + packaging for the YouTube Playables bundle.
 * Verifies the documented bundle rules and writes release/jigsaw-joy-playables.zip.
 */
import { readdirSync, statSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist-playables');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else files.push({ path: relative(dist, p), bytes: st.size });
  }
})(dist);

const MiB = 1024 * 1024;
const errors = [];
const total = files.reduce((a, f) => a + f.bytes, 0);
if (files.length > 8000) errors.push(`Too many files: ${files.length} (max 8000)`);
if (total >= 250 * MiB) errors.push('Total bundle ≥ 250 MiB');
for (const f of files) {
  if (f.bytes >= 30 * MiB) errors.push(`${f.path} ≥ 30 MiB`);
  const base = f.path.split('/').pop();
  if (!/^[A-Za-z0-9_.-]+$/.test(base)) errors.push(`Illegal filename: ${f.path}`);
}
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const sdkAt = html.indexOf('https://www.youtube.com/game_api/v1');
const gameAt = html.indexOf('type="module"');
if (sdkAt < 0) errors.push('Playables SDK script tag missing');
if (sdkAt > gameAt) errors.push('SDK must load before game code');
if (/(src|href)="\//.test(html)) errors.push('Absolute paths found in index.html');
const js = files.filter((f) => f.path.endsWith('.js')).map((f) => readFileSync(join(dist, f.path), 'utf8')).join('\n');
if (js.includes('visibilitychange')) errors.push('Page Visibility API found in Playables bundle');
if (/navigator\.languages?\b/.test(js)) errors.push('navigator.language(s) used');

const big = files.filter((f) => f.bytes > 512 * 1024);
console.log(`Playables bundle: ${files.length} files, ${(total / 1024).toFixed(1)} KiB total`);
if (big.length) console.log('Files over the 512 KiB recommendation:', big.map((f) => f.path).join(', '));
if (errors.length) {
  console.error('✗ Playables checks failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log('✓ Playables bundle checks passed');

mkdirSync(join(root, 'release'), { recursive: true });
const zip = join(root, 'release', 'jigsaw-joy-playables.zip');
if (existsSync(zip)) rmSync(zip);
try {
  execFileSync('zip', ['-r', '-q', '-X', zip, '.'], { cwd: dist });
  console.log(`✓ Wrote ${relative(root, zip)} (${(statSync(zip).size / 1024).toFixed(1)} KiB)`);
} catch {
  console.warn('zip not available — upload the dist-playables/ folder contents instead.');
}
