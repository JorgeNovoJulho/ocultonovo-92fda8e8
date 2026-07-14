/**
 * ReportPage — Denúncia de conteúdo/atividade suspeita.
 * Usa mock API (src/lib/mockLegalApi.ts) — substituir por edge function real depois.
 * Validação com zod conforme as boas práticas do projeto.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ArrowLeft, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';
import { submitReportMock } from '@/lib/mockLegalApi';

const REASONS = [
  { value: 'menor', label: 'Suspeita de envolvimento de menor (cláusula 6)' },
  { value: 'sem-consentimento', label: 'Conteúdo sem consentimento' },
  { value: 'violencia', label: 'Violência ou abuso' },
  { value: 'fraude', label: 'Fraude / golpe / spam' },
  { value: 'direitos-autorais', label: 'Uso indevido de conteúdo de terceiros' },
  { value: 'discurso-odio', label: 'Discurso de ódio' },
  { value: 'outro', label: 'Outro' },
];

const reportSchema = z.object({
  contentRef: z
    .string()
    .trim()
    .min(3, 'Informe link, ID do post/story/mensagem ou descrição.')
    .max(500),
  reportedUser: z
    .string()
    .trim()
    .min(2, 'Informe @username ou link do perfil.')
    .max(120),
  category: z.string().min(1, 'Selecione uma categoria.'),
  reason: z
    .string()
    .trim()
    .min(20, 'Descreva o motivo com pelo menos 20 caracteres.')
    .max(1500),
  occurredAt: z.string().min(1, 'Informe a data/horário aproximado.'),
  evidence: z.string().trim().max(2000).optional().default(''),
});

export default function ReportPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    contentRef: '',
    reportedUser: '',
    category: '',
    reason: '',
    occurredAt: '',
    evidence: '',
  });

  const update = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []).slice(0, 5);
    setFiles(list);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = reportSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        if (i.path[0]) errs[String(i.path[0])] = i.message;
      });
      setErrors(errs);
      toast.error('Verifique os campos destacados.');
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const data = parsed.data;
      const res = await submitReportMock({
        contentRef: data.contentRef,
        reportedUser: data.reportedUser,
        category: data.category,
        reason: data.reason,
        occurredAt: data.occurredAt,
        evidence: data.evidence ?? '',
        attachments: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      });
      setProtocol(res.protocol);
      toast.success('Denúncia enviada. Protocolo: ' + res.protocol);
    } catch {
      toast.error('Falha ao enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (protocol) {
    return (
      <div className="min-h-dvh bg-background">
        <Header />
        <main className="max-w-2xl mx-auto px-6 py-16 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500 mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Denúncia recebida</h1>
          <p className="text-muted-foreground mb-2">
            Sua denúncia foi registrada e será analisada em até 48 horas (prazo conforme
            cláusula 13 dos Termos de Uso).
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Protocolo: <span className="font-mono text-foreground">{protocol}</span>
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate('/legal/termos-de-uso#clausula-13')}>
              Ver cláusula 13
            </Button>
            <Button onClick={() => navigate('/')}>Voltar ao início</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Denunciar conteúdo ou atividade</h1>
            <p className="text-sm text-muted-foreground">
              Análise inicial em até 48h. Casos da{' '}
              <Link to="/legal/termos-de-uso#clausula-13" className="text-primary hover:underline">
                cláusula 13
              </Link>{' '}
              recebem prioridade.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="contentRef">Conteúdo denunciado *</Label>
            <Input
              id="contentRef"
              placeholder="Link, ID do post/story/mensagem ou descrição"
              value={form.contentRef}
              onChange={(e) => update('contentRef', e.target.value)}
              maxLength={500}
            />
            {errors.contentRef && <p className="text-xs text-destructive mt-1">{errors.contentRef}</p>}
          </div>

          <div>
            <Label htmlFor="reportedUser">Usuário denunciado *</Label>
            <Input
              id="reportedUser"
              placeholder="@username ou link do perfil"
              value={form.reportedUser}
              onChange={(e) => update('reportedUser', e.target.value)}
              maxLength={120}
            />
            {errors.reportedUser && (
              <p className="text-xs text-destructive mt-1">{errors.reportedUser}</p>
            )}
          </div>

          <div>
            <Label>Categoria *</Label>
            <Select value={form.category} onValueChange={(v) => update('category', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-xs text-destructive mt-1">{errors.category}</p>}
          </div>

          <div>
            <Label htmlFor="occurredAt">Data e horário aproximados *</Label>
            <Input
              id="occurredAt"
              type="datetime-local"
              value={form.occurredAt}
              onChange={(e) => update('occurredAt', e.target.value)}
            />
            {errors.occurredAt && (
              <p className="text-xs text-destructive mt-1">{errors.occurredAt}</p>
            )}
          </div>

          <div>
            <Label htmlFor="reason">Motivo da denúncia *</Label>
            <Textarea
              id="reason"
              rows={4}
              placeholder="Descreva o ocorrido em detalhes (mín. 20 caracteres)"
              value={form.reason}
              onChange={(e) => update('reason', e.target.value)}
              maxLength={1500}
            />
            {errors.reason && <p className="text-xs text-destructive mt-1">{errors.reason}</p>}
          </div>

          <div>
            <Label htmlFor="evidence">Evidências adicionais</Label>
            <Textarea
              id="evidence"
              rows={3}
              placeholder="Cole links, IDs ou descreva evidências (opcional)"
              value={form.evidence}
              onChange={(e) => update('evidence', e.target.value)}
              maxLength={2000}
            />
          </div>

          <div>
            <Label htmlFor="attachments">Anexos (capturas de tela) — até 5 arquivos</Label>
            <Input
              id="attachments"
              type="file"
              multiple
              accept="image/*,video/*,application/pdf"
              onChange={handleFiles}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {files.length} arquivo(s) anexado(s)
              </p>
            )}
          </div>

          <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
            Sua identidade é tratada com sigilo. Denúncias de má-fé sujeitam o autor às
            penalidades dos Termos.
          </div>

          <Button type="submit" disabled={submitting} className="w-full h-11">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...
              </>
            ) : (
              'Enviar denúncia'
            )}
          </Button>
        </form>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/30 bg-background/95 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
        <Link to="/">
          <Button variant="ghost" size="icon" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <Logo />
      </div>
    </header>
  );
}
