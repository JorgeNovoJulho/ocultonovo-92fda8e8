import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Wrench, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { repairProfile } from "@/lib/profileRepair";

type Row = {
  id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  address_cep: string | null;
  address_city: string | null;
  location_lat: number | null;
  location_lng: number | null;
  is_seed: boolean;
};

type GroupKey = "Avatar" | "Banner" | "GPS" | "CEP";

const groupOk = (r: Row, g: GroupKey): boolean => {
  if (g === "Avatar") return !!r.avatar_url;
  if (g === "Banner") return !!r.cover_image_url;
  if (g === "GPS") return r.location_lat != null && r.location_lng != null;
  return !!(r.address_cep && r.address_city);
};

export default function ProfileDiagnosticsPage() {
  const isMaster = useIsMasterAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<GroupKey, boolean>>({
    Avatar: true,
    Banner: true,
    GPS: true,
    CEP: true,
  });
  const [hideSeeds, setHideSeeds] = useState(true);
  const [search, setSearch] = useState("");
  const [repairing, setRepairing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,user_id,username,avatar_url,cover_image_url,address_cep,address_city,location_lat,location_lng,is_seed",
        )
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      setRows((data as Row[]) || []);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar perfis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isMaster) fetchAll();
  }, [isMaster]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (hideSeeds && r.is_seed) return false;
      if (search && !(r.username || "").toLowerCase().includes(search.toLowerCase()) && !r.user_id.includes(search)) {
        return false;
      }
      // Inconsistente em ALGUM grupo selecionado
      const enabled = (Object.keys(filters) as GroupKey[]).filter((k) => filters[k]);
      if (enabled.length === 0) return false;
      return enabled.some((g) => !groupOk(r, g));
    });
  }, [rows, filters, hideSeeds, search]);

  const repairOne = async (userId: string): Promise<boolean> => {
    try {
      const result = await repairProfile(userId);
      return result.updated;
    } catch (e: any) {
      console.error("[repair]", userId, e?.message);
      return false;
    }
  };

  const repairAll = async () => {
    if (filtered.length === 0) return;
    setRepairing(true);
    setProgress({ done: 0, total: filtered.length });
    let updated = 0;
    for (let i = 0; i < filtered.length; i++) {
      const ok = await repairOne(filtered[i].user_id);
      if (ok) updated++;
      setProgress({ done: i + 1, total: filtered.length });
    }
    setRepairing(false);
    setProgress(null);
    toast.success(`Reparo concluído: ${updated}/${filtered.length} atualizados.`);
    await fetchAll();
  };

  if (!isMaster) {
    return (
      <div className="container mx-auto max-w-3xl py-8 px-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-3 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            <span>Acesso restrito ao Master Admin.</span>
          </CardContent>
        </Card>
        <div className="mt-4">
          <Button asChild variant="ghost">
            <Link to="/settings">← Configurações</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Relatório de Perfis Inconsistentes</h1>
          <p className="text-sm text-muted-foreground">
            Lista perfis com avatar, banner, GPS ou CEP ausentes e permite reparar em massa.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link to="/settings">← Configurações</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            {(Object.keys(filters) as GroupKey[]).map((g) => (
              <label key={g} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={filters[g]}
                  onCheckedChange={(v) => setFilters((f) => ({ ...f, [g]: !!v }))}
                />
                Sem {g}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm cursor-pointer ml-auto">
              <Checkbox checked={hideSeeds} onCheckedChange={(v) => setHideSeeds(!!v)} />
              Ocultar bots (is_seed)
            </label>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Buscar por username ou user_id…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button onClick={fetchAll} variant="outline" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {loading ? "Carregando…" : `${filtered.length} perfil(is) inconsistente(s)`}
          </CardTitle>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={repairing || filtered.length === 0}>
                {repairing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4 mr-1" />
                )}
                {repairing && progress
                  ? `Reparando ${progress.done}/${progress.total}…`
                  : `Repare todos (${filtered.length})`}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar reparo em massa</AlertDialogTitle>
                <AlertDialogDescription>
                  Vou chamar <code>repair-profile</code> para cada um dos {filtered.length} perfis listados,
                  preenchendo avatar/banner a partir do storage quando encontrados. Esta operação não pode
                  ser desfeita automaticamente. Deseja continuar?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={repairAll}>Reparar todos</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {loading ? "Buscando..." : "Nenhum perfil inconsistente nos filtros atuais."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {filtered.slice(0, 200).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 text-xs border rounded-md px-3 py-2 hover:bg-muted/40"
                >
                  <span className="font-mono text-muted-foreground truncate w-[80px]">
                    {r.user_id.slice(0, 8)}
                  </span>
                  <span className="font-medium truncate w-[140px]">@{r.username || "—"}</span>
                  <div className="flex gap-1.5 flex-1">
                    {(Object.keys(filters) as GroupKey[]).map((g) => {
                      const ok = groupOk(r, g);
                      return (
                        <Badge
                          key={g}
                          variant="outline"
                          className={`text-[10px] ${
                            ok
                              ? "border-emerald-500/30 text-emerald-400"
                              : "border-destructive/40 text-destructive"
                          }`}
                        >
                          {ok ? <CheckCircle2 className="h-3 w-3 mr-0.5" /> : <XCircle className="h-3 w-3 mr-0.5" />}
                          {g}
                        </Badge>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={async () => {
                      const ok = await repairOne(r.user_id);
                      toast[ok ? "success" : "info"](
                        ok ? `Reparado @${r.username || r.user_id.slice(0, 6)}` : "Sem arquivos no storage para reparar",
                      );
                      fetchAll();
                    }}
                  >
                    <Wrench className="h-3 w-3 mr-1" /> Reparar
                  </Button>
                </div>
              ))}
              {filtered.length > 200 && (
                <p className="text-[11px] text-muted-foreground text-center pt-2">
                  Exibindo 200 de {filtered.length}. Use os filtros para refinar.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
