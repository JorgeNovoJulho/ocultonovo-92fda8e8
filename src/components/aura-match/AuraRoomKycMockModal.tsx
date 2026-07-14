import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BadgeCheck, Camera, FileText, Loader2, ShieldCheck, Check } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Mock KYC modal — guia o usuário por 3 etapas (Selfie, Documento, Análise)
 * sem realmente enviar nada ao backend. Útil para desbloquear o gate
 * "kyc_required" no fluxo de Aura Rooms enquanto o KYC real é integrado.
 *
 * onCompleted: chamado após "análise concluída" (mock 100%).
 */
export function AuraRoomKycMockModal({
  open,
  onOpenChange,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCompleted?: () => void;
}) {
  type Step = 'intro' | 'selfie' | 'doc' | 'review' | 'done';

  // Persistência local do passo do mock — retoma exatamente onde parou ao reabrir
  const STORAGE_KEY = 'aura-room-kyc-mock:v1';
  const TTL_MS = 24 * 60 * 60 * 1000;
  const readPersisted = (): { step: Step; savedAt: number } | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const validSteps: Step[] = ['intro', 'selfie', 'doc', 'review', 'done'];
      if (!parsed || !validSteps.includes(parsed.step)) return null;
      if (Date.now() - (parsed.savedAt ?? 0) > TTL_MS) return null;
      return parsed;
    } catch { return null; }
  };

  const [step, setStep] = useState<Step>(() => readPersisted()?.step ?? 'intro');
  const [progress, setProgress] = useState(0);

  // Reset apenas quando NÃO há estado persistido; do contrário, retoma o passo
  useEffect(() => {
    if (!open) return;
    const persisted = readPersisted();
    if (persisted) {
      setStep(persisted.step);
      // Se reabriu em "review", reinicia a barra (volta a animar até 100%)
      if (persisted.step === 'review') setProgress(0);
    } else {
      setStep('intro');
      setProgress(0);
    }
  }, [open]);

  // Persiste a cada mudança de passo. 'done' limpa (concluído).
  useEffect(() => {
    try {
      if (step === 'done') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, savedAt: Date.now() }));
      }
    } catch {}
  }, [step]);

  // Avança automaticamente "review" -> "done" após barra carregar
  useEffect(() => {
    if (step !== 'review') return;
    setProgress(0);
    let p = 0;
    const id = window.setInterval(() => {
      p = Math.min(100, p + 7);
      setProgress(p);
      if (p >= 100) {
        window.clearInterval(id);
        setStep('done');
      }
    }, 90);
    return () => window.clearInterval(id);
  }, [step]);

  const finish = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    toast.success('Verificação enviada — você já pode tentar entrar na sala.');
    onCompleted?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border border-amber-400/20 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-200">
            <ShieldCheck className="h-4 w-4" /> Verificação KYC
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Confirme sua identidade para liberar salas restritas.
          </DialogDescription>
        </DialogHeader>

        {step === 'intro' && (
          <div className="space-y-3 text-sm">
            <p className="text-zinc-300">
              A verificação é rápida e protege a comunidade. Tudo é confidencial e usado apenas para validar que você é maior de idade.
            </p>
            <ul className="space-y-1.5 text-[12.5px] text-zinc-400">
              <li className="flex items-center gap-2"><Camera className="h-3.5 w-3.5 text-amber-300" /> Selfie em tempo real</li>
              <li className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-amber-300" /> Documento oficial com foto</li>
              <li className="flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5 text-amber-300" /> Análise instantânea</li>
            </ul>
            <Button onClick={() => setStep('selfie')} className="w-full bg-amber-500 text-black hover:bg-amber-400">
              Iniciar verificação
            </Button>
          </div>
        )}

        {step === 'selfie' && (
          <MockCaptureStep
            icon={<Camera className="h-10 w-10 text-amber-300" />}
            title="Capture sua selfie"
            hint="Centralize o rosto, ilumine bem o ambiente e olhe para a câmera."
            cta="Capturar selfie"
            onConfirm={() => setStep('doc')}
          />
        )}

        {step === 'doc' && (
          <MockCaptureStep
            icon={<FileText className="h-10 w-10 text-amber-300" />}
            title="Envie seu documento"
            hint="RG ou CNH (frente). Garanta que os dados estão legíveis."
            cta="Enviar documento"
            onConfirm={() => setStep('review')}
          />
        )}

        {step === 'review' && (
          <div className="space-y-3 text-center text-sm">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-300" />
            <p className="text-zinc-300">Analisando seus dados…</p>
            <Progress value={progress} className="h-1.5" />
            <p className="text-[11px] text-zinc-500">{progress}%</p>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-3 text-center text-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
              <Check className="h-6 w-6 text-emerald-300" />
            </div>
            <p className="font-medium text-emerald-200">Verificação concluída</p>
            <p className="text-[12px] text-zinc-400">
              Seu perfil foi marcado como verificado. Você já pode tentar entrar novamente na sala.
            </p>
            <Button onClick={finish} className="w-full bg-emerald-500 text-black hover:bg-emerald-400">
              Voltar para a sala
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MockCaptureStep({
  icon, title, hint, cta, onConfirm,
}: {
  icon: React.ReactNode; title: string; hint: string; cta: string; onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-amber-400/30 bg-amber-400/5 py-6">
        {icon}
        <p className="font-medium text-amber-100">{title}</p>
        <p className="px-4 text-center text-[12px] text-zinc-400">{hint}</p>
      </div>
      <Button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          window.setTimeout(() => { setBusy(false); onConfirm(); }, 700);
        }}
        className="w-full bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-70"
      >
        {busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Enviando…</> : cta}
      </Button>
    </div>
  );
}
