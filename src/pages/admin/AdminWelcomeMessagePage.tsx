import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronsUpDown,
  Eye,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  UserRound,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type MetricAction = 'copy' | 'share' | 'view';

type Settings = {
  id: number;
  is_enabled: boolean;
  sender_email: string;
  template: string;
  base_invite_url: string;
  updated_at: string | null;
  badge_text: string;
  copy_button_label: string;
  share_button_label: string;
  disable_for_seed: boolean;
  disable_for_bots: boolean;
  disable_for_flags: string[];
};

type MetricSummary = Record<MetricAction, number>;

type TelemetryPoint = {
  date: string;
  label: string;
  copy: number;
  share: number;
  view: number;
};

type TelemetryState = {
  counts: MetricSummary;
  previousCounts: MetricSummary;
  series: TelemetryPoint[];
};

type TestUserOption = {
  id: string;
  user_id: string | null;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_seed?: boolean | null;
  created_at?: string | null;
};

type WelcomeSettingsRow = Partial<Settings>;
type MetricRow = { created_at: string };

const DEFAULT_TEMPLATE =
  '🎉 *PARABÉNS!*\n\n' +
  'Você foi selecionado(a) por @{{username}} para se tornar membro da nova Plataforma de Rede Social exclusiva, ' +
  'com a possibilidade de ser monetizado(a) por tudo que criar e postar dentro da plataforma OCULTO. ' +
  'Não perca essa oportunidade que ainda é fechada para poucos\n\n' +
  'Aproveite essa oportunidade! 🚀';

const EMPTY_SUMMARY: MetricSummary = { copy: 0, share: 0, view: 0 };
const METRIC_KEYS: MetricAction[] = ['copy', 'share', 'view'];
const PAGE_SIZE = 1000;

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(value: string) {
  return new Date(`${value}T00:00:00`);
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999`);
}

function formatAxisLabel(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}`;
}

function renderPreview(tpl: string, baseUrl: string) {
  const username = 'novo_usuario';
  const base = (baseUrl || '').replace(/\/$/, '');
  const link = `${base}/${username.toUpperCase()}`;
  return tpl.replace(/\{\{username\}\}/g, username).replace(/\{\{referral_link\}\}/g, link);
}

function validateTemplate(tpl: string): string[] {
  const warnings: string[] = [];
  if (!/\{\{\s*username\s*\}\}/.test(tpl)) {
    warnings.push('Variável {{username}} ausente — o nome do usuário não será inserido.');
  }
  if (!/\{\{\s*referral_link\s*\}\}/.test(tpl)) {
    warnings.push('Variável {{referral_link}} ausente — o link de divulgação não aparecerá.');
  }
  const stray = tpl.match(/\{[^{}]+\}(?!\})|\{\{[^}]*\}(?!\})/g);
  if (stray && stray.some((s) => !/^\{\{\s*(username|referral_link)\s*\}\}$/.test(s))) {
    warnings.push('Há placeholders mal formatados (use exatamente {{username}} e {{referral_link}}).');
  }
  return warnings;
}

