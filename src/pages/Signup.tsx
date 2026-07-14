import { forwardRef, useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/Logo";
import {
  Eye, EyeOff, Loader2, Shield, AlertTriangle, User, Users,
  Camera, MapPin, Navigation, Search, Check, X, ChevronRight, ChevronLeft, Tag,
  CalendarIcon,
} from "lucide-react";

import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
// Lazy: heavy modals only mounted on-demand to shrink initial Signup chunk
const LivenessCheckModal = lazy(() =>
  import("@/components/LivenessCheckModal").then(m => ({ default: m.LivenessCheckModal }))
);
const SubscriptionModal = lazy(() =>
  import("@/components/SubscriptionModal").then(m => ({ default: m.SubscriptionModal }))
);
import { PlanSelectionStep } from "@/components/PlanSelectionStep";
import { WaitlistSignupForm } from "@/components/WaitlistSignupForm";
import { useCanSignup } from "@/hooks/useCapacityMetrics";
import { useTrackConversionEvent } from "@/hooks/useConversionEvents";
import { useInterestTags } from "@/hooks/useInterestTags";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  FEED_GENDER_CATEGORY_DEFS,
  type FeedGenderCategory,
} from "@/config/feedGenderFilter";

// browser-image-compression é lazy: só é baixada quando o usuário
// realmente seleciona avatar/banner para subir (corta o chunk inicial
// do Signup em ~80KB gz).
const loadImageCompression = () =>
  import("browser-image-compression").then((m) => m.default);
import { persistProfileForUser } from "@/lib/profilePersistence";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { saveTermsConsent, TERMS_ROUTE } from "@/lib/termsConsent";
import {
  checkAvailability,
  isValidUsername,
  slugifyUsername,
  suggestUsernames,
} from "@/lib/signupAvailability";
import { normalizeCreatorInviteCode } from "@/lib/inviteLinks";

const signupClient = supabase;

const NETWORK_TIMEOUT_MS = 15000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout de rede em ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getErrorMessage(error: unknown, fallback = "Erro desconhecido"): string {
  if (!error) return fallback;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "object") {
    const e = error as { message?: string; error_description?: string; details?: string };
    return e.message || e.error_description || e.details || fallback;
  }
  return String(error);
}

// ─── Haversine ────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConsentState {
  ageConfirmed: boolean;
  termsAccepted: boolean;
  dataProcessing: boolean;
  sensitiveData: boolean;
  contentRules: boolean;
}

const genderOptions = [
  { value: "man", label: "Homem", icon: "👨" },
  { value: "woman", label: "Mulher", icon: "👩" },
  { value: "couple", label: "Casal", icon: "👫" },
  { value: "other", label: "Outro", icon: "🌈" },
];

const STEPS = ["Identidade", "Localização", "Interesses", "Preferências"];

