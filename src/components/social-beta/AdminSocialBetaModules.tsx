import { useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2, RefreshCw, Pencil, X, Languages } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';

type ModuleRow = {
  id: string;
  code: string;
  base_label: string;
  override_label: string | null;
  description: string | null;
  enabled: boolean;
  max_level: 'leve' | 'divertido' | 'provocante' | 'avancado';
  cooldown_seconds: number;
  allowed_context: 'duo' | 'grupo' | 'ambos';
  sort_order: number;
  cards_total: number;
  cards_by_level: Record<string, number>;
  updated_at: string;
};

type CardRow = {
  id: string;
  module_code: string;
  category: string | null;
  level: ModuleRow['max_level'];
  content: string;
  enabled: boolean;
  created_at: string;
};

type Metric = {
  module_code: string;
  module_label: string;
  events_total: number;
  events_period: number;
  draws_period: number;
  answers_period: number;
  unique_users_period: number;
  last_event_at: string | null;
};

const LEVELS: ModuleRow['max_level'][] = ['leve', 'divertido', 'provocante', 'avancado'];
const CONTEXTS: ModuleRow['allowed_context'][] = ['duo', 'grupo', 'ambos'];

export function AdminSocialBetaModules() {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<ModuleRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [cards, setCards] = useState<Record<string, CardRow[]>>({});
  const [newCard, setNewCard] = useState<{ level: ModuleRow['max_level']; category: string; content: string }>({
    level: 'leve', category: '', content: '',
  });

  const refresh = async () => {
    setLoading(true);
    const [{ data: ms }, { data: mt }] = await Promise.all([
      (supabase as any).rpc('social_beta_admin_list_modules'),
      (supabase as any).rpc('social_beta_admin_module_metrics', { _days: 30 }),
    ]);
    setModules((ms || []) as ModuleRow[]);
    setMetrics((mt || []) as Metric[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const loadCards = async (code: string) => {
    const { data, error } = await (supabase as any).rpc('social_beta_admin_list_cards', { _module_code: code });
    if (error) { alert('Falha: ' + error.message); return; }
    setCards((p) => ({ ...p, [code]: (data || []) as CardRow[] }));
  };

  const toggleExpand = async (code: string) => {
    if (expanded === code) { setExpanded(null); return; }
    setExpanded(code);
    if (!cards[code]) await loadCards(code);
  };

  const saveModule = async (m: ModuleRow) => {
    const { error } = await (supabase as any).rpc('social_beta_admin_upsert_module', {
      _code: m.code, _default_label: m.base_label, _description: m.description,
      _enabled: m.enabled, _max_level: m.max_level, _cooldown_seconds: m.cooldown_seconds,
      _allowed_context: m.allowed_context, _sort_order: m.sort_order,
    });
    if (error) { alert('Falha ao salvar módulo: ' + error.message); return; }
    if (m.override_label !== undefined) {
      await (supabase as any).rpc('social_beta_admin_set_i18n', {
        _scope: 'module', _key: m.code, _locale: 'pt-BR', _value: m.override_label ?? '',
      });
    }
    setEditing(null); setCreating(false);
    await refresh();
  };

  const addCard = async (code: string) => {
    if (!newCard.content.trim()) return;
    const { error } = await (supabase as any).rpc('social_beta_admin_upsert_card', {
      _id: null, _module_code: code, _category: newCard.category || null,
      _level: newCard.level, _content: newCard.content.trim(), _enabled: true,
    });
    if (error) { alert('Falha: ' + error.message); return; }
    setNewCard({ level: 'leve', category: '', content: '' });
    await Promise.all([loadCards(code), refresh()]);
  };

  const deleteCard = async (code: string, id: string) => {
    if (!confirm('Excluir este card?')) return;
    const { error } = await (supabase as any).rpc('social_beta_admin_delete_card', { _id: id });
    if (error) { alert('Falha: ' + error.message); return; }
    await Promise.all([loadCards(code), refresh()]);
  };

  const toggleCard = async (code: string, c: CardRow) => {
    const { error } = await (supabase as any).rpc('social_beta_admin_upsert_card', {
      _id: c.id, _module_code: code, _category: c.category, _level: c.level, _content: c.content, _enabled: !c.enabled,
    });
    if (error) { alert('Falha: ' + error.message); return; }
    await loadCards(code);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Languages className="h-4 w-4" /> Módulos · Cards · Renomeação
          </h3>
          <p className="text-xs text-muted-foreground">
            CRUD dos 9 módulos com override de nome (pt-BR) aplicado em tempo real na UI.
          </p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={refresh} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
          <button
            onClick={() => { setCreating(true); setEditing({
              id: '', code: '', base_label: '', override_label: null, description: '',
              enabled: true, max_level: 'leve', cooldown_seconds: 0, allowed_context: 'ambos',
              sort_order: (modules.at(-1)?.sort_order ?? 0) + 10,
              cards_total: 0, cards_by_level: {}, updated_at: new Date().toISOString(),
            }); }}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
          >
            <Plus className="h-3 w-3" /> Novo módulo
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="space-y-2">
          {modules.map((m) => {
            const metric = metrics.find((x) => x.module_code === m.code);
            const isEditing = editing?.code === m.code && !creating;
            return (
              <article key={m.id || m.code} className="rounded-lg border border-border bg-background p-3 space-y-2">
                {!isEditing ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">
                          {m.override_label || m.base_label}
                          {m.override_label && <span className="ml-1.5 text-[10px] text-muted-foreground">(base: {m.base_label})</span>}
                          {!m.enabled && <span className="ml-1.5 text-[10px] uppercase text-destructive">desativado</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">/{m.code} · nível máx {m.max_level} · contexto {m.allowed_context} · cooldown {m.cooldown_seconds}s</p>
                        {m.description && <p className="text-xs text-muted-foreground mt-1">{m.description}</p>}
                      </div>
                      <button onClick={() => { setEditing(m); setCreating(false); }} className="rounded-md border border-border px-2 py-1 text-xs">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5">{m.cards_total} cards</span>
                      {LEVELS.map((lv) => (
                        <span key={lv} className="rounded bg-muted px-1.5 py-0.5">{lv}: {m.cards_by_level?.[lv] ?? 0}</span>
                      ))}
                      {metric && (
                        <>
                          <span className="rounded bg-primary/10 text-foreground px-1.5 py-0.5">30d: {metric.events_period} ev</span>
                          <span className="rounded bg-primary/10 text-foreground px-1.5 py-0.5">{metric.unique_users_period} users</span>
                          <span className="rounded bg-primary/10 text-foreground px-1.5 py-0.5">{metric.draws_period} sorteios</span>
                        </>
                      )}
                    </div>
                    <button onClick={() => toggleExpand(m.code)} className="text-xs text-primary hover:underline">
                      {expanded === m.code ? 'Ocultar cards' : 'Gerenciar cards'}
                    </button>
                    {expanded === m.code && (
                      <div className="mt-2 space-y-2 border-t border-border pt-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <select value={newCard.level} onChange={(e) => setNewCard((p) => ({ ...p, level: e.target.value as any }))}
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs">
                            {LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
                          </select>
                          <input value={newCard.category} onChange={(e) => setNewCard((p) => ({ ...p, category: e.target.value }))}
                            placeholder="Categoria (ex: pergunta, desafio)" className="w-44 rounded-md border border-border bg-background px-2 py-1 text-xs" />
                          <input value={newCard.content} onChange={(e) => setNewCard((p) => ({ ...p, content: e.target.value }))}
                            placeholder="Texto do card / pergunta"
                            className="flex-1 min-w-[200px] rounded-md border border-border bg-background px-2 py-1 text-xs" />
                          <button onClick={() => addCard(m.code)} disabled={!newCard.content.trim()}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">
                            <Plus className="h-3 w-3" /> Adicionar
                          </button>
                        </div>
                        <div className="grid gap-1.5 max-h-72 overflow-y-auto">
                          {(cards[m.code] || []).map((c) => (
                            <div key={c.id} className={`rounded-md border px-2 py-1.5 text-xs flex items-start gap-2 ${c.enabled ? 'border-border bg-card' : 'border-border bg-muted/40 opacity-60'}`}>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{c.level}</span>
                              {c.category && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{c.category}</span>}
                              <p className="flex-1">{c.content}</p>
                              <button onClick={() => toggleCard(m.code, c)} className="text-[11px] text-muted-foreground hover:text-foreground">
                                {c.enabled ? 'desativar' : 'ativar'}
                              </button>
                              <button onClick={() => deleteCard(m.code, c.id)} className="text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {(cards[m.code] || []).length === 0 && (
                            <p className="text-xs text-muted-foreground">Nenhum card neste módulo ainda.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <ModuleEditor initial={editing!} isNew={false} onCancel={() => setEditing(null)} onSave={saveModule} />
                )}
              </article>
            );
          })}
        </div>
      )}

      {creating && editing && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <ModuleEditor initial={editing} isNew onCancel={() => { setCreating(false); setEditing(null); }} onSave={saveModule} />
        </div>
      )}
    </section>
  );
}

function ModuleEditor({ initial, isNew, onCancel, onSave }: {
  initial: ModuleRow; isNew: boolean;
  onCancel: () => void; onSave: (m: ModuleRow) => void;
}) {
  const [m, setM] = useState<ModuleRow>(initial);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Code {isNew ? '' : '(read-only)'}</span>
          <input value={m.code} onChange={(e) => setM({ ...m, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
            disabled={!isNew}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-60" />
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Nome base (fallback)</span>
          <input value={m.base_label} onChange={(e) => setM({ ...m, base_label: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </label>
        <label className="text-xs space-y-1 sm:col-span-2">
          <span className="text-muted-foreground">Nome exibido (override pt-BR — vazio = usa base)</span>
          <input value={m.override_label ?? ''} onChange={(e) => setM({ ...m, override_label: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </label>
        <label className="text-xs space-y-1 sm:col-span-2">
          <span className="text-muted-foreground">Descrição</span>
          <textarea value={m.description ?? ''} onChange={(e) => setM({ ...m, description: e.target.value })} rows={2}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Nível máximo</span>
          <select value={m.max_level} onChange={(e) => setM({ ...m, max_level: e.target.value as any })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm">
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Contexto permitido</span>
          <select value={m.allowed_context} onChange={(e) => setM({ ...m, allowed_context: e.target.value as any })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm">
            {CONTEXTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Cooldown (segundos)</span>
          <input type="number" min={0} value={m.cooldown_seconds} onChange={(e) => setM({ ...m, cooldown_seconds: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Ordem</span>
          <input type="number" value={m.sort_order} onChange={(e) => setM({ ...m, sort_order: Number(e.target.value) || 0 })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </label>
        <label className="text-xs space-y-1 flex items-end gap-2">
          <input type="checkbox" checked={m.enabled} onChange={(e) => setM({ ...m, enabled: e.target.checked })} />
          <span>Ativado</span>
        </label>
      </div>
      <div className="flex justify-end gap-1.5">
        <button onClick={onCancel} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs">
          <X className="h-3 w-3" /> Cancelar
        </button>
        <button
          onClick={async () => { if (!m.code || !m.base_label) return; setBusy(true); try { await onSave(m); } finally { setBusy(false); } }}
          disabled={busy || !m.code || !m.base_label}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
        </button>
      </div>
    </div>
  );
}

export default AdminSocialBetaModules;
