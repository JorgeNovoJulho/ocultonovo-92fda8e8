import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Copy, FileUser, Search, Eye, EyeOff, Pencil, X, Save, Loader2, MapPin, Plus, Minus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { reverseGeocode, reverseGeocodeAddress, type ReverseCity, type ReverseAddress } from "@/lib/cityGeocode";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface UserSignupDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
}

type FieldType = "text" | "textarea" | "boolean" | "number" | "tags" | "date";
type Field = {
  key: string;
  label: string;
  sensitive?: boolean;
  type?: FieldType;
  readOnly?: boolean;
};
type Section = { title: string; fields: Field[]; sensitive?: boolean };

/** Fields shown in the modal, grouped by section. */
const SECTIONS: Section[] = [
  {
    title: "Identidade",
    fields: [
      { key: "name", label: "Nome de exibição" },
      { key: "username", label: "Username" },
      { key: "email", label: "E-mail", sensitive: true },
      { key: "phone_number", label: "Telefone", sensitive: true },
      { key: "birth_date", label: "Data de nascimento", type: "date" },
      { key: "gender", label: "Gênero" },
      { key: "gender_other", label: "Gênero (outro)" },
      { key: "profile_type", label: "Tipo de perfil" },
    ],
  },
  {
    title: "Casal",
    fields: [
      { key: "partner1_name", label: "Parceiro 1" },
      { key: "partner2_name", label: "Parceiro 2" },
      { key: "partner1_birth_date", label: "Nasc. parceiro 1", type: "date" },
      { key: "partner2_birth_date", label: "Nasc. parceiro 2", type: "date" },
      { key: "is_verified_couple", label: "Casal verificado", type: "boolean" },
    ],
  },
  {
    title: "Bio & Interesses",
    fields: [
      { key: "bio", label: "Bio", type: "textarea" },
      { key: "tags_social", label: "Tags sociais", type: "tags" },
      { key: "tags_adult", label: "Tags adultas", type: "tags" },
      { key: "connection_mode", label: "Modo conexão" },
    ],
  },
  {
    title: "Localização & Privacidade",
    fields: [
      { key: "location_lat", label: "Latitude", sensitive: true, type: "number" },
      { key: "location_lng", label: "Longitude", sensitive: true, type: "number" },
      { key: "hide_location", label: "Ocultar localização", type: "boolean" },
      { key: "hide_age", label: "Ocultar idade", type: "boolean" },
      { key: "is_private", label: "Perfil privado", type: "boolean" },
      { key: "is_invisible", label: "Modo invisível", type: "boolean" },
      { key: "show_on_radar", label: "Mostrar no Radar", type: "boolean" },
      { key: "show_online_status", label: "Mostrar status online", type: "boolean" },
    ],
  },
  {
    title: "Plano & Status",
    fields: [
      { key: "plan_type", label: "Plano" },
      { key: "is_vip", label: "É VIP", type: "boolean" },
      { key: "vip_tier", label: "Tier VIP" },
      { key: "is_creator", label: "É criador", type: "boolean" },
      { key: "is_verified", label: "Verificado", type: "boolean" },
      { key: "account_status", label: "Status da conta" },
      { key: "payment_status", label: "Status pagamento" },
    ],
  },
  {
    title: "Pagamento (PIX)",
    sensitive: true,
    fields: [
      { key: "pix_key_type", label: "Tipo chave PIX", sensitive: true },
      { key: "pix_key", label: "Chave PIX", sensitive: true },
      { key: "stripe_customer_id", label: "Cliente Stripe", sensitive: true },
    ],
  },
  {
    title: "Sistema",
    fields: [
      { key: "id", label: "ID do perfil", readOnly: true },
      { key: "user_id", label: "ID de auth", readOnly: true },
      { key: "created_at", label: "Cadastrado em", readOnly: true },
      { key: "founder_terms_accepted_at", label: "Termos aceitos em", readOnly: true },
      { key: "is_pioneiro", label: "Pioneiro", type: "boolean" },
      { key: "is_seed", label: "Seed (bot)", type: "boolean" },
      { key: "is_test_account", label: "Conta de teste", type: "boolean" },
    ],
  },
];

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.join(", ");
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  // Try ISO date formatting
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString("pt-BR");
    }
  }
  return String(v);
}

