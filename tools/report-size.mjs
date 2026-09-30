#!/usr/bin/env node
/** Prints raw + gzip sizes for every file in dist/ (used for docs/PERFORMANCE.md). */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = process.argv[2] || 'dist';
const rows = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else {
      const buf = readFileSync(p);
      rows.push({ file: relative(dir, p), raw: buf.length, gz: gzipSync(buf, { level: 9 }).length });
    }
  }
})(dir);
rows.sort((a, b) => b.raw - a.raw);
const kb = (n) => (n / 1024).toFixed(1).padStart(7);
console.log('file'.padEnd(46), '   raw KiB', '  gzip KiB');
for (const r of rows) console.log(r.file.padEnd(46), kb(r.raw), '  ', kb(r.gz));
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
console.log('-'.repeat(70));
console.log(`TOTAL (${rows.length} files)`.padEnd(46), kb(sum('raw')), '  ', kb(sum('gz')));
const initial = rows.filter((r) => /^(index\.html|assets\/index-.*\.(js|css)|assets\/development-.*\.js|favicon\.svg)$/.test(r.file));
console.log(`Initial load (html+js+css+favicon)`.padEnd(46), kb(initial.reduce((a, r) => a + r.raw, 0)), '  ', kb(initial.reduce((a, r) => a + r.gz, 0)));
