import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";
import { COUPON_TARGETS, useUpsertCoupon, type CreatorCoupon, type CouponAppliesTo } from "@/hooks/useCreatorCoupons";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creatorId: string;
  existing?: CreatorCoupon | null;
}

const Schema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Z0-9_-]+$/i, "Use letras, números, _ e -"),
  discount_percent: z.number().int().min(1).max(90),
  applies_to: z.array(z.string()).min(1, "Selecione ao menos uma categoria"),
  valid_from: z.string().min(1),
  valid_until: z.string().min(1),
  max_uses: z.number().int().min(1).max(100000),
  posted_to_feed: z.boolean().optional(),
});

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateCouponModal({ open, onOpenChange, creatorId, existing }: Props) {
  const upsert = useUpsertCoupon(creatorId);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);
  const [appliesTo, setAppliesTo] = useState<CouponAppliesTo[]>([]);
  const [validFrom, setValidFrom] = useState(toLocalInput(new Date().toISOString()));
  const [validUntil, setValidUntil] = useState("");
  const [maxUses, setMaxUses] = useState(50);
  const [postToFeed, setPostToFeed] = useState(false);

  useEffect(() => {
    if (open && existing) {
      setCode(existing.code);
      setPercent(existing.discount_percent);
      setAppliesTo(existing.applies_to);
      setValidFrom(toLocalInput(existing.valid_from));
      setValidUntil(toLocalInput(existing.valid_until));
      setMaxUses(existing.max_uses);
      setPostToFeed(existing.posted_to_feed);
    } else if (open) {
      setCode("");
      setPercent(10);
      setAppliesTo([]);
      setValidFrom(toLocalInput(new Date().toISOString()));
      setValidUntil("");
      setMaxUses(50);
      setPostToFeed(false);
    }
  }, [open, existing]);

  const submit = async () => {
    const parsed = Schema.safeParse({
      code, discount_percent: percent, applies_to: appliesTo,
      valid_from: validFrom, valid_until: validUntil, max_uses: maxUses, posted_to_feed: postToFeed,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "Dados inválidos");
      return;
    }
    if (new Date(validUntil) <= new Date(validFrom)) {
      toast.error("A data final deve ser depois da data inicial");
      return;
    }
    await upsert.mutateAsync({
      ...(existing?.id ? { id: existing.id } : {}),
      code: code.trim().toUpperCase(),
      discount_percent: percent,
      applies_to: appliesTo,
      valid_from: new Date(validFrom).toISOString(),
      valid_until: new Date(validUntil).toISOString(),
      max_uses: maxUses,
      posted_to_feed: postToFeed,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[92dvh] overflow-y-auto scrollbar-hide p-4 sm:p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Editar cupom" : "Criar cupom"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Código do cupom</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VERAO20" />
          </div>
          <div>
            <Label className="text-xs">Desconto: {percent}%</Label>
            <Input type="number" min={1} max={90} value={percent} onChange={(e) => setPercent(Number(e.target.value) || 0)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Início</Label>
              <Input type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Quantidade disponível</Label>
            <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value) || 1)} />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Onde se aplica</Label>
            <div className="grid grid-cols-2 gap-1.5 rounded-md border border-border p-2 bg-muted/20">
              {COUPON_TARGETS.map((t) => (
                <label key={t.value} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={appliesTo.includes(t.value)}
                    onCheckedChange={(v) =>
                      setAppliesTo((arr) => v ? [...arr, t.value] : arr.filter((x) => x !== t.value))
                    }
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={postToFeed} onCheckedChange={setPostToFeed} id="post-feed" />
            <Label htmlFor="post-feed" className="text-xs">Postar no feed principal</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-pink-500 hover:bg-pink-600 text-white" onClick={submit} disabled={upsert.isPending}>
            {existing ? "Salvar" : "Criar cupom"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
