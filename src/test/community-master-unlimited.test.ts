import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/external_sql/2026_06_09_communities_master_unlimited_fix.sql', 'utf8');
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('community_create master ilimitado', () => {
  it('usa cast explícito ::public.app_role nas duas chamadas has_role', () => {
    expect(executableSql.match(/SELECT public\.has_role\([^\n]+, 'admin_master'::public\.app_role\)/g)).toHaveLength(2);
    expect(executableSql).not.toMatch(/has_role\([^\n]+,\s*'admin_master'\)/);
  });

  it('preserva limites para não-master e remove pending_review só do master', () => {
    expect(sql).toContain('IF NOT v_is_master THEN');
    expect(sql).toContain('AND NOT v_is_master');
    expect(sql).toContain("'reason', 'limit_reached'");
    expect(sql).toContain("'reason', 'plan_not_allowed'");
  });
});