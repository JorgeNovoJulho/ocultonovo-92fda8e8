/**
 * AppealPage — Contestação/Apelação para suspensões e retenções (cláusula 14).
 * Usa mock API (src/lib/mockLegalApi.ts).
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ArrowLeft, Scale, CheckCircle2, Loader2 } from 'lucide-react';
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
import { submitAppealMock } from '@/lib/mockLegalApi';

const CASE_TYPES = [
  { value: 'suspensao', label: 'Suspensão de conta' },
  { value: 'bloqueio', label: 'Bloqueio de funcionalidades' },
  { value: 'retencao', label: 'Retenção de valores / saque' },
  { value: 'remocao', label: 'Remoção de conteúdo' },
  { value: 'comissao', label: 'Cancelamento de comissão' },
] as const;

const appealSchema = z.object({
  caseType: z.enum(['suspensao', 'bloqueio', 'retencao', 'remocao', 'comissao'], {
    errorMap: () => ({ message: 'Selecione o tipo de decisão.' }),
  }),
  caseRef: z.string().trim().min(2, 'Informe o ID/referência do caso.').max(120),
  decisionDate: z.string().min(1, 'Informe a data da decisão.'),
  reason: z
    .string()
    .trim()
    .min(30, 'Descreva os motivos da contestação (mín. 30 caracteres).')
    .max(2500),
  evidence: z.string().trim().max(2000).optional().default(''),
});

export default function AppealPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    caseType: '' as '' | (typeof CASE_TYPES)[number]['value'],
    caseRef: '',
    decisionDate: '',
    reason: '',
    evidence: '',
  });

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files || []).slice(0, 8));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = appealSchema.safeParse(form);
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
      const res = await submitAppealMock({
        caseType: data.caseType,
        caseRef: data.caseRef,
        decisionDate: data.decisionDate,
        reason: data.reason,
        evidence: data.evidence ?? '',
        attachments: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      });
      setProtocol(res.protocol);
      toast.success('Contestação enviada. Protocolo: ' + res.protocol);
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
          <h1 className="text-2xl font-bold text-foreground mb-2">Contestação registrada</h1>
          <p className="text-muted-foreground mb-2">
            Sua contestação será analisada em até 10 dias úteis (cláusula 14).
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Protocolo: <span className="font-mono text-foreground">{protocol}</span>
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate('/legal/termos-de-uso#clausula-14')}>
              Ver cláusula 14
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
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Scale className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contestação / Apelação</h1>
            <p className="text-sm text-muted-foreground">
              Prazos e regras da{' '}
              <Link to="/legal/termos-de-uso#clausula-14" className="text-primary hover:underline">
                cláusula 14
              </Link>
              . Limite: 30 dias da decisão.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>Tipo de decisão *</Label>
            <Select value={form.caseType} onValueChange={(v) => update('caseType', v as typeof form.caseType)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {CASE_TYPES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.caseType && <p className="text-xs text-destructive mt-1">{errors.caseType}</p>}
          </div>

          <div>
            <Label htmlFor="caseRef">ID / referência do caso *</Label>
            <Input
              id="caseRef"
              placeholder="ID da conta, do saque, do conteúdo etc."
              value={form.caseRef}
              onChange={(e) => update('caseRef', e.target.value)}
              maxLength={120}
            />
            {errors.caseRef && <p className="text-xs text-destructive mt-1">{errors.caseRef}</p>}
          </div>

          <div>
            <Label htmlFor="decisionDate">Data da decisão *</Label>
            <Input
              id="decisionDate"
              type="date"
              value={form.decisionDate}
              onChange={(e) => update('decisionDate', e.target.value)}
            />
            {errors.decisionDate && (
              <p className="text-xs text-destructive mt-1">{errors.decisionDate}</p>
            )}
          </div>

          <div>
            <Label htmlFor="reason">Motivos da contestação *</Label>
            <Textarea
              id="reason"
              rows={5}
              placeholder="Explique objetivamente por que a decisão deve ser revista (mín. 30 caracteres)"
              value={form.reason}
              onChange={(e) => update('reason', e.target.value)}
              maxLength={2500}
            />
            {errors.reason && <p className="text-xs text-destructive mt-1">{errors.reason}</p>}
          </div>

          <div>
            <Label htmlFor="evidence">Evidências adicionais</Label>
            <Textarea
              id="evidence"
              rows={3}
              placeholder="Cole links, IDs de transações, autorizações etc. (opcional)"
              value={form.evidence}
              onChange={(e) => update('evidence', e.target.value)}
              maxLength={2000}
            />
          </div>

          <div>
            <Label htmlFor="attachments">Anexar evidências — até 8 arquivos</Label>
            <Input
              id="attachments"
              type="file"
              multiple
              accept="image/*,application/pdf,video/*"
              onChange={handleFiles}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {files.length} arquivo(s) anexado(s)
              </p>
            )}
          </div>

          <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
            Análise em até 10 dias úteis. Em caso de indeferimento é admitido um único pedido de
            reconsideração em até 15 dias com novas evidências.
          </div>

          <Button type="submit" disabled={submitting} className="w-full h-11">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...
              </>
            ) : (
              'Enviar contestação'
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
