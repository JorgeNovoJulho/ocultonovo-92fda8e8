#!/usr/bin/env node
/**
 * Detect stale Vite dynamic-import chunk references in dist/ before publish.
 * Scans dist/assets/*.js for any `import("/assets/<hash>.js")` or
 * `from"/assets/<hash>.js"` reference whose target file does not exist.
 *
 * This catches the "Failed to fetch dynamically imported module" class of
 * runtime errors caused by HMR / partial builds leaving dangling chunk URLs.
 *
 * Exits non-zero (fail the publish) if any stale reference is detected.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');

if (!existsSync(ASSETS)) {
  console.log(`[check-stale-chunks] dist/assets not found — skipping (no build to check).`);
  process.exit(0);
}

const files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
const present = new Set(files);
const refRegex = /["'`]\/assets\/([A-Za-z0-9_\-.]+\.js)["'`]/g;

let stale = 0;
let scanned = 0;
const reports = [];

for (const f of files) {
  const full = join(ASSETS, f);
  if (!statSync(full).isFile()) continue;
  scanned += 1;
  const src = readFileSync(full, 'utf8');
  let m;
  while ((m = refRegex.exec(src)) !== null) {
    const target = m[1];
    if (!present.has(target)) {
      stale += 1;
      reports.push({ in: f, missing: target });
    }
  }
}

console.log(`[check-stale-chunks] Scanned ${scanned} chunks in ${ASSETS}.`);
if (stale > 0) {
  console.error(`[check-stale-chunks] ❌ ${stale} stale chunk reference(s) detected:`);
  for (const r of reports.slice(0, 25)) console.error(`  - ${r.in} → missing ${r.missing}`);
  if (reports.length > 25) console.error(`  …and ${reports.length - 25} more`);
  process.exit(1);
}
console.log(`[check-stale-chunks] ✅ No stale dynamic-import references.`);