/** Render an inline editable input for the given field type. */
function renderFieldInput(
  field: Field,
  value: unknown,
  onChange: (v: unknown) => void,
) {
  const type = field.type ?? "text";

  if (type === "boolean") {
    const checked = value === true || value === "true";
    return (
      <div className="flex items-center gap-2 pt-1">
        <Switch checked={checked} onCheckedChange={(v) => onChange(v)} />
        <span className="text-xs text-muted-foreground">
          {checked ? "Sim" : "Não"}
        </span>
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <Textarea
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[80px] text-sm mt-1"
      />
    );
  }

  if (type === "tags") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <Input
        value={arr.join(", ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        placeholder="separe por vírgula"
        className="h-8 text-sm mt-1"
      />
    );
  }

  if (type === "number") {
    return (
      <Input
        type="number"
        step="any"
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
        className="h-8 text-sm mt-1"
      />
    );
  }

  if (type === "date") {
    // Keep YYYY-MM-DD only; profiles dates are stored as date or timestamp.
    const str = typeof value === "string" ? value.slice(0, 10) : "";
    return (
      <Input
        type="date"
        value={str}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 text-sm mt-1"
      />
    );
  }

  // Default: text
  return (
    <Input
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-sm mt-1"
    />
  );
}

/**
 * Linha derivada que resolve a cidade aproximada a partir de lat/lng
 * via reverse geocoding (Nominatim / OSM) com cache de 30 dias.
 */
function LatLngCityRow({ lat, lng }: { lat: unknown; lng: unknown }) {
  const latNum = typeof lat === "number" ? lat : lat ? Number(lat) : null;
  const lngNum = typeof lng === "number" ? lng : lng ? Number(lng) : null;
  const valid = latNum != null && lngNum != null && !isNaN(latNum) && !isNaN(lngNum);
  const [city, setCity] = useState<ReverseCity | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    setStatus("loading");
    reverseGeocode(latNum!, lngNum!)
      .then((res) => {
        if (cancelled) return;
        setCity(res);
        setStatus(res ? "done" : "error");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => { cancelled = true; };
  }, [valid, latNum, lngNum]);

  if (!valid) return null;
  const mapsUrl = `https://www.google.com/maps?q=${latNum},${lngNum}`;
  return (
    <div className="col-span-1 sm:col-span-2 flex flex-col min-w-0 mt-1 pt-2 border-t border-border/40">
      <dt className="text-[11px] text-muted-foreground flex items-center gap-1">
        <MapPin className="h-3 w-3 text-primary" />
        Cidade (aprox. via coordenadas)
      </dt>
      <dd className="break-words font-medium flex items-center gap-2 flex-wrap">
        {status === "loading" && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> resolvendo…
          </span>
        )}
        {status === "done" && city && <span>{city.display}</span>}
        {status === "error" && (
          <span className="text-xs text-muted-foreground">Não foi possível resolver</span>
        )}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-primary hover:underline"
        >
          abrir no mapa ↗
        </a>
      </dd>
      <MiniMapPreview lat={latNum!} lng={lngNum!} />
    </div>
  );
}

/**
 * Mini-mapa Leaflet (OSM) com controles próprios de zoom (+ / -).
 * Carrega o CSS do Leaflet sob demanda e usa um marcador SVG inline para
 * evitar dependência dos PNG default (que costumam quebrar no bundle).
 */
