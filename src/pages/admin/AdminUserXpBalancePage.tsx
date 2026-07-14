/**
 * AdminUserXpBalancePage
 * Gestão master do saldo de XP (aura_xp) dos usuários.
 * - Busca por username (ILIKE)
 * - Listagem com saldo atual
 * - Ajuste manual por usuário (delta + ou −, ou definir valor absoluto)
 * - Concessão em lote: selecionar vários usuários e somar/subtrair uma quantidade
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Sparkles, Plus, Minus, Save, Users } from "lucide-react";

interface UserRow {
  id: string;
  username: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  aura_xp: number | null;
  aura_level: number | null;
}

const auraLevelFromXp = (xp: number) => Math.max(1, Math.floor(Math.sqrt(Math.max(xp, 0) / 50)) + 1);

export default function AdminUserXpBalancePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: isMaster, isLoading: loadingMaster } = useIsMasterAdmin();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkAmount, setBulkAmount] = useState<string>("1000");
  const [bulkMode, setBulkMode] = useState<"add" | "subtract" | "set">("add");
  const [savingBulk, setSavingBulk] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Debounce simples
  useMemo(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-xp-users", debounced],
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, aura_xp, aura_level")
        .order("aura_xp", { ascending: false })
        .limit(50);
      if (debounced) {
        q = q.ilike("username", `%${debounced}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
    enabled: !!isMaster,
  });

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);

  const toggleAll = (checked: boolean) => {
    if (!users) return;
    const next: Record<string, boolean> = {};
    if (checked) users.forEach((u) => (next[u.id] = true));
    setSelected(next);
  };

  const applyBulk = async () => {
    if (selectedIds.length === 0) {
      toast({ title: "Selecione ao menos 1 usuário", variant: "destructive" });
      return;
    }
    const amount = parseInt(bulkAmount, 10);
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setSavingBulk(true);
    try {
      const targets = (users ?? []).filter((u) => selected[u.id]);
      const updates = targets.map((u) => {
        const cur = u.aura_xp ?? 0;
        let next = cur;
        if (bulkMode === "add") next = cur + amount;
        else if (bulkMode === "subtract") next = Math.max(0, cur - amount);
        else next = amount;
        return { id: u.id, aura_xp: next, aura_level: auraLevelFromXp(next) };
      });
      // updates paralelos
      await Promise.all(
        updates.map((u) =>
          supabase.from("profiles").update({ aura_xp: u.aura_xp, aura_level: u.aura_level }).eq("id", u.id)
        )
      );
      toast({
        title: `XP atualizado para ${updates.length} usuário(s)`,
        description:
          bulkMode === "add"
            ? `+${amount} XP em lote`
            : bulkMode === "subtract"
            ? `−${amount} XP em lote`
            : `Definido para ${amount} XP`,
      });
      setSelected({});
      qc.invalidateQueries({ queryKey: ["admin-xp-users"] });
    } catch (e: any) {
      toast({ title: "Erro ao aplicar em lote", description: e?.message, variant: "destructive" });
    } finally {
      setSavingBulk(false);
    }
  };

  const saveSingle = async (u: UserRow, mode: "add" | "subtract" | "set") => {
    const raw = drafts[u.id];
    const amount = parseInt(raw ?? "", 10);
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setSavingId(u.id);
    try {
      const cur = u.aura_xp ?? 0;
      let next = cur;
      if (mode === "add") next = cur + amount;
      else if (mode === "subtract") next = Math.max(0, cur - amount);
      else next = amount;
      const { error } = await supabase.from("profiles").update({ aura_xp: next, aura_level: auraLevelFromXp(next) }).eq("id", u.id);
      if (error) throw error;
      toast({ title: `@${u.username ?? "?"}: ${cur} → ${next} XP` });
      setDrafts((d) => ({ ...d, [u.id]: "" }));
      qc.invalidateQueries({ queryKey: ["admin-xp-users"] });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  if (loadingMaster) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isMaster) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Acesso restrito ao Master Admin.
      </div>
    );
  }

  const allChecked = (users?.length ?? 0) > 0 && users!.every((u) => selected[u.id]);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <header className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Saldo de XP — Usuários</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Visualize, ajuste individualmente ou conceda XP em lote para usuários selecionados.
          </p>
        </div>
      </header>

      {/* Busca */}
      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por @username..."
            className="pl-9"
          />
        </div>
      </Card>

      {/* Concessão em lote */}
      <Card className="p-4 space-y-3 border-primary/30">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" />
          Concessão de XP em lote
          <span className="ml-auto text-xs text-muted-foreground">
            {selectedIds.length} selecionado(s)
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-1">
            <Button
              variant={bulkMode === "add" ? "default" : "outline"}
              size="sm"
              onClick={() => setBulkMode("add")}
            >
              <Plus className="h-4 w-4 mr-1" /> Somar
            </Button>
            <Button
              variant={bulkMode === "subtract" ? "default" : "outline"}
              size="sm"
              onClick={() => setBulkMode("subtract")}
            >
              <Minus className="h-4 w-4 mr-1" /> Subtrair
            </Button>
            <Button
              variant={bulkMode === "set" ? "default" : "outline"}
              size="sm"
              onClick={() => setBulkMode("set")}
            >
              Definir
            </Button>
          </div>
          <Input
            type="number"
            min={0}
            value={bulkAmount}
            onChange={(e) => setBulkAmount(e.target.value)}
            placeholder="Quantidade de XP"
            className="sm:max-w-[200px]"
          />
          <Button
            onClick={applyBulk}
            disabled={savingBulk || selectedIds.length === 0}
            className="sm:ml-auto"
          >
            {savingBulk ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Aplicar a {selectedIds.length} usuário(s)
          </Button>
        </div>
      </Card>

      {/* Lista */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
          <Checkbox
            checked={allChecked}
            onCheckedChange={(c) => toggleAll(!!c)}
            aria-label="Selecionar todos"
          />
          <span className="flex-1">Usuário</span>
          <span className="w-24 text-right">XP atual</span>
          <span className="hidden sm:block w-[300px] text-right">Ajuste</span>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !users || users.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum usuário encontrado.
          </div>
        ) : (
          <ul className="divide-y">
            {users.map((u) => {
              const checked = !!selected[u.id];
              return (
                <li key={u.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => setSelected((s) => ({ ...s, [u.id]: !!c }))}
                      aria-label={`Selecionar ${u.username}`}
                    />
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-muted" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        @{u.username ?? "?"}
                      </div>
                      {u.display_name && (
                        <div className="text-xs text-muted-foreground truncate">
                          {u.display_name}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-full sm:w-24 sm:text-right text-sm font-mono">
                    {(u.aura_xp ?? 0).toLocaleString("pt-BR")} XP
                  </div>
                  <div className="flex items-center gap-1 sm:w-[300px] sm:justify-end">
                    <Input
                      type="number"
                      min={0}
                      placeholder="qtd"
                      value={drafts[u.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: e.target.value }))}
                      className="h-8 w-24"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingId === u.id}
                      onClick={() => saveSingle(u, "add")}
                      title="Somar"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingId === u.id}
                      onClick={() => saveSingle(u, "subtract")}
                      title="Subtrair"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingId === u.id}
                      onClick={() => saveSingle(u, "set")}
                      title="Definir valor"
                    >
                      {savingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "="}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