// ─── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ current, onStepClick }: { current: number; onStepClick?: (i: number) => void }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1">
          <button
            type="button"
            onClick={() => onStepClick?.(i)}
            className="flex flex-col items-center gap-1 flex-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-md"
            aria-label={`Ir para etapa ${i + 1}: ${label}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < current
                  ? "bg-primary text-primary-foreground"
                  : i === current
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/40"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-[10px] font-medium ${i === current ? "text-primary" : "text-muted-foreground"}`}>
              {label}
            </span>
          </button>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${i < current ? "bg-primary" : "bg-muted/40"}`} />
          )}
        </div>
      ))}
    </div>
  );
}


// ─── Image picker ──────────────────────────────────────────────────────────────
function ImagePicker({
  label,
  preview,
  onFile,
  aspect = "square",
  required = false,
  error,
}: {
  label: string;
  preview: string | null;
  onFile: (f: File) => void;
  aspect?: "square" | "wide";
  required?: boolean;
  error?: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const hasError = !!error;
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`w-full rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden active:scale-95 transition-transform ${
          aspect === "wide" ? "h-20" : "h-24"
        } ${hasError ? "border-destructive bg-destructive/5" : "border-border/50 bg-muted/20"}`}
        aria-invalid={hasError}
      >
        {preview ? (
          <img loading="lazy" decoding="async" src={preview} alt={label} className="w-full h-full object-cover rounded-xl" />
        ) : (
          <div className={`flex flex-col items-center gap-1 ${hasError ? "text-destructive" : "text-muted-foreground"}`}>
            <Camera className="h-5 w-5" />
            <span className="text-xs">Toque para selecionar</span>
          </div>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // limpa o input para permitir reescolher o mesmo arquivo
          e.target.value = "";
        }}
      />
      {hasError && (
        <p className="text-[11px] text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}


// ─── Tag chip ──────────────────────────────────────────────────────────────────
function TagChip({
  label,
  icon,
  selected,
  onToggle,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{ minHeight: 44 }}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-colors active:scale-95 ${
        selected
          ? "bg-primary/20 border-primary text-primary"
          : "bg-muted/30 border-border/50 text-muted-foreground"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
const Signup = forwardRef<HTMLDivElement, object>(function Signup(_props, _ref) {
  const [step, setStep] = useState(0);

  // Step 1 – Identity
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [genderOther, setGenderOther] = useState("");
  const [partnerBirthDate1, setPartnerBirthDate1] = useState("");
  const [partnerBirthDate2, setPartnerBirthDate2] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [consents, setConsents] = useState<ConsentState>({
    ageConfirmed: false,
    termsAccepted: false,
    dataProcessing: false,
    sensitiveData: false,
    contentRules: false,
  });

  // Step 2 – Location
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [cepCoords, setCepCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string | null>(null);
  const [gpsCep, setGpsCep] = useState<string | null>(null);
  // Estado do erro do GPS — alimenta painel de ajuda contextual (denied/unavailable/timeout/insecure)
  const [gpsErrorKind, setGpsErrorKind] = useState<null | 'denied' | 'unavailable' | 'timeout' | 'insecure' | 'unsupported'>(null);
  const [gpsErrorDetail, setGpsErrorDetail] = useState<string | null>(null);
  // Fallback aprovado pelo usuário — usa a coordenada aproximada do CEP quando o GPS não puder ser liberado
  const [usingCepFallback, setUsingCepFallback] = useState(false);
  // Confirmação explícita do endereço (cidade/UF) antes de avançar
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  // Erros por campo da etapa de localização (CEP, rua, bairro, cidade, UF, GPS, confirm)
  const [step2Errors, setStep2Errors] = useState<Record<string, string | null>>({});
  // Persistência local do rascunho da etapa 2 + impressão digital da última confirmação
  const STEP2_LS_KEY = "oculto:signup:step2";
  const [step2Hydrated, setStep2Hydrated] = useState(false);
  const lastConfirmedFingerprintRef = useRef<string>("");
  const addressFingerprint = useCallback(() => {
    const cepDigits = (cep || "").replace(/\D/g, "");
    const lat = gpsCoords?.lat?.toFixed(5) ?? "";
    const lng = gpsCoords?.lng?.toFixed(5) ?? "";
    return `${cepDigits}|${city.trim().toLowerCase()}|${uf.trim().toUpperCase()}|${lat}|${lng}`;
  }, [cep, city, uf, gpsCoords?.lat, gpsCoords?.lng]);

  // ── BR date helpers (dd/mm/aaaa <-> yyyy-mm-dd) ──
  const maskBRDate = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  };
  // Valida estrutura + dia/mês reais (rejeita 31/02 etc.)
  const brToIso = (br: string): string => {
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    const [, dd, mm, yyyy] = m;
    const day = parseInt(dd, 10), mon = parseInt(mm, 10), year = parseInt(yyyy, 10);
    if (mon < 1 || mon > 12 || day < 1 || day > 31 || year < 1900 || year > new Date().getFullYear()) return "";
    const iso = `${yyyy}-${mm}-${dd}`;
    const dt = new Date(iso + "T00:00:00");
    if (isNaN(dt.getTime())) return "";
    // Rejeita datas inexistentes (ex: 31/02)
    if (dt.getUTCDate() !== day || dt.getUTCMonth() + 1 !== mon || dt.getUTCFullYear() !== year) return "";
    return iso;
  };
  const calcAge = (iso: string): number | null => {
    if (!iso) return null;
    const dt = new Date(iso + "T00:00:00");
    if (isNaN(dt.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dt.getFullYear();
    const m = today.getMonth() - dt.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dt.getDate())) age--;
    return age;
  };
  // Mensagem de erro inline; null = válido ou vazio
  const dateErrorMessage = (br: string, requireAdult = true): string | null => {
    if (!br) return null;
    if (br.length < 10) return "Digite a data completa no formato dd/mm/aaaa.";
    const iso = brToIso(br);
    if (!iso) return "Data inválida — verifique dia, mês e ano.";
    if (requireAdult) {
      const age = calcAge(iso);
      if (age !== null && age < 18) return "É necessário ter 18 anos ou mais para se cadastrar.";
    }
    return null;
  };

  // BR display state for birth dates
  const [birthDateBR, setBirthDateBR] = useState("");
  const [partnerBirth1BR, setPartnerBirth1BR] = useState("");
  const [partnerBirth2BR, setPartnerBirth2BR] = useState("");

  useEffect(() => { setBirthDate(brToIso(birthDateBR)); }, [birthDateBR]);
  useEffect(() => { setPartnerBirthDate1(brToIso(partnerBirth1BR)); }, [partnerBirth1BR]);
  useEffect(() => { setPartnerBirthDate2(brToIso(partnerBirth2BR)); }, [partnerBirth2BR]);

  const birthDateError = dateErrorMessage(birthDateBR, true);
  const partner1DateError = dateErrorMessage(partnerBirth1BR, true);
  const partner2DateError = dateErrorMessage(partnerBirth2BR, true);

  // Step 3 – Tags
  const [socialTags, setSocialTags] = useState<string[]>([]);
  const [adultTags, setAdultTags] = useState<string[]>([]);
  const {
    socialTags: SOCIAL_TAGS,
    adultTags: ADULT_TAGS,
    socialIcons: SOCIAL_TAG_ICONS,
    adultIcons: ADULT_TAG_ICONS,
  } = useInterestTags();

  // Step 4 – Preferência de visualização do feed (filtro de gênero)
  const [feedFilterCategories, setFeedFilterCategories] = useState<FeedGenderCategory[]>([]);


  // Post-signup flows
  const [isLoading, setIsLoading] = useState(false);
  const [showLivenessModal, setShowLivenessModal] = useState(false);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [creatorReferralCode, setCreatorReferralCode] = useState<string | null>(null);
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);

  const { user, loading, signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: capacityData, isLoading: loadingCapacity } = useCanSignup();
  const trackEvent = useTrackConversionEvent();

  useEffect(() => {
    trackEvent.mutate({ eventType: "signup_start" });
  }, []);

  // ── Persistência local da Step 2 (rascunho do endereço) ──────────────────
  // Hidrata uma vez ao montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STEP2_LS_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.cep === "string") setCep(d.cep);
        if (typeof d.street === "string") setStreet(d.street);
        if (typeof d.neighborhood === "string") setNeighborhood(d.neighborhood);
        if (typeof d.city === "string") setCity(d.city);
        if (typeof d.uf === "string") setUf(d.uf);
        if (d.gpsCoords && typeof d.gpsCoords.lat === "number") setGpsCoords(d.gpsCoords);
        if (d.cepCoords && typeof d.cepCoords.lat === "number") setCepCoords(d.cepCoords);
        if (d.usingCepFallback === true) setUsingCepFallback(true);
        if (typeof d.confirmedFingerprint === "string") {
          lastConfirmedFingerprintRef.current = d.confirmedFingerprint;
        }
      }
    } catch { /* ignora corrupção do storage */ }
    setStep2Hydrated(true);
  }, []);

  // Após hidratação, restaura a confirmação SOMENTE se nada mudou desde o último confirm
  useEffect(() => {
    if (!step2Hydrated) return;
    if (
      lastConfirmedFingerprintRef.current &&
      addressFingerprint() === lastConfirmedFingerprintRef.current
    ) {
      setAddressConfirmed(true);
    }
    // só roda uma vez após hidratar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step2Hydrated]);

  // Reset automático da confirmação quando CEP/cidade/UF/GPS mudam após hidratação
  useEffect(() => {
    if (!step2Hydrated) return;
    if (addressFingerprint() !== lastConfirmedFingerprintRef.current) {
      setAddressConfirmed(false);
    }
  }, [step2Hydrated, cep, city, uf, gpsCoords?.lat, gpsCoords?.lng, addressFingerprint]);

  // Persiste o rascunho a cada alteração relevante
  useEffect(() => {
    if (!step2Hydrated) return;
    try {
      const fp = addressFingerprint();
      if (addressConfirmed) lastConfirmedFingerprintRef.current = fp;
      localStorage.setItem(
        STEP2_LS_KEY,
        JSON.stringify({
          cep, street, neighborhood, city, uf,
          gpsCoords, cepCoords, usingCepFallback,
          addressConfirmed,
          confirmedFingerprint: lastConfirmedFingerprintRef.current,
          savedAt: Date.now(),
        })
      );
    } catch { /* quota / privacidade — silencioso */ }
  }, [step2Hydrated, cep, street, neighborhood, city, uf, gpsCoords, cepCoords, usingCepFallback, addressConfirmed, addressFingerprint]);

  // Limpa erros por campo conforme o usuário corrige
  useEffect(() => {
    setStep2Errors((prev) => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      const cepDigits = (cep || "").replace(/\D/g, "");
      if (next.cep && cepDigits.length === 8) next.cep = null;
      if (next.street && street.trim()) next.street = null;
      if (next.neighborhood && neighborhood.trim()) next.neighborhood = null;
      if (next.city && city.trim()) next.city = null;
      if (next.uf && uf.trim().length === 2) next.uf = null;
      if (next.gps && gpsCoords) next.gps = null;
      if (next.confirm && addressConfirmed) next.confirm = null;
      return next;
    });
  }, [cep, street, neighborhood, city, uf, gpsCoords, addressConfirmed]);


  // Auto-preenche o username sugerido a partir do nome (se o usuário ainda não tocou no campo)
  useEffect(() => {
    if (!usernameTouched && name) {
      setUsername(slugifyUsername(name));
    }
  }, [name, usernameTouched]);

  // Debounce: checa email no banco
  useEffect(() => {
    setEmailError(null);
    const v = email.trim().toLowerCase();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
    setCheckingEmail(true);
    const t = setTimeout(async () => {
      const { email_taken } = await checkAvailability(v, "");
      if (email_taken) setEmailError("Este e-mail já está cadastrado. Use outro e-mail ou faça login.");
      setCheckingEmail(false);
    }, 500);
    return () => { clearTimeout(t); setCheckingEmail(false); };
  }, [email]);

  // Debounce: checa username + carrega sugestões se ocupado
  useEffect(() => {
    setUsernameError(null);
    setUsernameSuggestions([]);
    const v = (username || "").toLowerCase();
    const fmtErr = isValidUsername(v);
    if (fmtErr) { if (usernameTouched) setUsernameError(fmtErr); return; }
    setCheckingUsername(true);
    const t = setTimeout(async () => {
      const { username_taken } = await checkAvailability("", v);
      if (username_taken) {
        setUsernameError("Este nome de usuário já está em uso. Escolha outro:");
        setLoadingSuggestions(true);
        const sugg = await suggestUsernames(name || v);
        setUsernameSuggestions(sugg);
        setLoadingSuggestions(false);
      }
      setCheckingUsername(false);
    }, 500);
    return () => { clearTimeout(t); setCheckingUsername(false); };
  }, [username, usernameTouched, name]);

  useEffect(() => {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [n, v] = cookie.trim().split("=");
      if (n === "creator_referral_code" && v) {
        let decoded = v;
        try { decoded = decodeURIComponent(v); } catch { /* mantém */ }
        setCreatorReferralCode(normalizeCreatorInviteCode(decoded) || decoded);
        break;
      }
    }
  }, []);

  // Invite referral (from /invite/:username)
  const [inviteReferrerId, setInviteReferrerId] = useState<string | null>(null);
  useEffect(() => {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [n, v] = cookie.trim().split("=");
      if (n === "invite_ref_username" && v) {
        setInviteReferrerId(v);
        break;
      }
    }
  }, []);

  // ── Image handling ──
  const handleImageFile = useCallback(
    async (file: File, type: "avatar" | "banner") => {
      if (!file || !file.type?.startsWith("image/")) {
        toast({ title: "Arquivo inválido. Selecione uma imagem (JPG, PNG ou WebP).", variant: "destructive" });
        return;
      }
      if (file.size < 1024) {
        toast({ title: "Imagem muito pequena ou corrompida. Tente outra foto.", variant: "destructive" });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "Imagem acima de 10MB. Escolha uma menor.", variant: "destructive" });
        return;
      }
      const preview = URL.createObjectURL(file);
      if (type === "avatar") {
        setAvatarPreview(preview);
        setAvatarFile(file);
      } else {
        setBannerPreview(preview);
        setBannerFile(file);
      }
    },
    [toast]
  );


  // ── CEP fetch ──
  const fetchCep = useCallback(
    async (raw: string) => {
      const cleaned = raw.replace(/\D/g, "");
      if (cleaned.length !== 8) return;
      setCepLoading(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await res.json();
        if (data.erro) {
          toast({ title: "CEP não encontrado. Preencha manualmente.", variant: "destructive" });
          return;
        }
        setStreet(data.logradouro || "");
        setNeighborhood(data.bairro || "");
        setCity(data.localidade || "");
        setUf(data.uf || "");

        // Get coords from CEP (non-blocking, own timeout)
        try {
          const geoCtrl = new AbortController();
          const geoTimeout = setTimeout(() => geoCtrl.abort(), 3000);
          const geo = await fetch(
            `https://nominatim.openstreetmap.org/search?postalcode=${cleaned}&country=BR&format=json&limit=1`,
            { headers: { "Accept-Language": "pt-BR" }, signal: geoCtrl.signal }
          );
          clearTimeout(geoTimeout);
          const geoData = await geo.json();
          if (geoData?.[0]) {
            setCepCoords({ lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) });
          }
        } catch {
          // non-blocking
        }

        toast({ title: "✅ Endereço preenchido!", description: `${data.localidade} – ${data.uf}` });
      } catch {
        clearTimeout(timeout);
        toast({ title: "Busca de CEP falhou", description: "Preencha o endereço manualmente.", variant: "destructive" });
      } finally {
        setCepLoading(false);
      }
    },
    [toast]
  );

  // Detecta de forma amigável o tipo de erro do navegador.
  const interpretGpsError = (err: GeolocationPositionError | null): { kind: 'denied' | 'unavailable' | 'timeout'; message: string } => {
    if (!err) return { kind: 'unavailable', message: 'Não foi possível obter sua localização.' };
    if (err.code === 1) {
      return {
        kind: 'denied',
        message: 'Permissão de localização negada. Libere o acesso ao GPS nas configurações do navegador para continuar.',
      };
    }
    if (err.code === 2) {
      return {
        kind: 'unavailable',
        message: 'Não conseguimos obter o sinal de GPS agora. Vá para um local aberto e tente de novo.',
      };
    }
    if (err.code === 3) {
      return {
        kind: 'timeout',
        message: 'Tempo esgotado tentando obter o GPS. Tente novamente — em locais fechados pode demorar mais.',
      };
    }
    return { kind: 'unavailable', message: err.message || 'Falha desconhecida ao obter GPS.' };
  };

  // ── GPS capture ── (robusto: dedupe, contexto seguro, mensagens amigáveis, painel de ajuda)
  const gpsRequestInFlightRef = useRef(false);
  const handleGetGPS = useCallback(() => {
    // 1) Dedupe — evita disparar dois toasts/erros simultâneos quando o usuário toca duas vezes rápido.
    if (gpsRequestInFlightRef.current) return;

    // 2) Suporte do navegador
    if (!('geolocation' in navigator)) {
      setGpsErrorKind('unsupported');
      setGpsErrorDetail('Seu navegador não oferece API de geolocalização.');
      toast({ title: 'GPS não disponível neste dispositivo', variant: 'destructive' });
      return;
    }

    // 3) Contexto seguro — em HTTP puro o navegador bloqueia silenciosamente.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setGpsErrorKind('insecure');
      setGpsErrorDetail('Esta página precisa estar em HTTPS para acessar o GPS.');
      toast({
        title: 'Conexão não segura',
        description: 'O navegador bloqueia GPS fora de HTTPS. Abra a versão segura do site.',
        variant: 'destructive',
      });
      return;
    }

    gpsRequestInFlightRef.current = true;
    setGpsLoading(true);
    setGpsErrorKind(null);
    setGpsErrorDetail(null);
    setGpsAddress(null);
    setGpsCep(null);

    // 4) Pré-checa permissão (quando suportado). Se já estiver "denied", abre o painel
    //    de ajuda direto SEM chamar getCurrentPosition novamente (evita duplo toast).
    const runRequest = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          gpsRequestInFlightRef.current = false;
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGpsCoords(coords);
          setUsingCepFallback(false);
          setGpsLoading(false);
          setGpsErrorKind(null);
          setGpsErrorDetail(null);
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&accept-language=pt-BR&addressdetails=1`,
            );
            const data = await res.json();
            if (data?.address) {
              const a = data.address;
              const road = a.road || a.pedestrian || a.residential || '';
              const suburb = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.state_district || '';
              const cityName = a.city || a.town || a.village || a.municipality || '';
              const stateName = a.state_code || a.state || '';
              const postcode = a.postcode ? String(a.postcode).replace(/\D/g, '') : '';

              const parts = [road, suburb, cityName, stateName].filter(Boolean);
              setGpsAddress(parts.join(', '));
              if (postcode) setGpsCep(postcode);

              if (road && !street) setStreet(road);
              if (suburb && !neighborhood) setNeighborhood(suburb);
              if (cityName && !city) setCity(cityName);
              if (stateName && !uf) {
                const ufCandidate = stateName.length === 2
                  ? stateName.toUpperCase()
                  : (a.state_code || '').toUpperCase();
                if (ufCandidate) setUf(ufCandidate.slice(0, 2));
              }
              if (postcode && !cep) setCep(postcode.slice(0, 8));
            } else if (data?.display_name) {
              setGpsAddress(data.display_name.split(',').slice(0, 3).join(',').trim());
            }
          } catch {
            setGpsAddress(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
          }
          toast({ title: '✅ Localização GPS obtida!' });
        },
        (err) => {
          gpsRequestInFlightRef.current = false;
          setGpsLoading(false);
          const { kind, message } = interpretGpsError(err);
          setGpsErrorKind(kind);
          setGpsErrorDetail(message);
          // Um único toast por tentativa — o painel abaixo mostra instruções detalhadas.
          toast({
            title: kind === 'denied' ? 'Permissão de GPS bloqueada' : 'Não foi possível obter o GPS',
            description: message,
            variant: 'destructive',
          });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    };

    const perms = (navigator as any).permissions;
    if (perms?.query) {
      perms
        .query({ name: 'geolocation' as PermissionName })
        .then((status: PermissionStatus) => {
          if (status.state === 'denied') {
            gpsRequestInFlightRef.current = false;
            setGpsLoading(false);
            setGpsErrorKind('denied');
            setGpsErrorDetail('A permissão de localização está bloqueada para este site nas configurações do navegador.');
            toast({
              title: 'Permissão de GPS bloqueada',
              description: 'Reative o acesso à localização nas configurações do navegador e tente de novo.',
              variant: 'destructive',
            });
            return;
          }
          runRequest();
        })
        .catch(() => runRequest());
    } else {
      runRequest();
    }
  }, [toast, street, neighborhood, city, uf, cep]);

  // Permite ao usuário usar a coordenada aproximada do CEP quando não conseguir liberar o GPS.
  const handleUseCepAsLocation = useCallback(() => {
    if (!cepCoords) {
      toast({
        title: 'Preencha um CEP válido primeiro',
        description: 'Para usar a localização aproximada precisamos das coordenadas vindas do CEP.',
        variant: 'destructive',
      });
      return;
    }
    setGpsCoords(cepCoords);
    setUsingCepFallback(true);
    setGpsErrorKind(null);
    setGpsErrorDetail(null);
    setGpsAddress('Localização aproximada do CEP informado');
    toast({
      title: 'Usando localização aproximada do CEP',
      description: 'Você pode concluir o cadastro. Mais tarde, libere o GPS nas configurações da conta para experiências baseadas em proximidade.',
    });
  }, [cepCoords, toast]);


  const distanceKm =
    gpsCoords && cepCoords
      ? haversineKm(gpsCoords.lat, gpsCoords.lng, cepCoords.lat, cepCoords.lng)
      : null;

  const MAX_KM = 5;

  // ─── Validations per step ──────────────────────────────────────────────────
  const validateStep1 = () => {
    if (!avatarFile) return "Foto de perfil é obrigatória.";
    if (!name.trim()) return "Informe seu nome real.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "E-mail inválido.";
    if (emailError) return emailError;
    if (!username.trim()) return "Informe um nome de usuário.";
    const uErr = isValidUsername(username);
    if (uErr) return uErr;
    if (usernameError) return usernameError;
    if (checkingEmail || checkingUsername) return "Aguarde a verificação de disponibilidade...";
    if (!password || password.length < 6) return "Senha deve ter no mínimo 6 caracteres.";
    if (password !== passwordConfirm) return "As senhas não coincidem.";
    if (!birthDateBR) return "Data de nascimento é obrigatória.";
    const dErr = dateErrorMessage(birthDateBR, true);
    if (dErr) return dErr;
    if (!birthDate) return "Data de nascimento inválida.";
    if (!gender) return "Selecione seu gênero/tipo.";
    if (gender === "other" && !genderOther.trim()) return "Descreva como você se identifica.";
    if (gender === "couple") {
      if (partnerBirth1BR && dateErrorMessage(partnerBirth1BR, true)) return `Parceiro(a) 1: ${dateErrorMessage(partnerBirth1BR, true)}`;
      if (partnerBirth2BR && dateErrorMessage(partnerBirth2BR, true)) return `Parceiro(a) 2: ${dateErrorMessage(partnerBirth2BR, true)}`;
    }
    if (!Object.values(consents).every(Boolean)) return "Aceite todos os consentimentos obrigatórios.";
    return null;
  };

  const validateStep2 = () => {
    if (!cep.replace(/\D/g, "") || cep.replace(/\D/g, "").length !== 8) return "Informe um CEP válido.";
    if (!street.trim() || !neighborhood.trim() || !city.trim() || !uf.trim()) {
      return "Preencha Rua, Bairro, Cidade e Estado para continuar.";
    }
    if (uf.trim().length !== 2) return "Estado (UF) inválido — use a sigla com 2 letras.";
    if (!gpsCoords) return "Valide sua localização via GPS — ou use a opção de localização aproximada do CEP — para continuar.";
    // Não exige verificação de distância no fallback (já é a própria coordenada do CEP)
    if (!usingCepFallback && distanceKm !== null && distanceKm > MAX_KM)
      return `Sua localização GPS está ${distanceKm.toFixed(1)} km do CEP informado. Máximo permitido: ${MAX_KM} km.`;
    if (!addressConfirmed) return `Confirme que ${city.trim()}/${uf.trim().toUpperCase()} é o seu endereço correto antes de continuar.`;
    return null;
  };

  // Erros por campo da Step 2 — usados para destacar inputs e exibir helper text
  const computeStep2FieldErrors = useCallback((): Record<string, string | null> => {
    const e: Record<string, string | null> = {};
    const cepDigits = (cep || "").replace(/\D/g, "");
    if (!cepDigits || cepDigits.length !== 8) e.cep = "Informe um CEP válido com 8 dígitos.";
    if (!street.trim()) e.street = "Informe a rua / logradouro.";
    if (!neighborhood.trim()) e.neighborhood = "Informe o bairro.";
    if (!city.trim()) e.city = "Informe a cidade.";
    if (!uf.trim() || uf.trim().length !== 2) e.uf = "UF inválida — use a sigla com 2 letras.";
    if (!gpsCoords) e.gps = "Valide sua localização via GPS ou use o fallback do CEP.";
    else if (!usingCepFallback && distanceKm !== null && distanceKm > MAX_KM)
      e.gps = `GPS a ${distanceKm.toFixed(1)} km do CEP (máx. ${MAX_KM} km).`;
    if (!addressConfirmed && city.trim() && uf.trim() && gpsCoords)
      e.confirm = "Marque a confirmação do endereço para continuar.";
    return e;
  }, [cep, street, neighborhood, city, uf, gpsCoords, usingCepFallback, distanceKm, addressConfirmed]);

  const validateStep3 = () => {
    if (socialTags.length < 5) return "Selecione no mínimo 5 interesses sociais.";
    if (adultTags.length < 1) return "Selecione no mínimo 1 interesse adulto (+18).";
    return null;
  };

  const validateStep4 = () => {
    if (feedFilterCategories.length < 1) {
      return "Selecione no mínimo 1 preferência de visualização do feed.";
    }
    return null;
  };


  const goNext = () => {
    if (step === 0) {
      const err = validateStep1();
      if (err) { toast({ title: err, variant: "destructive" }); return; }
    }
    if (step === 1) {
      const fieldErrs = computeStep2FieldErrors();
      const err = validateStep2();
      if (err) {
        setStep2Errors(fieldErrs);
        toast({ title: err, variant: "destructive" });
        // foca o primeiro campo inválido
        const order = ["cep", "street", "neighborhood", "city", "uf", "gps", "confirm"];
        const first = order.find((k) => fieldErrs[k]);
        if (first && first !== "gps" && first !== "confirm") {
          requestAnimationFrame(() => document.getElementById(first)?.focus());
        }
        return;
      }
      setStep2Errors({});
    }
    if (step === 2) {
      const err = validateStep3();
      if (err) { toast({ title: err, variant: "destructive" }); return; }
    }
    setStep((s) => s + 1);
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));


  // ─── Final submit ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const err1 = validateStep1();
    if (err1) { toast({ title: err1, variant: "destructive" }); setStep(0); return; }
    const err2 = validateStep2();
    if (err2) { toast({ title: err2, variant: "destructive" }); setStep(1); return; }
    const err3 = validateStep3();
    if (err3) { toast({ title: err3, variant: "destructive" }); setStep(2); return; }
    const err4 = validateStep4();
    if (err4) { toast({ title: err4, variant: "destructive" }); setStep(3); return; }

    if (!gpsCoords) {
      toast({
        title: "Localização GPS obrigatória",
        description: "Volte à etapa de Localização e toque em \"Usar GPS\". Sua localização exata nunca será exibida a outros usuários — apenas a região aproximada.",
        variant: "destructive",
      });
      setStep(1);
      return;
    }
    if (!consents.termsAccepted) {
      toast({ title: "Você precisa aceitar os Termos de Uso para continuar.", variant: "destructive" });
      return;
    }
    // Persiste localmente o aceite da versão atual dos Termos
    saveTermsConsent("signup");


    setIsLoading(true);

    try {
      const chosenUsername = slugifyUsername(username);

      // Re-check final antes de criar (server-side, evita race)
      const finalCheck = await checkAvailability(email, chosenUsername);
      if (finalCheck.email_taken) {
        toast({
          title: "E-mail já cadastrado",
          description: "Use outro e-mail ou faça login.",
          variant: "destructive",
        });
        setStep(0);
        setEmailError("Este e-mail já está cadastrado. Use outro e-mail ou faça login.");
        return;
      }
      if (finalCheck.username_taken) {
        const sugg = await suggestUsernames(name || chosenUsername);
        setUsernameSuggestions(sugg);
        setUsernameError("Este nome de usuário já está em uso. Escolha outro:");
        toast({
          title: "Nome de usuário em uso",
          description: "Escolha uma das sugestões ou crie outro.",
          variant: "destructive",
        });
        setStep(0);
        return;
      }

      const { error: signUpError } = await withTimeout(
        signUp(email, password, name, chosenUsername),
        NETWORK_TIMEOUT_MS,
        "cadastro"
      );

      if (signUpError) {
        const signUpMessage = getErrorMessage(signUpError, "Falha no cadastro");
        const isAlreadyRegistered = /already registered|já está cadastrado|user already/i.test(signUpMessage);

        if (isAlreadyRegistered) {
          setEmailError("Este e-mail já está cadastrado. Use outro e-mail ou faça login.");
          setStep(0);
          toast({
            title: "E-mail já cadastrado",
            description: "Use outro e-mail ou faça login com sua conta.",
            variant: "destructive",
          });
          return;
        }

        console.error("[Signup] signUp error:", signUpError);
        toast({
          title: "Erro ao criar conta",
          description: signUpMessage,
          variant: "destructive",
        });
        return;
      }

      // Garante sessão ativa antes de continuar etapas do cadastro
      let session: any = null;
      try {
        const sessionRes = await withTimeout(
          signupClient.auth.getSession(),
          NETWORK_TIMEOUT_MS,
          "obter sessão"
        );
        session = sessionRes.data.session;
      } catch (sessionErr) {
        console.error("[Signup] getSession error:", sessionErr);
      }

      if (!session?.user) {
        const loginRetry = await withTimeout(
          signIn(email, password),
          NETWORK_TIMEOUT_MS,
          "login pós-cadastro"
        );

        if (!loginRetry.error) {
          const retrySession = await withTimeout(
            signupClient.auth.getSession(),
            NETWORK_TIMEOUT_MS,
            "obter sessão pós-login"
          );
          session = retrySession.data.session;
        }
      }

      if (!session?.user) {
        toast({
          title: "Conta criada sem sessão ativa",
          description: "Faça login para continuar seu cadastro e acessar o feed.",
          variant: "destructive",
        });
        navigate("/login");
        return;
      }

      const uid = session.user.id;
      let existingProfileId: string | null = null;

      // Wait for profile to exist (trigger may have created it with a random id and user_id=uid)
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          // Look up by user_id first (trigger uses random id), then by id as fallback
          const { data: pByUser } = await withTimeout(
            Promise.resolve(signupClient.from("profiles").select("id").eq("user_id", uid).maybeSingle()),
            NETWORK_TIMEOUT_MS,
            "validar perfil (user_id)"
          );
          if (pByUser?.id) {
            existingProfileId = pByUser.id as string;
            break;
          }
          const { data: pById } = await withTimeout(
            Promise.resolve(signupClient.from("profiles").select("id").eq("id", uid).maybeSingle()),
            NETWORK_TIMEOUT_MS,
            "validar perfil (id)"
          );
          if (pById?.id) {
            existingProfileId = pById.id as string;
            break;
          }
        } catch (profileCheckErr) {
          console.error("[Signup] profile check timeout/error:", profileCheckErr);
          break;
        }

        await new Promise((r) => setTimeout(r, 350));
      }

      // Upload avatar (BLOQUEANTE com 3 tentativas — cadastro não pode prosseguir sem foto)
      let avatarUrl: string | null = null;
      if (!avatarFile) {
        toast({
          title: "Foto de perfil obrigatória",
          description: "Volte à etapa 1 e selecione uma foto de perfil para concluir o cadastro.",
          variant: "destructive",
        });
        setStep(0);
        return;
      }
      {
        let lastAvatarErr: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const imageCompression = await loadImageCompression();
            const compressed = await imageCompression(avatarFile, { maxSizeMB: 0.5, maxWidthOrHeight: 800, useWebWorker: true });
            const ext = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
            const path = `${uid}/avatar.${ext}`;
            const { error: upErr } = await withTimeout(
              signupClient.storage.from("avatars").upload(path, compressed, { upsert: true }),
              NETWORK_TIMEOUT_MS,
              `upload avatar (tentativa ${attempt}/3)`
            );
            if (upErr) {
              lastAvatarErr = upErr;
              console.error(`[Signup] avatar upload attempt ${attempt} failed:`, upErr);
            } else {
              const { data: { publicUrl } } = signupClient.storage.from("avatars").getPublicUrl(path);
              avatarUrl = publicUrl;
              break;
            }
          } catch (avatarErr) {
            lastAvatarErr = avatarErr;
            console.error(`[Signup] avatar upload attempt ${attempt} timeout/error:`, avatarErr);
          }
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
        }

        if (!avatarUrl) {
          toast({
            title: "Falha no envio da foto de perfil",
            description: getErrorMessage(lastAvatarErr, "Não conseguimos enviar sua foto. Verifique sua conexão e tente novamente."),
            variant: "destructive",
          });
          setStep(0);
          return;
        }
      }


      // Upload banner (non-blocking, before upsert)
      let bannerUrl: string | null = null;
      if (bannerFile) {
        try {
          const imageCompression = await loadImageCompression();
          const compressed = await imageCompression(bannerFile, { maxSizeMB: 1, maxWidthOrHeight: 1280, useWebWorker: true });
          const ext = bannerFile.name.split(".").pop() || "jpg";
          const path = `${uid}/banner.${ext}`;
          const { error: upErr } = await withTimeout(
            signupClient.storage.from("avatars").upload(path, compressed, { upsert: true }),
            NETWORK_TIMEOUT_MS,
            "upload banner"
          );
          if (!upErr) {
            const { data: { publicUrl } } = signupClient.storage.from("avatars").getPublicUrl(path);
            bannerUrl = publicUrl;
          } else {
            console.error("[Signup] banner upload error:", upErr);
          }
        } catch (bannerErr) {
          console.error("[Signup] banner upload timeout/error:", bannerErr);
        }
      }

      // ── Guard final: nunca grava perfil sem foto / cidade / GPS ──
      if (!avatarUrl) {
        toast({ title: "Foto de perfil obrigatória", description: "Tente novamente.", variant: "destructive" });
        setStep(0); return;
      }
      if (!city.trim() || !uf.trim()) {
        toast({ title: "Endereço incompleto", description: "Cidade e estado são obrigatórios.", variant: "destructive" });
        setStep(1); return;
      }
      if (!gpsCoords?.lat || !gpsCoords?.lng) {
        toast({ title: "GPS obrigatório", description: "Valide sua localização via GPS para concluir.", variant: "destructive" });
        setStep(1); return;
      }

      // ── Single consolidated upsert with ALL profile fields ──
      const generatedUsernameForProfile = slugifyUsername(username) || `user_${uid.slice(0, 8)}`;

      const fullProfilePayload: Record<string, any> = {
        user_id: uid,
        name: name.trim(),
        username: generatedUsernameForProfile,
        birth_date: birthDate || null,
        gender: gender || null,
        ...(gender === "other" ? { gender_other: genderOther } : {}),
        avatar_url: avatarUrl,
        avatar_is_placeholder: false,
        ...(bannerUrl ? { cover_image_url: bannerUrl, banner_url: bannerUrl, cover_is_placeholder: false } : {}),
        address_street: street.trim(),
        address_neighborhood: neighborhood.trim(),
        address_city: city.trim(),
        address_state: uf.trim(),
        address_cep: cep.replace(/\D/g, ""),
        address_lat: gpsCoords.lat,
        address_lng: gpsCoords.lng,
        address_verified: true,
        location_lat: gpsCoords.lat,
        location_lng: gpsCoords.lng,
        tags_social: socialTags.length > 0 ? socialTags : [],
        tags_adult: adultTags.length > 0 ? adultTags : [],
        feed_filter_categories: feedFilterCategories,
        feed_filter_chosen_at: new Date().toISOString(),
        feed_filter_prompt_required: false,
        onboarding_completed: true,

        ...(inviteReferrerId ? { referred_by_creator_id: inviteReferrerId } : {}),
      };



      // Bootstrap das preferências de visualização para novos usuários:
      // - view_mode='simple' por padrão
      // - has_seen_view_mode_modal=true para que o modal de migração NÃO apareça
      //   (usuário pode alterar depois em Configurações → Experiência).
      try {
        await signupClient
          .from("oculto_user_experience_preferences")
          .upsert(
            {
              user_id: uid,
              view_mode: "simple",
              has_seen_view_mode_modal: true,
              modal_seen_at: new Date().toISOString(),
              custom_sections: {},
            } as never,
            { onConflict: "user_id" },
          );
      } catch (vmErr) {
        console.warn("[Signup] view-mode prefs bootstrap falhou (não-fatal):", vmErr);
      }

      if (gender === "couple") {
        if (partnerBirthDate1) fullProfilePayload.partner1_birth_date = partnerBirthDate1;
        if (partnerBirthDate2) fullProfilePayload.partner2_birth_date = partnerBirthDate2;
      }

      // Prefer UPDATE on the trigger-created row (id <> user_id). Only insert if none exists.
      let upsertError: any = null;
      try {
        await withTimeout(
          persistProfileForUser(uid, fullProfilePayload, {
            identifiers: [generatedUsernameForProfile, existingProfileId],
          }),
          NETWORK_TIMEOUT_MS,
          "persistir perfil completo"
        );
      } catch (persistErr) {
        upsertError = persistErr;
      }

      if (upsertError) {
        console.error("[Signup] profile upsert error:", upsertError);
        // Non-fatal: profile partially saved via trigger
        toast({
          title: "Perfil parcialmente salvo",
          description: getErrorMessage(upsertError, "Alguns dados podem precisar ser atualizados nas configurações."),
          variant: "destructive",
        });
      }

      // Madrinha link + share ref (non-blocking)
      let profileData: { id: string } | null = null;
      try {
        const { data, error: profileDataError } = await withTimeout(
          Promise.resolve(signupClient.from("profiles").select("id").eq("user_id", uid).maybeSingle()),
          NETWORK_TIMEOUT_MS,
          "buscar perfil"
        );
        if (!profileDataError) profileData = data as { id: string };
      } catch (profileDataErr) {
        console.error("[Signup] fetch profile id error:", profileDataErr);
      }

      if (creatorReferralCode && profileData?.id) {
        try {
          const { error: linkError } = await signupClient.rpc("link_creator_referral", {
            p_afilhada_profile_id: profileData.id,
            p_referral_code: creatorReferralCode,
          });
          if (linkError) console.error("[Signup] creator referral error:", linkError);
          else document.cookie = "creator_referral_code=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        } catch (refErr) {
          console.error("[Signup] creator referral exception:", refErr);
        }
      }

      if (profileData?.id) {
        const shareRef = document.cookie.split(";").find(c => c.trim().startsWith("share_ref_code="))?.split("=")[1];
        if (shareRef) {
          try {
            const { error: shareError } = await signupClient.rpc("link_share_referral", {
              p_child_profile_id: profileData.id,
              p_share_code: shareRef,
            });
            if (shareError) console.error("[Signup] share referral error:", shareError);
            else document.cookie = "share_ref_code=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          } catch (shareErr) {
            console.error("[Signup] share referral exception:", shareErr);
          }

          // [Referral v3] Tracking consolidado da plataforma (janela 90d + antifraude)
          try {
            const deviceFp = (() => {
              try {
                const k = "oculto_device_fp";
                let v = localStorage.getItem(k);
                if (!v) { v = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`; localStorage.setItem(k, v); }
                return v;
              } catch { return null; }
            })();
            await signupClient.rpc("referral_track_signup_by_share_code", {
              p_child_user_id: uid,
              p_share_code: shareRef,
              p_device_fingerprint: deviceFp,
              p_signup_ip: null,
            });
          } catch (trackErr) {
            console.error("[Signup] referral v3 tracking exception:", trackErr);
          }
        }
      }

      // Clear invite referral cookie
      if (inviteReferrerId) {
        document.cookie = "invite_ref_username=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      }

      // Growth milestone check (fire and forget)
      import("@/hooks/useGrowthMilestone").then(({ checkGrowthMilestone }) => {
        checkGrowthMilestone().catch(() => {});
      });

      // ── Verificação de persistência: lê o perfil de volta e mostra status detalhado ──
      try {
        const { data: persisted } = await signupClient
          .from("profiles")
          .select("avatar_url, cover_image_url, banner_url, birth_date, gender, tags_social, tags_adult, address_cep, address_city, location_lat, location_lng")
          .eq("user_id", uid)
          .maybeSingle();

        const checks: string[] = [];
        const missing: string[] = [];
        if (avatarFile) (persisted?.avatar_url ? checks : missing).push("Avatar");
        if (bannerFile) ((persisted?.cover_image_url || persisted?.banner_url) ? checks : missing).push("Banner");
        if (birthDate) (persisted?.birth_date ? checks : missing).push("Birth Date");
        if (gender) (persisted?.gender ? checks : missing).push("Gender");
        if (socialTags.length > 0) (persisted?.tags_social?.length ? checks : missing).push("Tags Social");
        if (adultTags.length > 0) (persisted?.tags_adult?.length ? checks : missing).push("Tags Adult");
        if (cep) (persisted?.address_cep ? checks : missing).push("CEP");
        if (city) (persisted?.address_city ? checks : missing).push("City");
        if (gpsCoords) (persisted?.location_lat != null && persisted?.location_lng != null ? checks : missing).push("GPS");

        if (missing.length === 0) {
          toast({
            title: "Conta criada com sucesso!",
            description: checks.length > 0 ? `Persistido: ${checks.join(", ")}.` : undefined,
          });
        } else {
          toast({
            title: "Conta criada — alguns dados não persistiram",
            description: `Não salvo: ${missing.join(", ")}. Atualize nas Configurações.`,
            variant: "destructive",
          });
        }
      } catch (verifyErr) {
        console.error("[Signup] verificação de persistência falhou:", verifyErr);
        toast({ title: "Conta criada com sucesso!" });
      }

      // Cadastro concluído: limpa rascunho local da etapa de endereço
      try { localStorage.removeItem(STEP2_LS_KEY); } catch { /* ignore */ }
      navigate("/feed", { replace: true });
    } catch (submitErr) {
      console.error("[Signup] fatal submit error:", submitErr);
      toast({
        title: "Erro ao criar conta",
        description: getErrorMessage(submitErr, "Falha inesperada no cadastro."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Post-signup flows ─────────────────────────────────────────────────────
  const handlePlanSelection = async (planType: "free" | "premium" | "vip") => {
    const { data: { session } } = await signupClient.auth.getSession();
    if (session?.user) {
      await signupClient.from("profiles").update({ plan_type: planType }).eq("user_id", session.user.id);
    }
    if (planType === "free") {
      setShowPlanSelection(false);
      setShowLivenessModal(true);
    } else {
      setShowPlanSelection(false);
      setShowSubscriptionModal(true);
    }
  };

  const handleSubscriptionComplete = () => {
    setShowSubscriptionModal(false);
    setShowLivenessModal(true);
  };

  const handleLivenessSuccess = async () => {
    const { data: { session } } = await signupClient.auth.getSession();
    if (session?.user) {
      await signupClient.from("profiles").update({ is_verified: true }).eq("user_id", session.user.id);
    }
    toast({ title: "Conta criada com sucesso! 🎉", description: "Bem-vindo ao OCULTO." });
    navigate("/feed");
  };

  const handleLivenessCancel = () => {
    setShowLivenessModal(false);
    toast({ title: "Verificação pendente", description: "Complete a verificação mais tarde nas configurações." });
    navigate("/feed");
  };

  // ─── Guards ────────────────────────────────────────────────────────────────
  const isAtCapacity = capacityData?.waitlistEnabled && capacityData?.percentage >= 100;
  const maxLimit = 1000;
  const currentUsers = capacityData ? Math.round((capacityData.percentage / 100) * maxLimit) : 0;
  const remainingSlots = Math.max(0, maxLimit - currentUsers);
  const showScarcity = remainingSlots > 0 && remainingSlots <= 100;

  if (loading || loadingCapacity) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAtCapacity || showWaitlistForm) {
    return <WaitlistSignupForm onBack={() => setShowWaitlistForm(false)} showBackButton={!isAtCapacity} />;
  }

  if (user) return <Navigate to="/feed" replace />;

  if (showPlanSelection) {
    return (
      <>
        <PlanSelectionStep onSelectPlan={handlePlanSelection} onSkip={() => handlePlanSelection("free")} />
        {showSubscriptionModal && (
          <Suspense fallback={null}>
            <SubscriptionModal open={showSubscriptionModal} onOpenChange={setShowSubscriptionModal} onSubscribe={handleSubscriptionComplete} />
          </Suspense>
        )}
      </>
    );
  }

  const allConsentsGiven = Object.values(consents).every(Boolean);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-dvh w-full bg-background flex flex-col items-center justify-start overflow-x-hidden"
      style={{ minWidth: 0 }}
    >
      {/* Background gradient */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background pointer-events-none" />

      <div className="w-full max-w-md px-4 pt-6 pb-10">
        {/* Logo */}
        <div className="flex justify-center mb-5 cursor-pointer" onClick={() => navigate('/')}>
          <Logo />
        </div>

        {/* Scarcity counter — only when < 100 slots remain */}
        {showScarcity && (
          <div className="flex items-center justify-center gap-2 mb-4 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
            <AlertTriangle className="h-3.5 w-3.5 text-primary shrink-0" />
            <p className="text-xs font-medium text-primary">
              Restam apenas <span className="font-bold">{remainingSlots}</span> vagas exclusivas
            </p>
          </div>
        )}

        {/* Card — sem altura fixa, sem scrollbar visível */}
        <div
          className="bg-card border border-border/40 rounded-2xl p-5"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          <StepBar current={step} onStepClick={(i) => setStep(i)} />

          {/* ── STEP 1: Identidade ────────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-foreground">Identidade e Perfil</h1>

              <p className="text-xs text-primary font-medium bg-primary/10 rounded-lg p-2 border border-primary/30">
                📸 Perfis com fotos são <strong>80% mais vistos</strong>.
              </p>

              {/* Photos */}
              <div className="grid grid-cols-2 gap-3">
                <ImagePicker
                  label="Foto de Perfil"
                  preview={avatarPreview}
                  onFile={(f) => handleImageFile(f, "avatar")}
                  aspect="square"
                  required
                  error={!avatarFile ? "Foto de perfil obrigatória" : null}
                />
                <ImagePicker
                  label="Foto de Banner"
                  preview={bannerPreview}
                  onFile={(f) => handleImageFile(f, "banner")}
                  aspect="wide"
                />
              </div>


              <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 border border-border/30">
                🔒 A validação 100% da conta exigirá confirmação de identidade posterior.
              </p>

              {/* Name */}
              <div className="space-y-1">
                <Label htmlFor="name">Seu nome real <span className="text-destructive">*</span></Label>
                <Input id="name" type="text" placeholder="Como você se chama?" value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`h-11 bg-muted/30 border-border/50 ${!name.trim() ? "" : ""}`}
                  maxLength={50}
                  aria-invalid={!name.trim()}
                />
                <p className="text-[10px] text-muted-foreground">
                  🔒 Não será visto por ninguém.
                </p>
                {!name.trim() && (
                  <p className="text-[11px] text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Informe seu nome real.
                  </p>
                )}
              </div>


              {/* Email */}
              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`h-11 bg-muted/30 border-border/50 ${emailError ? "border-destructive" : ""}`}
                  maxLength={100}
                  autoComplete="email"
                />
                {checkingEmail && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Verificando disponibilidade...
                  </p>
                )}
                {emailError && (
                  <p className="text-[11px] text-destructive">{emailError}</p>
                )}
              </div>

              {/* Username */}
              <div className="space-y-1">
                <Label htmlFor="username">Nome de usuário <span className="text-destructive">*</span></Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="ex: maria_silva"
                  value={username}
                  onChange={(e) => {
                    setUsernameTouched(true);
                    setUsername(slugifyUsername(e.target.value));
                  }}
                  className={`h-11 bg-muted/30 border-border/50 ${usernameError ? "border-destructive" : ""}`}
                  maxLength={30}
                  autoComplete="username"
                />
                <p className="text-[10px] text-muted-foreground">
                  👀 Este será o nome que todos vão ver. Apenas letras minúsculas, números e _ (3–30 caracteres).
                </p>
                {checkingUsername && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Verificando disponibilidade...
                  </p>
                )}
                {!checkingUsername && !usernameError && username && !isValidUsername(username) && (
                  <p className="text-[12px] font-semibold text-emerald-500 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Disponível
                  </p>
                )}
                {usernameError && (
                  <p className="text-[12px] font-semibold text-destructive flex items-center gap-1">
                    <X className="h-3.5 w-3.5" /> Não disponível
                    <span className="font-normal text-[11px] text-destructive/80 ml-1">
                      — escolha uma sugestão ou crie um novo:
                    </span>
                  </p>
                )}
                {loadingSuggestions && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Gerando sugestões...
                  </p>
                )}
                {usernameSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1.5 items-center">
                    {usernameSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setUsernameTouched(true);
                          setUsername(s);
                          setUsernameError(null);
                          setUsernameSuggestions([]);
                        }}
                        className="px-2.5 py-1 rounded-full text-[11px] bg-primary/15 border border-primary/40 text-primary active:scale-95 transition"
                      >
                        @{s}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setUsernameTouched(true);
                        setUsername("");
                        setUsernameError(null);
                        setUsernameSuggestions([]);
                        document.getElementById("username")?.focus();
                      }}
                      className="px-2.5 py-1 rounded-full text-[11px] bg-muted/40 border border-border text-foreground active:scale-95 transition"
                    >
                      ✏️ Criar o meu
                    </button>
                  </div>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="Mínimo 6 caracteres"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="h-11 bg-muted/30 border-border/50 pr-11" maxLength={50} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <Label htmlFor="passwordConfirm">Confirmar senha</Label>
                <div className="relative">
                  <Input
                    id="passwordConfirm"
                    type={showPasswordConfirm ? "text" : "password"}
                    placeholder="Repita a senha"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className={`h-11 bg-muted/30 border-border/50 pr-11 ${
                      passwordConfirm && passwordConfirm !== password ? "border-destructive" : ""
                    }`}
                    maxLength={50}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={showPasswordConfirm ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPasswordConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {passwordConfirm && passwordConfirm !== password && (
                  <p className="text-[11px] text-destructive">As senhas não coincidem.</p>
                )}
                {passwordConfirm && passwordConfirm === password && password.length >= 6 && (
                  <p className="text-[11px] text-emerald-500 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Senhas conferem
                  </p>
                )}
              </div>

              {/* Gender */}
              <div className="space-y-1">
                <Label>Você é <span className="text-destructive">*</span></Label>
                <div className="grid grid-cols-4 gap-2">
                  {genderOptions.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setGender(opt.value)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-colors ${
                        gender === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : !gender
                          ? "border-destructive/40 bg-destructive/5 text-muted-foreground"
                          : "border-border/50 bg-muted/30 text-muted-foreground"
                      }`} style={{ minHeight: 64 }}>
                      <span className="text-xl">{opt.icon}</span>
                      <span className="text-[10px] font-medium mt-0.5">{opt.label}</span>
                    </button>
                  ))}
                </div>
                {!gender && (
                  <p className="text-[11px] text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Selecione uma opção para continuar.
                  </p>
                )}
              </div>

              {gender === "other" && (
                <div className="space-y-1">
                  <Label htmlFor="genderOther">Como você se identifica? <span className="text-destructive">*</span></Label>
                  <Input id="genderOther" placeholder="Descreva..." value={genderOther}
                    onChange={(e) => setGenderOther(e.target.value)} className="h-11 bg-muted/30 border-border/50" maxLength={50} />
                  {!genderOther.trim() && (
                    <p className="text-[11px] text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Descreva como você se identifica.
                    </p>
                  )}
                </div>
              )}

              {/* Birth date */}
              <div className="space-y-1">
                <Label htmlFor="birthDate">
                  {gender === "couple" ? "Sua Data de Nascimento" : "Data de Nascimento"} <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="birthDate"
                    type="text"
                    inputMode="numeric"
                    placeholder="dd/mm/aaaa"
                    value={birthDateBR}
                    onChange={(e) => setBirthDateBR(maskBRDate(e.target.value))}
                    className={`h-11 bg-muted/30 border-border/50 pr-11 ${birthDateError || !birthDateBR ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    maxLength={10}
                    autoComplete="bday"
                    aria-invalid={!!birthDateError || !birthDateBR}
                  />
                  {/* Date picker nativo (mobile-friendly) */}
                  <input
                    type="date"
                    aria-label="Selecionar data no calendário"
                    max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().slice(0, 10)}
                    min="1900-01-01"
                    onChange={(e) => {
                      const iso = e.target.value; // yyyy-mm-dd
                      if (!iso) return;
                      const [y, m, d] = iso.split("-");
                      setBirthDateBR(`${d}/${m}/${y}`);
                    }}
                    className="absolute right-0 top-0 h-11 w-11 opacity-0 cursor-pointer"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground pointer-events-none"
                  >
                    <CalendarIcon className="h-4 w-4" />
                  </button>
                </div>
                {birthDateError ? (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {birthDateError}
                  </p>
                ) : birthDate && calcAge(birthDate) !== null ? (
                  <p className="text-[12px] font-semibold text-emerald-500 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" />
                    {calcAge(birthDate)} anos · Maior de idade — cadastro liberado
                  </p>
                ) : !birthDateBR ? (
                  <p className="text-[11px] text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Data de nascimento obrigatória (mínimo 18 anos).
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Mínimo 18 anos · Formato dd/mm/aaaa</p>
                )}
              </div>


              {/* Couple extra dates */}
              {gender === "couple" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Nasc. d'Ele</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="dd/mm/aaaa"
                      value={partnerBirth1BR}
                      onChange={(e) => setPartnerBirth1BR(maskBRDate(e.target.value))}
                      className={`h-11 bg-muted/30 border-border/50 ${partner1DateError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      maxLength={10}
                      aria-invalid={!!partner1DateError}
                    />
                    {partner1DateError && (
                      <p className="text-[11px] text-destructive">{partner1DateError}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Nasc. d'Ela</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="dd/mm/aaaa"
                      value={partnerBirth2BR}
                      onChange={(e) => setPartnerBirth2BR(maskBRDate(e.target.value))}
                      className={`h-11 bg-muted/30 border-border/50 ${partner2DateError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      maxLength={10}
                      aria-invalid={!!partner2DateError}
                    />
                    {partner2DateError && (
                      <p className="text-[11px] text-destructive">{partner2DateError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Consents */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Consentimentos (LGPD)</span>
                </div>

                {[
                  { key: "ageConfirmed" as keyof ConsentState, label: <><AlertTriangle className="inline h-3.5 w-3.5 text-destructive mr-1" />Declaro ter mais de <strong>18 anos</strong> (ECA Digital).</>, variant: "destructive" },
                  { key: "termsAccepted" as keyof ConsentState, label: <>Li e aceito os <Link to={TERMS_ROUTE} className="text-primary underline" target="_blank">Termos de Uso atualizados</Link> e a <Link to="/legal/privacidade" className="text-primary underline" target="_blank">Política de Privacidade</Link>.</>, variant: "destructive" },
                  { key: "dataProcessing" as keyof ConsentState, label: <>Consinto com o tratamento de dados conforme a <strong>LGPD</strong>.</>, variant: "muted" },
                  { key: "sensitiveData" as keyof ConsentState, label: <>Autorizo o tratamento de <strong>dados sensíveis</strong> (biometria e preferências).</>, variant: "primary" },
                  { key: "contentRules" as keyof ConsentState, label: <>Entendo que conteúdo <strong>ilegal</strong> resulta em banimento.</>, variant: "muted" },
                ].map(({ key, label, variant }) => (
                  <div key={key} className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${
                    variant === "destructive" ? "bg-destructive/8 border-destructive/20" :
                    variant === "primary" ? "bg-primary/5 border-primary/20" :
                    "bg-muted/20 border-border/40"
                  }`}>
                    <Checkbox id={key} checked={consents[key]}
                      onCheckedChange={(c) => setConsents(prev => ({ ...prev, [key]: c as boolean }))}
                      className="mt-0.5 shrink-0 data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    <Label htmlFor={key} className="text-xs cursor-pointer leading-relaxed">{label}</Label>
                  </div>
                ))}
              </div>

              {/* Resumo de pendências — tempo real */}
              {(() => {
                const missing: string[] = [];
                if (!avatarFile) missing.push("Foto de perfil");
                if (!name.trim()) missing.push("Seu nome real");
                if (!email.trim()) missing.push("E-mail");
                else if (emailError) missing.push("E-mail válido");
                if (!username.trim()) missing.push("Nome de usuário");
                else if (isValidUsername(username) || usernameError) missing.push("Nome de usuário válido");
                if (!password || password.length < 6) missing.push("Senha (mín. 6)");
                if (password && passwordConfirm !== password) missing.push("Confirmação de senha");
                if (!birthDateBR || birthDateError) missing.push("Data de nascimento (+18)");
                if (!gender) missing.push("Você é (gênero/tipo)");
                if (gender === "other" && !genderOther.trim()) missing.push("Como você se identifica");
                if (!allConsentsGiven) missing.push("Aceite dos consentimentos");
                if (missing.length === 0) return null;
                return (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5">
                    <p className="text-[12px] font-semibold text-destructive flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Falta preencher para continuar:
                    </p>
                    <ul className="list-disc list-inside text-[11px] text-destructive/90 space-y-0.5">
                      {missing.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  </div>
                );
              })()}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/')} className="h-11 px-4 border-border/50">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  onClick={goNext}
                  disabled={
                    !avatarFile ||
                    !name.trim() ||
                    !birthDateBR ||
                    !!birthDateError ||
                    !gender ||
                    (gender === "other" && !genderOther.trim()) ||
                    !allConsentsGiven ||
                    checkingEmail ||
                    checkingUsername ||
                    !!emailError ||
                    !!usernameError ||
                    !email.trim() ||
                    !username.trim() ||
                    !!isValidUsername(username) ||
                    !password || password.length < 6 ||
                    passwordConfirm !== password
                  }
                  className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                  {(checkingEmail || checkingUsername) ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Verificando...</>
                  ) : (
                    <>Continuar <ChevronRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>

              </div>


              <p className="text-center text-xs text-muted-foreground">
                Já tem conta?{" "}
                <Link to="/login" className="text-primary font-medium">Entrar</Link>
              </p>
            </div>
          )}

          {/* ── STEP 2: Localização ───────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-foreground">Localização</h1>
              <p className="text-xs text-muted-foreground">Usada para o Radar e distâncias. Seus dados são privados.</p>

              {/* CEP */}
              <div className="space-y-1">
                <Label htmlFor="cep">CEP *</Label>
                <div className="flex gap-2">
                  <Input id="cep" placeholder="00000000" value={cep}
                    onChange={(e) => setCep(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    onBlur={() => fetchCep(cep)}
                    aria-invalid={!!step2Errors.cep}
                    className={`h-11 bg-muted/30 flex-1 ${step2Errors.cep ? "border-destructive ring-1 ring-destructive/40" : "border-border/50"}`} maxLength={8} />
                  <Button variant="outline" onClick={() => fetchCep(cep)}
                    disabled={cepLoading || cep.replace(/\D/g, "").length !== 8}
                    className="h-11 px-3 shrink-0">
                    {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {step2Errors.cep && (
                  <p className="text-[11px] text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {step2Errors.cep}</p>
                )}
              </div>

              {/* Endereço (auto + manual) */}
              <div className="space-y-3">
                {(street || neighborhood || city || uf) && (
                  <div className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-1">
                    {street && <p className="text-sm text-foreground">{street}</p>}
                    {neighborhood && <p className="text-xs text-muted-foreground">{neighborhood}</p>}
                    <p className="text-xs font-medium text-foreground">{city}{uf ? ` – ${uf}` : ""}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="street">Rua / Logradouro *</Label>
                    <Input
                      id="street"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Rua das Flores"
                      aria-invalid={!!step2Errors.street}
                      className={`h-11 bg-muted/30 ${step2Errors.street ? "border-destructive ring-1 ring-destructive/40" : "border-border/50"}`}
                    />
                    {step2Errors.street && (
                      <p className="text-[11px] text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {step2Errors.street}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="neighborhood">Bairro *</Label>
                    <Input
                      id="neighborhood"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Centro"
                      aria-invalid={!!step2Errors.neighborhood}
                      className={`h-11 bg-muted/30 ${step2Errors.neighborhood ? "border-destructive ring-1 ring-destructive/40" : "border-border/50"}`}
                    />
                    {step2Errors.neighborhood && (
                      <p className="text-[11px] text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {step2Errors.neighborhood}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="city">Cidade *</Label>
                      <Input
                        id="city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="São Paulo"
                        aria-invalid={!!step2Errors.city}
                        className={`h-11 bg-muted/30 ${step2Errors.city ? "border-destructive ring-1 ring-destructive/40" : "border-border/50"}`}
                      />
                      {step2Errors.city && (
                        <p className="text-[11px] text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {step2Errors.city}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="uf">Estado *</Label>
                      <Input
                        id="uf"
                        value={uf}
                        onChange={(e) => setUf(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                        placeholder="SP"
                        maxLength={2}
                        aria-invalid={!!step2Errors.uf}
                        className={`h-11 bg-muted/30 ${step2Errors.uf ? "border-destructive ring-1 ring-destructive/40" : "border-border/50"}`}
                      />
                      {step2Errors.uf && (
                        <p className="text-[11px] text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {step2Errors.uf}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {step2Errors.gps && (
                <p className="text-[11px] text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {step2Errors.gps}</p>
              )}

              {/* Aviso de privacidade do GPS */}
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1.5">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Por que pedimos sua localização?
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Usamos seu GPS apenas para te aproximar de pessoas e conexões reais por perto, facilitando encontros seguros.
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">Sua localização exata nunca é compartilhada</strong> com outros usuários — exibimos apenas uma <strong className="text-foreground">região aproximada</strong> (cidade/bairro). Os dados são protegidos conforme a LGPD.
                </p>
              </div>

              {/* GPS */}
              <div className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Navigation className="h-4 w-4 text-green-400" />
                      Validar via GPS <span className="text-destructive">*</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Obrigatório para criar a conta. O GPS deve estar a menos de {MAX_KM} km do CEP informado.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleGetGPS} disabled={gpsLoading}
                    className={`shrink-0 h-9 ${gpsCoords ? "border-green-500/50 text-green-400" : ""}`}>
                    {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
                      gpsCoords ? <><Check className="h-3.5 w-3.5 mr-1" />OK</> :
                      <><Navigation className="h-3.5 w-3.5 mr-1" />Usar GPS</>}
                  </Button>
                </div>

                {gpsCoords && (
                  <div className="text-xs p-2.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 space-y-1">
                    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-green-400/80 font-semibold">
                      <MapPin className="h-3 w-3" /> Local detectado
                    </p>
                    {gpsAddress ? (
                      <p className="font-medium leading-snug">{gpsAddress}</p>
                    ) : (
                      <p className="italic text-green-400/70">Endereço não retornado pelo provedor.</p>
                    )}
                    <p className="text-green-400/90">
                      CEP:{" "}
                      {gpsCep ? (
                        <span className="font-mono font-semibold">
                          {gpsCep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}
                        </span>
                      ) : (
                        <span className="italic text-green-400/60">não disponível neste ponto — preencha o CEP manualmente acima.</span>
                      )}
                    </p>
                    <p className="font-mono text-[11px] text-green-400/70">
                      {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}
                    </p>
                    {(street || city) && (
                      <p className="text-[11px] text-green-400/80 pt-0.5 border-t border-green-500/20 mt-1">
                        ✓ Campos de endereço preenchidos automaticamente.
                      </p>
                    )}
                  </div>
                )}

                {distanceKm !== null && (
                  <div className={`flex items-center gap-2 text-xs p-2 rounded-md ${
                    distanceKm <= MAX_KM ? "bg-green-500/10 text-green-400" : "bg-destructive/10 text-destructive"
                  }`}>
                    {distanceKm <= MAX_KM
                      ? <><Check className="h-3.5 w-3.5 shrink-0" /> Distância OK — {distanceKm.toFixed(1)} km do CEP</>
                      : <><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Muito longe — {distanceKm.toFixed(1)} km (máx. {MAX_KM} km)</>}
                  </div>
                )}

                {/* Fallback de coordenada do CEP — confirmação visual quando o usuário aceitou usar a aproximação */}
                {usingCepFallback && gpsCoords && (
                  <div className="text-[11px] p-2 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      Você está usando a <strong>localização aproximada do CEP</strong> ({cepCoords ? `${cepCoords.lat.toFixed(4)}, ${cepCoords.lng.toFixed(4)}` : '—'}).
                      Funcionalidades baseadas em proximidade serão limitadas até você liberar o GPS nas configurações.
                    </span>
                  </div>
                )}

                {/* Painel de ajuda contextual quando o GPS falha — instruções específicas + fallback do CEP */}
                {gpsErrorKind && !gpsCoords && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 space-y-2 text-xs text-destructive">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {gpsErrorKind === 'denied' && 'Permissão de localização bloqueada'}
                      {gpsErrorKind === 'unavailable' && 'Sinal de GPS indisponível'}
                      {gpsErrorKind === 'timeout' && 'O GPS demorou demais para responder'}
                      {gpsErrorKind === 'insecure' && 'Conexão não segura (HTTP)'}
                      {gpsErrorKind === 'unsupported' && 'GPS não suportado neste navegador'}
                    </p>
                    {gpsErrorDetail && (
                      <p className="text-destructive/90 leading-snug">{gpsErrorDetail}</p>
                    )}

                    {gpsErrorKind === 'denied' && (
                      <div className="space-y-1.5 text-destructive/80">
                        <p className="font-semibold text-destructive">Como liberar:</p>
                        <ul className="list-disc pl-4 space-y-1 leading-snug">
                          <li><strong>iPhone / Safari:</strong> Ajustes &gt; Safari &gt; Localização &gt; <em>Perguntar</em> ou <em>Permitir</em>. Depois feche e abra o site de novo.</li>
                          <li><strong>iPhone / Chrome:</strong> Ajustes &gt; Chrome &gt; Localização &gt; <em>Permitir</em>. Em seguida toque no cadeado ao lado do endereço e libere.</li>
                          <li><strong>Android / Chrome:</strong> toque no <em>cadeado</em> ao lado do endereço &gt; Permissões &gt; Localização &gt; <em>Permitir</em>. Verifique também se a localização do aparelho está ligada.</li>
                          <li><strong>Modo anônimo / privado:</strong> muitos navegadores bloqueiam GPS por padrão — abra o site em uma aba normal.</li>
                        </ul>
                      </div>
                    )}

                    {gpsErrorKind === 'unavailable' && (
                      <p className="text-destructive/80 leading-snug">
                        Vá para um ambiente aberto (perto de uma janela ou ao ar livre) e tente de novo. Verifique também se a localização do aparelho está ligada nas configurações do sistema.
                      </p>
                    )}

                    {gpsErrorKind === 'timeout' && (
                      <p className="text-destructive/80 leading-snug">
                        Toque novamente em <strong>Usar GPS</strong>. Em ambientes fechados ou com sinal fraco a primeira tentativa pode demorar mais.
                      </p>
                    )}

                    {gpsErrorKind === 'insecure' && (
                      <p className="text-destructive/80 leading-snug">
                        Abra o site pela versão segura em <code className="font-mono">https://</code> — o navegador não permite GPS fora de HTTPS.
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleGetGPS}
                        disabled={gpsLoading}
                        className="h-9 border-destructive/40 text-destructive hover:bg-destructive/15"
                      >
                        {gpsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Navigation className="h-3.5 w-3.5 mr-1" />}
                        Tentar GPS novamente
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleUseCepAsLocation}
                        disabled={!cepCoords}
                        className="h-9 bg-amber-500 hover:bg-amber-500/90 text-amber-950 font-semibold"
                        title={cepCoords ? 'Usar coordenadas aproximadas do CEP' : 'Preencha um CEP válido para liberar esta opção'}
                      >
                        <MapPin className="h-3.5 w-3.5 mr-1" />
                        Usar localização aproximada do CEP
                      </Button>
                    </div>
                    {!cepCoords && (
                      <p className="text-[11px] text-destructive/70 italic">
                        Para liberar a opção acima, informe um CEP válido no campo acima.
                      </p>
                    )}
                  </div>
                )}
              </div>


              {/* Prévia + confirmação obrigatória de Cidade/UF antes de avançar */}
              {city.trim() && uf.trim() && gpsCoords && (
                <div className={`rounded-lg border p-3 space-y-2 ${
                  step2Errors.confirm
                    ? "border-destructive/60 bg-destructive/10 ring-1 ring-destructive/30"
                    : addressConfirmed
                      ? "border-green-500/40 bg-green-500/5"
                      : "border-primary/40 bg-primary/5"
                }`}>
                  <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                    Confirme seu endereço
                  </p>
                  <div className="text-sm">
                    <p className="font-semibold text-foreground">
                      {city.trim()}/{uf.trim().toUpperCase()}
                    </p>
                    {(street || neighborhood) && (
                      <p className="text-xs text-muted-foreground leading-snug">
                        {[street, neighborhood].filter(Boolean).join(" — ")}
                      </p>
                    )}
                    {cep && (
                      <p className="text-[11px] font-mono text-muted-foreground">
                        CEP {cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}
                      </p>
                    )}
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={addressConfirmed}
                      onCheckedChange={(v) => setAddressConfirmed(v === true)}
                      aria-label="Confirmar cidade e estado"
                    />
                    <span className="text-xs leading-snug">
                      Confirmo que <strong>{city.trim()}/{uf.trim().toUpperCase()}</strong> é a minha cidade/estado corretos.
                    </span>
                  </label>
                  {step2Errors.confirm && (
                    <p className="text-[11px] text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {step2Errors.confirm}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={goBack} className="h-11 px-4">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  onClick={goNext}
                  disabled={!!validateStep2()}
                  className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continuar <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Interesses ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-foreground">Tags de Interesse</h1>
              <p className="text-xs text-muted-foreground">Selecione o que combina com você para o sistema de compatibilidade.</p>

              <Tabs defaultValue="social" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="social" className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    Sociais
                    <span className="ml-1 text-[10px] opacity-70">({socialTags.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="adult" className="flex items-center gap-1.5">
                    <span className="text-destructive font-semibold">+18</span>
                    Adulto
                    <span className="ml-1 text-[10px] opacity-70">({adultTags.length})</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="social" className="mt-3">
                  <div className="flex flex-wrap gap-2 max-h-[55vh] overflow-y-auto scrollbar-hide overscroll-contain pr-1">
                    {SOCIAL_TAGS.map((tag) => (
                      <TagChip key={tag} label={tag} icon={SOCIAL_TAG_ICONS[tag] || "🏷️"}
                        selected={socialTags.includes(tag)}
                        onToggle={() => setSocialTags(prev =>
                          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        )} />
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="adult" className="mt-3">
                  <div className="flex flex-wrap gap-2 max-h-[55vh] overflow-y-auto scrollbar-hide overscroll-contain pr-1">
                    {ADULT_TAGS.map((tag) => (
                      <TagChip key={tag} label={tag} icon={ADULT_TAG_ICONS[tag] || "🔥"}
                        selected={adultTags.includes(tag)}
                        onToggle={() => setAdultTags(prev =>
                          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        )} />
                    ))}
                  </div>
                </TabsContent>
              </Tabs>


              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={goBack} className="h-12 px-4">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button onClick={goNext}
                  className="flex-1 h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  Avançar <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                As tags podem ser alteradas depois em Configurações.
              </p>
            </div>
          )}

          {/* ── STEP 4: Preferências de Visualização do Feed ─────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-foreground">Preferência do Feed</h1>
              <p className="text-xs text-muted-foreground">
                Escolha quais tipos de perfis devem aparecer no seu feed. Você pode marcar mais de uma opção e alterar a qualquer momento em <strong>Configurações → Experiência</strong>.
              </p>

              <div className="grid grid-cols-2 gap-2">
                {FEED_GENDER_CATEGORY_DEFS.map((def) => {
                  const Icon = def.icon;
                  const selected = feedFilterCategories.includes(def.key);
                  return (
                    <button
                      key={def.key}
                      type="button"
                      onClick={() =>
                        setFeedFilterCategories((prev) =>
                          prev.includes(def.key)
                            ? prev.filter((k) => k !== def.key)
                            : [...prev, def.key]
                        )
                      }
                      className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-colors ${
                        selected
                          ? "bg-primary/15 border-primary text-foreground"
                          : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50"
                      }`}
                      aria-pressed={selected}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Icon className={`h-4 w-4 ${def.accent}`} />
                        <span className="text-sm font-semibold flex-1">{def.label}</span>
                        {selected && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <span className="text-[10px] leading-snug text-muted-foreground">
                        {def.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-2 border border-border/30">
                💡 Você pode alterar esta seleção a qualquer momento nas Configurações.
              </p>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={goBack} className="h-12 px-4">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button onClick={handleSubmit} disabled={isLoading}
                  className="flex-1 h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Concluir e Entrar 🎉"}
                </Button>
              </div>

              <div className="pt-2 border-t border-border/50 space-y-2">
                <p className="text-xs text-muted-foreground text-center">
                  📱 Acesso rápido: instale o app na sua tela inicial (opcional)
                </p>
                <div className="flex gap-2">
                  <InstallAppButton
                    variant="outline"
                    size="sm"
                    label="Instalar agora"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      try { localStorage.setItem("oculto_pwa_autoprompt_shown_v1", "1"); } catch { /* ignore */ }
                    }}
                  >
                    Pular
                  </Button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modals (lazy: only mount when actually opened) */}
      {showLivenessModal && (
        <Suspense fallback={null}>
          <LivenessCheckModal
            open={showLivenessModal}
            onOpenChange={(open) => { if (!open) handleLivenessCancel(); }}
            onSuccess={handleLivenessSuccess}
            onFailure={handleLivenessCancel}
          />
        </Suspense>
      )}
      {showSubscriptionModal && (
        <Suspense fallback={null}>
          <SubscriptionModal
            open={showSubscriptionModal}
            onOpenChange={setShowSubscriptionModal}
            onSubscribe={handleSubscriptionComplete}
          />
        </Suspense>
      )}
    </div>
  );
});

Signup.displayName = "Signup";
export default Signup;