function MiniMapPreview({ lat, lng }: { lat: number; lng: number }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [mapApi, setMapApi] = useState<any>(null);
  const [zoom, setZoom] = useState(13);
  const [addr, setAddr] = useState<ReverseAddress | null>(null);
  const [addrLoading, setAddrLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAddrLoading(true);
    setAddr(null);
    reverseGeocodeAddress(lat, lng)
      .then((r) => { if (!cancelled) setAddr(r); })
      .finally(() => { if (!cancelled) setAddrLoading(false); });
    return () => { cancelled = true; };
  }, [lat, lng]);

  // Garante que o CSS do Leaflet esteja carregado (lazy, idempotente)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const ID = "leaflet-css";
    if (!document.getElementById(ID)) {
      const link = document.createElement("link");
      link.id = ID;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }
  }, []);

  // Inicializa o mapa quando o container existir
  useEffect(() => {
    if (!el) return;
    let cancelled = false;
    let map: any = null;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !el) return;
        map = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: false })
          .setView([lat, lng], zoom);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);
        const icon = L.divIcon({
          html: `<div style="width:14px;height:14px;border-radius:9999px;background:hsl(var(--primary));box-shadow:0 0 0 4px hsl(var(--primary)/.25);border:2px solid white"></div>`,
          className: "",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([lat, lng], { icon }).addTo(map);
        setMapApi(map);
      } catch (e) {
        console.warn("[MiniMap] failed:", e);
      }
    })();
    return () => {
      cancelled = true;
      try { map?.remove(); } catch {}
    };
    // re-init somente quando coordenadas mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, lat, lng]);

  // Sincroniza nível de zoom controlado externamente
  useEffect(() => {
    if (!mapApi) return;
    try { mapApi.setZoom(zoom); } catch {}
  }, [mapApi, zoom]);

  const zoomIn = () => setZoom((z) => Math.min(19, z + 1));
  const zoomOut = () => setZoom((z) => Math.max(3, z - 1));

  return (
    <div className="relative mt-2 w-full h-44 sm:h-56 rounded-md overflow-hidden border border-border/50 bg-muted/30">
      <div ref={setEl} className="absolute inset-0" />

      {/* Endereço aproximado (rua/bairro) com tooltip de endereço completo */}
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute top-2 left-2 z-[400] max-w-[70%] cursor-help">
              <div className="flex items-center gap-1 rounded-md bg-background/85 backdrop-blur px-2 py-1 text-[11px] text-foreground shadow-sm border border-border/50">
                <MapPin className="h-3 w-3 shrink-0 text-primary" />
                <span className="truncate">
                  {addrLoading
                    ? "resolvendo endereço…"
                    : addr
                      ? [addr.road, addr.suburb].filter(Boolean).join(" · ") || addr.city || addr.display
                      : "endereço indisponível"}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-[280px] text-xs">
            {addr ? (
              <div className="space-y-0.5">
                <div className="font-medium">{addr.display}</div>
                {addr.postcode && (
                  <div className="text-muted-foreground">CEP aprox.: {addr.postcode}</div>
                )}
                <div className="text-muted-foreground">
                  {lat.toFixed(5)}, {lng.toFixed(5)}
                </div>
              </div>
            ) : (
              <span>Sem dados de endereço para estas coordenadas.</span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="absolute top-2 right-2 flex flex-col gap-1 z-[400]">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-7 w-7 shadow-md"
          onClick={zoomIn}
          aria-label="Aumentar zoom"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-7 w-7 shadow-md"
          onClick={zoomOut}
          aria-label="Diminuir zoom"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="absolute bottom-1 right-2 text-[10px] text-muted-foreground/80 bg-background/70 px-1 rounded">
        zoom {zoom} · © OSM
      </div>
    </div>
  );
}


export function UserSignupDataModal({
  open,
  onOpenChange,
  userId,
}: UserSignupDataModalProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hideSensitive, setHideSensitive] = useState(true);
  const [openSections, setOpenSections] = useState<string[]>([]);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  // Reset transient UI state whenever the modal closes / target user changes.
  useEffect(() => {
    if (!open) {
      setSearch("");
      setHideSensitive(true);
      setOpenSections([]);
      setEditing(false);
      setDraft({});
      setSaving(false);
    }
  }, [open, userId]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    (async () => {
      // Fetch the entire row so admins can audit every field captured at signup.
      const { data: row, error: err } = await (supabase as any)
        .from("profiles")
        .select("*")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (err) {
        setError(err.message ?? "Erro ao carregar dados");
        setLoading(false);
        return;
      }
      setData(row ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const copyAll = () => {
    if (!data) return;
    try {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toast({ title: "Copiado", description: "Dados copiados para a área de transferência." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
    }
  };

  const startEdit = () => {
    if (!data) return;
    setDraft({ ...data });
    setEditing(true);
    // While editing, show all sections including sensitive so the admin can edit them
    setHideSensitive(false);
    setSearch("");
    setOpenSections(SECTIONS.map((s) => s.title));
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft({});
  };

  const updateDraft = (key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const saveEdit = async () => {
    if (!data) return;
    // Build a diff so we only send actually-changed columns.
    const ALL_KNOWN_KEYS = new Set(
      SECTIONS.flatMap((s) => s.fields.filter((f) => !f.readOnly).map((f) => f.key))
    );
    const patch: Record<string, unknown> = {};
    for (const key of ALL_KNOWN_KEYS) {
      if (!(key in draft)) continue;
      const newVal = draft[key];
      const oldVal = (data as any)[key];
      // Normalize empty strings to null
      const normalized = newVal === "" ? null : newVal;
      if (JSON.stringify(normalized) !== JSON.stringify(oldVal)) {
        patch[key] = normalized;
      }
    }

    if (Object.keys(patch).length === 0) {
      toast({ title: "Nada para salvar", description: "Nenhuma alteração detectada." });
      setEditing(false);
      return;
    }

    setSaving(true);
    const profileId = (data as any).id;
    const { data: updated, error: err } = await (supabase as any)
      .from("profiles")
      .update(patch)
      .eq("id", profileId)
      .select("*")
      .maybeSingle();
    setSaving(false);

    if (err) {
      toast({
        title: "Erro ao salvar",
        description: err.message ?? "Não foi possível atualizar o perfil.",
        variant: "destructive",
      });
      return;
    }

    setData(updated ?? { ...data, ...patch });
    setEditing(false);
    setDraft({});
    toast({
      title: "Alterações salvas",
      description: `${Object.keys(patch).length} campo(s) atualizado(s) com sucesso.`,
    });
  };

  const avatarUrl = (data?.avatar_url as string) || undefined;
  const name = (data?.name as string) || "Usuário";
  const username = (data?.username as string) || "";

  // Build filtered sections based on search query and sensitive toggle.
  const filteredSections = useMemo(() => {
    if (!data) return [] as Array<{ section: Section; fields: Field[] }>;
    const q = search.trim().toLowerCase();
    return SECTIONS.map((section) => {
      if (hideSensitive && section.sensitive) return { section, fields: [] };
      const fields = section.fields.filter((f) => {
        if (!(f.key in data)) return false;
        if (hideSensitive && f.sensitive) return false;
        if (!q) return true;
        const value = formatValue((data as any)[f.key]).toLowerCase();
        return (
          f.label.toLowerCase().includes(q) ||
          f.key.toLowerCase().includes(q) ||
          value.includes(q)
        );
      });
      return { section, fields };
    }).filter((s) => s.fields.length > 0);
  }, [data, search, hideSensitive]);

  // Auto-expand sections when searching so matches are visible immediately.
  const accordionValue = search.trim()
    ? filteredSections.map((s) => s.section.title)
    : openSections;

  const totalMatches = filteredSections.reduce((acc, s) => acc + s.fields.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-0.5rem)] sm:w-full max-w-2xl p-0 gap-0 max-h-[100dvh] sm:max-h-[90vh] h-[100dvh] sm:h-auto flex flex-col overflow-hidden rounded-none sm:rounded-lg admin-modal">
        {/* FIXED HEADER (title + user card + search + toggle) */}
        <div className="shrink-0 border-b border-border/50 bg-background">
          <DialogHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileUser className="h-5 w-5 text-primary" />
              Dados do cadastro
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Todas as informações fornecidas pelo usuário no cadastro e em seu perfil.
            </DialogDescription>
          </DialogHeader>

          {data && !loading && !error && (
            <div className="px-4 sm:px-6 pb-3 sm:pb-4 space-y-3">
              {/* User card */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                <Avatar className="h-10 w-10 sm:h-12 sm:w-12 shrink-0">
                  <AvatarImage src={avatarUrl} alt={name} />
                  <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate text-sm sm:text-base">{name}</p>
                  {username && (
                    <p className="text-xs text-muted-foreground truncate">@{username}</p>
                  )}
                </div>
                {!editing ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyAll}
                      className="gap-1.5 shrink-0"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">JSON</span>
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={startEdit}
                      className="gap-1.5 shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Editar</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="gap-1.5 shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Cancelar</span>
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={saveEdit}
                      disabled={saving}
                      className="gap-1.5 shrink-0"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">
                        {saving ? "Salvando..." : "Salvar alterações"}
                      </span>
                    </Button>
                  </>
                )}
              </div>

              {/* Search + sensitive toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar campo, rótulo ou valor..."
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                  <Label
                    htmlFor="hide-sensitive"
                    className="text-xs flex items-center gap-1.5 cursor-pointer text-muted-foreground"
                  >
                    {hideSensitive ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    <span>Ocultar sensíveis</span>
                  </Label>
                  <Switch
                    id="hide-sensitive"
                    checked={hideSensitive}
                    onCheckedChange={setHideSensitive}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide">
          {loading ? (
            <div className="space-y-3 p-4 sm:p-6">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : error ? (
            <div className="text-sm text-destructive py-6 px-4 text-center">{error}</div>
          ) : !data ? (
            <div className="text-sm text-muted-foreground py-6 px-4 text-center">
              Nenhum dado encontrado para este usuário.
            </div>
          ) : filteredSections.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 px-4 text-center">
              {search.trim()
                ? `Nenhum campo encontrado para "${search.trim()}".`
                : "Nenhum campo disponível."}
            </div>
          ) : (
            <div className="px-4 sm:px-6 py-3 pb-6">
              {search.trim() && (
                <p className="text-[11px] text-muted-foreground mb-2">
                  {totalMatches} resultado{totalMatches === 1 ? "" : "s"} para "{search.trim()}"
                </p>
              )}
              <Accordion
                type="multiple"
                value={accordionValue}
                onValueChange={(v) => setOpenSections(v as string[])}
                className="space-y-2"
              >
                {filteredSections.map(({ section, fields }) => (
                  <AccordionItem
                    key={section.title}
                    value={section.title}
                    className="border border-border/50 rounded-lg px-3 bg-muted/20"
                  >
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/90">
                          {section.title}
                        </h4>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {fields.length}
                        </Badge>
                        {section.sensitive && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0 border-amber-500/40 text-amber-500"
                          >
                            sensível
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        {fields.map((f) => (
                          <div key={f.key} className="flex flex-col min-w-0">
                            <dt className="text-[11px] text-muted-foreground flex items-center gap-1">
                              {f.label}
                              {f.sensitive && (
                                <EyeOff className="h-3 w-3 text-amber-500" />
                              )}
                            </dt>
                            <dd className="break-words font-medium">
                              {editing && !f.readOnly ? (
                                renderFieldInput(f, draft[f.key], (v) => updateDraft(f.key, v))
                              ) : (
                                formatValue((data as any)[f.key])
                              )}
                            </dd>
                          </div>
                        ))}
                        {section.title === "Localização & Privacidade" && (
                          <LatLngCityRow
                            lat={(data as any).location_lat}
                            lng={(data as any).location_lng}
                          />
                        )}
                      </dl>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
