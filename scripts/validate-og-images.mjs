#!/usr/bin/env node
/**
 * validate-og-images.mjs
 *
 * Valida que cada post do OCULTO PLAY tem capa OG válida.
 * Para cada ID informado, faz GET em /api/og-play (HTML) e em /api/og-play-image,
 * checa: og:image presente, URL absoluta, extensão coerente com Content-Type,
 * Content-Type aceito por Facebook (jpeg/png/gif) e tamanho > 1KB e < 5MB.
 *
 * Uso:
 *   node scripts/validate-og-images.mjs <id> [<id> ...]
 *   node scripts/validate-og-images.mjs --recent 20
 *
 * Saída: tabela colorida no console + exit code 1 se houver inconsistência.
 */

const APP_BASE = process.env.OG_VALIDATOR_BASE || 'https://ocultoswing.com.br';
const EXTERNAL_SUPABASE_URL = 'https://rvybbrkzmboqbhcemqar.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eWJicmt6bWJvcWJoY2VtcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyNjcsImV4cCI6MjA4NjczMTI2N30.p0ZNW9nUB0qQcY6ypNLtPSy5MyZd8W5idMJv4C6AWcc';

const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);
const MIN_BYTES = 1024;       // 1 KB
const MAX_BYTES = 5_000_000;  // 5 MB

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function extFromUrl(u) {
  try {
    const p = new URL(u).pathname.toLowerCase();
    const m = p.match(/\.(jpe?g|png|gif)$/);
    return m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : null;
  } catch { return null; }
}
function extFromType(t) {
  const x = (t || '').toLowerCase().split(';')[0].trim();
  if (x === 'image/png') return 'png';
  if (x === 'image/gif') return 'gif';
  if (x === 'image/jpeg' || x === 'image/jpg') return 'jpg';
  return null;
}

async function fetchRecentIds(n) {
  const r = await fetch(
    `${EXTERNAL_SUPABASE_URL}/rest/v1/oculto_play_items?select=id&visibility=eq.public&order=published_at.desc&limit=${n}`,
    { headers: { apikey: EXTERNAL_SUPABASE_ANON_KEY, authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}` } },
  );
  if (!r.ok) throw new Error(`Falha ao buscar recentes: ${r.status}`);
  const rows = await r.json();
  return rows.map((x) => x.id);
}

async function validateOne(id) {
  const issues = [];
  const ogHtmlUrl = `${APP_BASE}/api/og-play?id=${encodeURIComponent(id)}`;
  const htmlRes = await fetch(ogHtmlUrl, {
    headers: { 'user-agent': 'facebookexternalhit/1.1' },
  });
  const html = await htmlRes.text();
  const m = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (!m) issues.push('og:image ausente');
  const ogImage = m?.[1] || null;
  if (ogImage && !/^https?:\/\//i.test(ogImage)) issues.push('og:image não absoluta');

  let contentType = null;
  let size = null;
  let urlExt = null;
  let typeExt = null;
  if (ogImage) {
    urlExt = extFromUrl(ogImage);
    const imgRes = await fetch(ogImage, { redirect: 'follow', headers: { 'user-agent': 'facebookexternalhit/1.1' } });
    contentType = imgRes.headers.get('content-type');
    typeExt = extFromType(contentType);
    if (!imgRes.ok) issues.push(`status ${imgRes.status}`);
    if (!ALLOWED.has((contentType || '').toLowerCase().split(';')[0].trim())) {
      issues.push(`content-type inválido: ${contentType || 'null'}`);
    }
    const buf = await imgRes.arrayBuffer().catch(() => null);
    size = buf?.byteLength ?? null;
    if (size != null && size < MIN_BYTES) issues.push(`tamanho < 1KB (${size}B)`);
    if (size != null && size > MAX_BYTES) issues.push(`tamanho > 5MB (${size}B)`);
    if (urlExt && typeExt && urlExt !== typeExt) issues.push(`extensão URL=${urlExt} ≠ tipo=${typeExt}`);
  }

  return { id, ogImage, contentType, size, urlExt, typeExt, issues };
}

(async () => {
  const args = process.argv.slice(2);
  let ids = [];
  const recentIdx = args.indexOf('--recent');
  if (recentIdx >= 0) {
    const n = parseInt(args[recentIdx + 1] || '10', 10);
    ids = await fetchRecentIds(Number.isFinite(n) ? n : 10);
  } else {
    ids = args.filter((a) => !a.startsWith('--'));
  }
  if (!ids.length) {
    console.error('Uso: node scripts/validate-og-images.mjs <id> [...] | --recent N');
    process.exit(2);
  }

  console.log(c.dim(`Validando ${ids.length} item(ns) contra ${APP_BASE}...\n`));
  let bad = 0;
  for (const id of ids) {
    try {
      const r = await validateOne(id);
      const ok = r.issues.length === 0;
      if (!ok) bad++;
      const tag = ok ? c.green('OK ') : c.red('FAIL');
      console.log(`${tag}  ${id}  ${c.dim(`(${r.contentType || '?'}, ${r.size ?? '?'}B)`)}`);
      if (!ok) r.issues.forEach((i) => console.log(`     ${c.yellow('• ' + i)}`));
    } catch (e) {
      bad++;
      console.log(`${c.red('ERR ')} ${id}  ${c.yellow(e.message)}`);
    }
  }
  console.log(`\n${bad === 0 ? c.green('Todos válidos.') : c.red(`${bad} item(ns) com problema.`)}`);
  process.exit(bad === 0 ? 0 : 1);
})();
