import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Clock, ShieldCheck } from "lucide-react";

type Step = 1 | 2 | 3 | 4;

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  not_started: { label: "Não iniciado", variant: "secondary" },
  pending_review: { label: "Em análise", variant: "secondary" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Rejeitado", variant: "destructive" },
  suspended: { label: "Suspenso", variant: "destructive" },
  frozen: { label: "Congelado", variant: "destructive" },
  blocked: { label: "Bloqueado", variant: "destructive" },
};

export default function MonetizationOnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("not_started");
  const [subaccount, setSubaccount] = useState<{ wallet_id: string | null; status: string; kyc_status: string } | null>(null);
  const [activating, setActivating] = useState(false);

  async function refreshSubaccount() {
    if (!user?.id) return;
    const { data } = await supabase.rpc("oculto_get_my_asaas_subaccount" as any);
    const row = Array.isArray(data) ? data[0] : data;
    if (row) setSubaccount({ wallet_id: row.wallet_id, status: row.status, kyc_status: row.kyc_status });
  }

  async function activatePayouts() {
    if (!user?.id) return;
    setActivating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-asaas-subaccount", { body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao ativar recebimentos");
      toast.success(data.already_exists ? "Recebimentos já ativos." : "Recebimentos ativados com sucesso!");
      await refreshSubaccount();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao ativar recebimentos");
    } finally {
      setActivating(false);
    }
  }

  useEffect(() => { refreshSubaccount(); /* eslint-disable-next-line */ }, [user?.id]);

  const [form, setForm] = useState({
    full_name: "",
    document_number: "",
    person_type: "PF" as "PF" | "PJ",
    birth_date: "",
    phone: "",
    email: "",
    pix_key_type: "cpf" as "cpf" | "cnpj" | "email" | "phone" | "random",
    pix_key: "",
    holder_name: "",
    holder_document: "",
    terms_accepted: false,
  });

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("creator_payout_profiles" as any)
        .select("*")
        .eq("creator_id", user.id)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setStatus(d.monetization_status || "pending_review");
        setForm((f) => ({
          ...f,
          full_name: d.full_name || "",
          document_number: d.document_number || "",
          person_type: d.person_type || "PF",
          birth_date: d.birth_date || "",
          phone: d.phone || "",
          email: d.email || user.email || "",
          pix_key_type: d.pix_key_type || "cpf",
          pix_key: d.pix_key || "",
          holder_name: d.holder_name || "",
          holder_document: d.holder_document || "",
          terms_accepted: !!d.terms_accepted_at,
        }));
      } else {
        setForm((f) => ({ ...f, email: user.email || "" }));
      }
    })();
  }, [user?.id, user?.email]);

  async function handleSubmit() {
    if (!user?.id) return;
    if (!form.terms_accepted) {
      toast.error("Você precisa aceitar os termos.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        creator_id: user.id,
        full_name: form.full_name,
        document_number: form.document_number,
        person_type: form.person_type,
        birth_date: form.birth_date || null,
        phone: form.phone,
        email: form.email,
        pix_key_type: form.pix_key_type,
        pix_key: form.pix_key,
        holder_name: form.holder_name || form.full_name,
        holder_document: form.holder_document || form.document_number,
        terms_accepted_at: new Date().toISOString(),
        terms_accepted_ip: null,
        terms_user_agent: navigator.userAgent,
        terms_version: "v1.0",
        monetization_status: "pending_review",
        kyc_status: "pending",
      };
      const { error } = await supabase
        .from("creator_payout_profiles" as any)
        .upsert(payload, { onConflict: "creator_id" });
      if (error) throw error;
      toast.success("Solicitação enviada! Aguarde aprovação.");
      setStatus("pending_review");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar");
    } finally {
      setLoading(false);
    }
  }

  const statusInfo = STATUS_LABEL[status] || STATUS_LABEL.not_started;

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Ativar Monetização</h1>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>

        {status === "approved" && (
          <Card className="p-4 border-green-500/30 bg-green-500/10 flex flex-col gap-3">
            <div className="flex gap-3 items-start">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Monetização aprovada</p>
                <p className="text-sm text-muted-foreground">Você já pode publicar conteúdos pagos e receber assinaturas.</p>
              </div>
            </div>
            {subaccount?.wallet_id ? (
              <div className="text-xs text-muted-foreground border-t border-green-500/20 pt-2">
                ✅ Recebimentos ativos. Status: <strong>{subaccount.status}</strong>.
              </div>
            ) : (
              <Button onClick={activatePayouts} disabled={activating} className="w-full">
                {activating ? "Ativando recebimentos..." : "Ativar recebimentos"}
              </Button>
            )}
          </Card>
        )}

        {status === "pending_review" && (
          <Card className="p-4 border-amber-500/30 bg-amber-500/10 flex gap-3 items-start">
            <Clock className="w-5 h-5 text-amber-500 mt-0.5" />
            <div>
              <p className="font-semibold">Em análise</p>
              <p className="text-sm text-muted-foreground">A equipe Oculto está revisando seus dados. Você será notificado.</p>
            </div>
          </Card>
        )}

        <div className="flex gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${step >= s ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        <Card className="p-5 space-y-4">
          {step === 1 && (
            <>
              <h2 className="font-semibold">1. Dados pessoais</h2>
              <div className="space-y-3">
                <div><Label>Nome completo / Razão social</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tipo</Label>
                    <select className="w-full h-10 rounded-md border bg-background px-3" value={form.person_type}
                      onChange={(e) => setForm({ ...form, person_type: e.target.value as any })}>
                      <option value="PF">Pessoa Física</option>
                      <option value="PJ">Pessoa Jurídica</option>
                    </select></div>
                  <div><Label>{form.person_type === "PF" ? "CPF" : "CNPJ"}</Label>
                    <Input value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} /></div>
                </div>
                {form.person_type === "PF" && (
                  <div><Label>Data de nascimento</Label>
                    <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Telefone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>E-mail</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-semibold">2. Chave PIX para recebimento</h2>
              <div className="space-y-3">
                <div><Label>Tipo de chave</Label>
                  <select className="w-full h-10 rounded-md border bg-background px-3" value={form.pix_key_type}
                    onChange={(e) => setForm({ ...form, pix_key_type: e.target.value as any })}>
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                    <option value="email">E-mail</option>
                    <option value="phone">Telefone</option>
                    <option value="random">Aleatória</option>
                  </select></div>
                <div><Label>Chave PIX</Label>
                  <Input value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} /></div>
                <div><Label>Titular da chave (deve ser o mesmo CPF/CNPJ)</Label>
                  <Input value={form.holder_name} placeholder={form.full_name} onChange={(e) => setForm({ ...form, holder_name: e.target.value })} /></div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-semibold">3. Verificação de identidade (KYC)</h2>
              <p className="text-sm text-muted-foreground">
                Após enviar, o time Oculto solicitará seus documentos via canal seguro caso necessário.
                Em breve você poderá anexar documento e selfie diretamente aqui.
              </p>
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Upload de documentos disponível em breve.
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="font-semibold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" /> 4. Termos de monetização
              </h2>
              <div className="text-sm text-muted-foreground space-y-2 max-h-48 overflow-y-auto rounded-md border p-3">
                <p>Ao ativar a monetização, você concorda que:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Os pagamentos são processados pelo gateway oficial da plataforma Oculto.</li>
                  <li>O split aplicado é: 6% imposto, 20% taxa de plataforma, 5% afiliado (quando houver).</li>
                  <li>Saques são feitos exclusivamente via PIX, valor mínimo R$ 50,00.</li>
                  <li>Conteúdos devem respeitar as diretrizes da plataforma e a legislação brasileira (+18).</li>
                  <li>Inadimplência ou violação congela o saldo até regularização.</li>
                </ul>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={form.terms_accepted}
                  onChange={(e) => setForm({ ...form, terms_accepted: e.target.checked })} className="mt-1" />
                <span>Li e aceito os termos de monetização da plataforma Oculto.</span>
              </label>
            </>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => (s - 1) as Step)}>
              Voltar
            </Button>
            {step < 4 ? (
              <Button onClick={() => setStep((s) => (s + 1) as Step)}>Avançar</Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading || !form.terms_accepted}>
                {loading ? "Enviando..." : "Enviar para análise"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