function buildDailySeries(
  rowsByAction: Record<MetricAction, Array<{ created_at: string }>>,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const map = new Map<string, TelemetryPoint>();
  const cursor = new Date(rangeStart);

  while (cursor <= rangeEnd) {
    const date = toDateInput(cursor);
    map.set(date, {
      date,
      label: formatAxisLabel(date),
      copy: 0,
      share: 0,
      view: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  METRIC_KEYS.forEach((action) => {
    rowsByAction[action].forEach((row) => {
      const day = row.created_at.slice(0, 10);
      const point = map.get(day);
      if (point) {
        point[action] += 1;
      }
    });
  });

  return Array.from(map.values());
}

function getDeltaText(current: number, previous: number) {
  if (previous === 0 && current === 0) return 'Sem atividade no período';
  if (previous === 0) return 'Acima do período anterior';
  const diff = current - previous;
  if (diff === 0) return 'Mesmo volume do período anterior';
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  return `${diff > 0 ? '+' : '-'}${pct}% vs. período anterior`;
}

export default function AdminWelcomeMessagePage() {
  const today = toDateInput(new Date());
  const thirtyDaysAgo = toDateInput(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

  const [data, setData] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [testUsers, setTestUsers] = useState<TestUserOption[]>([]);
  const [selectedTestUser, setSelectedTestUser] = useState<TestUserOption | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metrics, setMetrics] = useState<TelemetryState>({
    counts: { ...EMPTY_SUMMARY },
    previousCounts: { ...EMPTY_SUMMARY },
    series: [],
  });

  async function load() {
    setLoading(true);
    const { data: row, error } = await supabase
      .from('oculto_welcome_message_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (row) {
      const r = row as WelcomeSettingsRow;
      setData({
        id: r.id ?? 1,
        is_enabled: r.is_enabled ?? true,
        sender_email: r.sender_email ?? '',
        template: r.template ?? DEFAULT_TEMPLATE,
        base_invite_url: r.base_invite_url ?? 'https://www.ocultoswing.com.br/creator-invite',
        updated_at: r.updated_at ?? null,
        badge_text: r.badge_text ?? 'Boas-vindas OCULTO',
        copy_button_label: r.copy_button_label ?? 'Copiar link de divulgação',
        share_button_label: r.share_button_label ?? 'Compartilhar',
        disable_for_seed: r.disable_for_seed ?? true,
        disable_for_bots: r.disable_for_bots ?? true,
        disable_for_flags: Array.isArray(r.disable_for_flags) ? r.disable_for_flags : [],
      });
    }

    setLoading(false);
  }

  async function loadTestUsers() {
    setUsersLoading(true);
    const { data: rows, error } = await supabase
      .from('profiles')
      .select('id, user_id, name, username, avatar_url, is_seed, created_at')
      .not('username', 'is', null)
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(200);

    setUsersLoading(false);

    if (error) {
      toast.error(`Erro ao carregar usuários: ${error.message}`);
      return;
    }

    const next = ((rows ?? []) as TestUserOption[]).filter((item) => !!item.username);
    setTestUsers(next);

    if (selectedTestUser?.username) {
      const updatedSelected = next.find((item) => item.username === selectedTestUser.username) ?? null;
      setSelectedTestUser(updatedSelected);
    }
  }

  async function fetchMetricCount(action: MetricAction, fromIso: string, toIso: string) {
    const { count, error } = await supabase
      .from('oculto_welcome_message_metrics')
      .select('id', { count: 'exact', head: true })
      .eq('action', action)
      .gte('created_at', fromIso)
      .lte('created_at', toIso);

    if (error) throw error;
    return count ?? 0;
  }

  async function fetchMetricRows(action: MetricAction, fromIso: string, toIso: string) {
    const rows: Array<{ created_at: string }> = [];
    let from = 0;

    while (true) {
      const { data: page, error } = await supabase
        .from('oculto_welcome_message_metrics')
        .select('created_at')
        .eq('action', action)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const batch = ((page ?? []) as MetricRow[]);
      rows.push(...batch);

      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return rows;
  }

  async function loadMetrics(rangeFrom = dateFrom, rangeTo = dateTo) {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) {
      toast.error('Defina um intervalo de datas válido.');
      return;
    }

    setMetricsLoading(true);

    try {
      const currentStart = startOfDay(rangeFrom);
      const currentEnd = endOfDay(rangeTo);
      const windowMs = currentEnd.getTime() - currentStart.getTime() + 1;
      const previousEnd = new Date(currentStart.getTime() - 1);
      const previousStart = new Date(previousEnd.getTime() - windowMs + 1);

      const currentFromIso = currentStart.toISOString();
      const currentToIso = currentEnd.toISOString();
      const previousFromIso = previousStart.toISOString();
      const previousToIso = previousEnd.toISOString();

      const [copyCount, shareCount, viewCount, previousCopy, previousShare, previousView, copyRows, shareRows, viewRows] =
        await Promise.all([
          fetchMetricCount('copy', currentFromIso, currentToIso),
          fetchMetricCount('share', currentFromIso, currentToIso),
          fetchMetricCount('view', currentFromIso, currentToIso),
          fetchMetricCount('copy', previousFromIso, previousToIso),
          fetchMetricCount('share', previousFromIso, previousToIso),
          fetchMetricCount('view', previousFromIso, previousToIso),
          fetchMetricRows('copy', currentFromIso, currentToIso),
          fetchMetricRows('share', currentFromIso, currentToIso),
          fetchMetricRows('view', currentFromIso, currentToIso),
        ]);

      setMetrics({
        counts: { copy: copyCount, share: shareCount, view: viewCount },
        previousCounts: { copy: previousCopy, share: previousShare, view: previousView },
        series: buildDailySeries(
          { copy: copyRows, share: shareRows, view: viewRows },
          currentStart,
          currentEnd,
        ),
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar telemetria.');
    } finally {
      setMetricsLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadTestUsers();
    loadMetrics(thirtyDaysAgo, today);

    const unsubSettings = subscribeTable('oculto_welcome_message_settings', () => load());
    const unsubMetrics = subscribeTable('oculto_welcome_message_metrics', () => loadMetrics(), { events: ['INSERT'] });

    return () => {
      unsubSettings();
      unsubMetrics();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const warnings = useMemo(() => (data ? validateTemplate(data.template) : []), [data]);
  const preview = useMemo(
    () => (data ? renderPreview(data.template, data.base_invite_url) : ''),
    [data],
  );
  const selectedPreview = useMemo(() => {
    if (!data || !selectedTestUser?.username) return '';

    const username = selectedTestUser.username.trim().replace(/^@/, '');
    const base = (data.base_invite_url || '').replace(/\/$/, '');
    const referralLink = `${base}/${username.toUpperCase()}`;

    return data.template
      .replace(/\{\{username\}\}/g, username)
      .replace(/\{\{referral_link\}\}/g, referralLink);
  }, [data, selectedTestUser]);
  const chartHasData = useMemo(
    () => metrics.series.some((point) => point.copy || point.share || point.view),
    [metrics.series],
  );

  async function save() {
    if (!data) return;

    if (warnings.length > 0) {
      const ok = window.confirm(
        'O template contém avisos:\n\n• ' + warnings.join('\n• ') + '\n\nSalvar mesmo assim?'
      );
      if (!ok) return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('oculto_welcome_message_settings')
      .update({
        is_enabled: data.is_enabled,
        sender_email: data.sender_email,
        template: data.template,
        base_invite_url: data.base_invite_url,
        badge_text: data.badge_text,
        copy_button_label: data.copy_button_label,
        share_button_label: data.share_button_label,
        disable_for_seed: data.disable_for_seed,
        disable_for_bots: data.disable_for_bots,
        disable_for_flags: data.disable_for_flags,
      })
      .eq('id', 1);

    setSaving(false);

    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
      return;
    }

    toast.success('Mensagem de boas-vindas atualizada — efeito imediato.');
  }

  function resetDefault() {
    if (!data) return;
    setData({ ...data, template: DEFAULT_TEMPLATE });
  }

  function openSendConfirm() {
    const username = selectedTestUser?.username?.trim().replace(/^@/, '');
    if (!username) {
      toast.error('Selecione um usuário de teste na lista.');
      return;
    }

    setConfirmSendOpen(true);
  }

  async function sendTest() {
    const username = selectedTestUser?.username?.trim().replace(/^@/, '');
    if (!username) {
      toast.error('Selecione um usuário de teste na lista.');
      return;
    }

    const toastId = `welcome-send-${username}`;
    toast.loading(`Enviando mensagem para @${username}…`, { id: toastId });
    setSendingTest(true);
    const { data, error } = await supabase.rpc('admin_send_welcome_to_username', { p_username: username });
    setSendingTest(false);

    if (error) {
      const message = error.message || 'Falha ao executar o envio.';
      let humanized = `Falha ao enviar: ${message}`;
      if (message.includes('forbidden')) humanized = 'Falha ao enviar: acesso negado (apenas admin master).';
      else if (message.includes('welcome_not_sent')) humanized = 'Mensagem não inserida: verifique se o template está ativo e o remetente master existe.';
      else if (message.includes('não encontrado')) humanized = message;
      toast.error(humanized, { id: toastId });
      return;
    }

    if (!data) {
      toast.error('RPC retornou vazio — mensagem não foi inserida no chat.', { id: toastId });
      return;
    }

    setConfirmSendOpen(false);
    toast.success(`Mensagem enviada para @${username}.`, {
      id: toastId,
      description: `Inserida no chat (id: ${String(data).slice(0, 8)}…). Abra a conversa para validar.`,
    });
  }

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando configurações…
      </div>
    );
  }

  const metricCards: Array<{ key: MetricAction; title: string; helper: string }> = [
    { key: 'copy', title: 'Copiou link', helper: 'Cliques no botão de copiar' },
    { key: 'share', title: 'Compartilhou', helper: 'Ações nativas de compartilhamento' },
    { key: 'view', title: 'Visualizou', helper: 'Visualização única por usuário/mensagem' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold">Mensagem de Boas-Vindas</h1>
        <p className="text-sm text-muted-foreground">
          Enviada automaticamente no chat para todo novo usuário, com edição em tempo real.
        </p>
      </header>

      <Card className="space-y-4 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4" /> Telemetria de divulgação
            </div>
            <p className="text-xs text-muted-foreground">
              Filtre um intervalo e compare com o período anterior de mesmo tamanho.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="welcome-date-from">De</Label>
              <Input
                id="welcome-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="welcome-date-to">Até</Label>
              <Input
                id="welcome-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <Button variant="outline" onClick={() => loadMetrics()} disabled={metricsLoading || dateFrom > dateTo}>
              {metricsLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Atualizar período
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {metricCards.map((card) => {
            const current = metrics.counts[card.key];
            const previous = metrics.previousCounts[card.key];
            return (
              <div key={card.key} className="rounded-xl border bg-muted/20 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.title}</div>
                <div className="mt-2 text-3xl font-bold text-foreground">{current}</div>
                <div className="mt-1 text-xs text-muted-foreground">{card.helper}</div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="text-muted-foreground">Período anterior equivalente: {previous}</div>
                  <div className={cn('font-medium', current >= previous ? 'text-primary' : 'text-foreground')}>
                    {getDeltaText(current, previous)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border bg-background p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Desempenho por dia</div>
              <p className="text-xs text-muted-foreground">
                Comparativo diário de copiar, compartilhar e visualizar dentro do intervalo selecionado.
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            {metricsLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando gráfico…
              </div>
            ) : chartHasData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="copy" name="Copiar" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="share" name="Compartilhar" stroke="hsl(var(--ring))" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="view" name="Visualizar" stroke="hsl(var(--foreground))" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Nenhuma interação registrada no período selecionado.
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-base">Envio automático ativo</Label>
            <p className="text-xs text-muted-foreground">
              Quando desativado, novos usuários não recebem a mensagem.
            </p>
          </div>
          <Switch checked={data.is_enabled} onCheckedChange={(value) => setData({ ...data, is_enabled: value })} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>E-mail remetente</Label>
            <Input
              value={data.sender_email}
              onChange={(e) => setData({ ...data, sender_email: e.target.value })}
              placeholder="ocultomaster@ocultoswing.com.br"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Deve ser um usuário existente na plataforma.</p>
          </div>

          <div>
            <Label>Base do link de indicação</Label>
            <Input
              value={data.base_invite_url}
              onChange={(e) => setData({ ...data, base_invite_url: e.target.value })}
              placeholder="https://www.ocultoswing.com.br/creator-invite/"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              O username é anexado ao final ({'{{referral_link}}'}).
            </p>
          </div>
        </div>

        <div>
          <Label>Template da mensagem</Label>
          <Textarea
            rows={14}
            value={data.template}
            onChange={(e) => setData({ ...data, template: e.target.value })}
            className="font-mono text-sm"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Variáveis: <code className="rounded bg-muted px-1">{'{{username}}'}</code> e{' '}
            <code className="rounded bg-muted px-1">{'{{referral_link}}'}</code>. Negrito com{' '}
            <code>*texto*</code>.
          </p>
          {warnings.length > 0 && (
            <div className="mt-2 space-y-1 rounded-lg border border-border bg-muted/40 p-2 text-xs text-foreground">
              <div className="flex items-center gap-1 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5 text-primary" /> Avisos do template
              </div>
              {warnings.map((warning, index) => (
                <div key={index}>• {warning}</div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 border-t pt-2 md:grid-cols-3">
          <div>
            <Label>Texto do badge</Label>
            <Input
              value={data.badge_text}
              onChange={(e) => setData({ ...data, badge_text: e.target.value })}
              maxLength={40}
            />
          </div>
          <div>
            <Label>Rótulo botão “Copiar”</Label>
            <Input
              value={data.copy_button_label}
              onChange={(e) => setData({ ...data, copy_button_label: e.target.value })}
              maxLength={40}
            />
          </div>
          <div>
            <Label>Rótulo botão “Compartilhar”</Label>
            <Input
              value={data.share_button_label}
              onChange={(e) => setData({ ...data, share_button_label: e.target.value })}
              maxLength={40}
            />
          </div>
        </div>

        <div className="space-y-3 border-t pt-2">
          <Label className="text-base">Não enviar para…</Label>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Contas seed/servidor (is_seed)</Label>
              <p className="text-[11px] text-muted-foreground">Recomendado manter desativado para esses perfis.</p>
            </div>
            <Switch
              checked={data.disable_for_seed}
              onCheckedChange={(value) => setData({ ...data, disable_for_seed: value })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Bots (is_bot)</Label>
              <p className="text-[11px] text-muted-foreground">Não envia para contas marcadas como bot.</p>
            </div>
            <Switch
              checked={data.disable_for_bots}
              onCheckedChange={(value) => setData({ ...data, disable_for_bots: value })}
            />
          </div>

          <div>
            <Label>Flags adicionais em profiles (separadas por vírgula)</Label>
            <Input
              value={data.disable_for_flags.join(', ')}
              onChange={(e) =>
                setData({
                  ...data,
                  disable_for_flags: e.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              placeholder="is_test, is_internal"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Se a coluna existir em <code>profiles</code> e estiver <code>true</code>, o envio é pulado.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar (efeito imediato)
          </Button>
          <Button variant="outline" onClick={resetDefault}>
            <RotateCcw className="mr-2 h-4 w-4" /> Restaurar padrão
          </Button>
          <Button variant="ghost" onClick={load}>Recarregar</Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Send className="h-4 w-4" /> Enviar agora para um usuário (teste)
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Popover open={userPickerOpen} onOpenChange={setUserPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={userPickerOpen} className="w-[320px] justify-between">
                {selectedTestUser?.username ? `@${selectedTestUser.username}` : 'Selecionar usuário de teste'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar por @username ou nome..." />
                <CommandList>
                  <CommandEmpty>
                    {usersLoading ? 'Carregando usuários…' : 'Nenhum usuário encontrado.'}
                  </CommandEmpty>
                  <CommandGroup heading="Usuários disponíveis">
                    {testUsers.map((user) => (
                      <CommandItem
                        key={user.id}
                        value={`${user.username ?? ''} ${user.name ?? ''}`}
                        onSelect={() => {
                          setSelectedTestUser(user);
                          setUserPickerOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedTestUser?.username === user.username ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">@{user.username}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {user.name || 'Sem nome exibido'}{user.is_seed ? ' • seed' : ''}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Button variant="outline" onClick={loadTestUsers} disabled={usersLoading}>
            {usersLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar lista
          </Button>

          <Button onClick={openSendConfirm} disabled={sendingTest || !selectedTestUser?.username}>
            {sendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar mensagem agora
          </Button>
        </div>

        {selectedTestUser && (
          <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3 text-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <UserRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="font-medium">@{selectedTestUser.username}</div>
              <div className="text-xs text-muted-foreground">{selectedTestUser.name || 'Sem nome exibido'}</div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          A mensagem aparece imediatamente no chat do usuário selecionado e serve para validar layout, badge e botão de copiar.
        </p>
      </Card>

      <Card className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="h-4 w-4" /> Pré-visualização (com dados de exemplo)
        </div>
        <div className="whitespace-pre-wrap rounded-xl border bg-muted/30 p-3 text-sm leading-relaxed">
          {preview}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            ✨ {data.badge_text}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
            {data.copy_button_label}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
            {data.share_button_label}
          </span>
        </div>
      </Card>

      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio da mensagem de boas-vindas?</AlertDialogTitle>
            <AlertDialogDescription>
              Revise abaixo o conteúdo final que será enviado para{' '}
              <strong>@{selectedTestUser?.username}</strong>, com as variáveis já preenchidas.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Destinatário</span>
              <span className="font-medium text-foreground">
                @{selectedTestUser?.username} {selectedTestUser?.name ? `· ${selectedTestUser.name}` : ''}
              </span>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Mensagem final</div>
              <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background p-3 text-sm leading-relaxed">
                {selectedPreview}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                ✨ {data.badge_text}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                {data.copy_button_label}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
                {data.share_button_label}
              </span>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingTest}>Cancelar</AlertDialogCancel>
            <Button onClick={sendTest} disabled={sendingTest || !selectedTestUser?.username}>
              {sendingTest ? 'Enviando…' : 'Confirmar e enviar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}