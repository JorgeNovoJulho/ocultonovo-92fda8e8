/**
 * CompletarCadastroPage — wizard de 4 passos para perfis vindos do Google OAuth
 * (ou qualquer perfil sem dados mínimos).
 *
 * Passos:
 *  1. Identidade   — username, nome, data nasc (+18), gênero, consentimentos
 *  2. Localização  — CEP + GPS (igual ao Signup padrão)
 *  3. Interesses   — tags sociais (mín. 5) e adultas (mín. 1)
 *  4. Preferências — categorias de feed (mín. 1)
 *
 * Ao final faz um único upsert em `profiles` com onboarding_completed=true.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, ShieldCheck, ChevronLeft, ChevronRight, Check, Search, Navigation,
  MapPin, AlertTriangle, Tag, Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { saveTermsConsent } from '@/lib/termsConsent';
import { useInterestTags } from '@/hooks/useInterestTags';
import { FEED_GENDER_CATEGORY_DEFS, type FeedGenderCategory } from '@/config/feedGenderFilter';
import { isValidUsername, slugifyUsername, checkAvailability } from '@/lib/signupAvailability';

// ───────── Helpers ─────────
const GENDERS = [
  { value: 'man',    label: 'Homem',  icon: '👨' },
  { value: 'woman',  label: 'Mulher', icon: '👩' },
  { value: 'couple', label: 'Casal',  icon: '👫' },
  { value: 'other',  label: 'Outro',  icon: '🌈' },
];
const STEPS = ['Identidade', 'Localização', 'Interesses', 'Preferências'];
const MAX_KM = 5;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function maskBRDate(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
  return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
}
function brToIso(br: string): string {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  const d = parseInt(dd, 10), mo = parseInt(mm, 10), y = parseInt(yyyy, 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) return '';
  const dt = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (isNaN(dt.getTime()) || dt.getUTCDate() !== d || dt.getUTCMonth()+1 !== mo) return '';
  return `${yyyy}-${mm}-${dd}`;
}
function calcAge(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const mm = t.getMonth() - d.getMonth();
  if (mm < 0 || (mm === 0 && t.getDate() < d.getDate())) age--;
  return age;
}

// ───────── Step bar ─────────
function StepBar({ current, onStepClick }: { current: number; onStepClick: (i: number) => void }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1">
          <button
            type="button"
            onClick={() => onStepClick(i)}
            className="flex flex-col items-center gap-1 flex-1 cursor-pointer focus:outline-none rounded-md"
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i < current ? 'bg-primary text-primary-foreground'
                : i === current ? 'bg-primary text-primary-foreground ring-2 ring-primary/40'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}>
              {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-[10px] font-medium ${i === current ? 'text-primary' : 'text-muted-foreground'}`}>
              {label}
            </span>
          </button>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${i < current ? 'bg-primary' : 'bg-muted/40'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ───────── Tag chip ─────────
function TagChip({ label, icon, selected, onToggle }: { label: string; icon: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{ minHeight: 44 }}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-colors active:scale-95 ${
        selected ? 'bg-primary/20 border-primary text-primary' : 'bg-muted/30 border-border/50 text-muted-foreground'
      }`}
    >
      <span>{icon}</span><span>{label}</span>
    </button>
  );
}

// ───────── Main ─────────
export default function CompletarCadastroPage() {
  const { user, authReady, signOut } = useAuth();
  const navigate = useNavigate();

  if (authReady && user) return <Navigate to="/feed" replace />;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Step 1 — Identidade
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle'|'checking'|'ok'|'taken'|'invalid'>('idle');
  const [name, setName] = useState('');
  const [birthDateBR, setBirthDateBR] = useState('');
  const birthDate = useMemo(() => brToIso(birthDateBR), [birthDateBR]);
  const age = useMemo(() => calcAge(birthDate), [birthDate]);
  const [gender, setGender] = useState('');
  const [genderOther, setGenderOther] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptAdult, setAcceptAdult] = useState(false);
  const [acceptContent, setAcceptContent] = useState(false);

  // Foto de perfil obrigatória (Google OAuth pode trazer, mas exigimos confirmação/upload)
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarExistingUrl, setAvatarExistingUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Step 2 — Localização
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [uf, setUf] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepCoords, setCepCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string | null>(null);
  const [gpsErrorKind, setGpsErrorKind] = useState<null|'denied'|'unavailable'|'timeout'|'insecure'|'unsupported'>(null);
  const [gpsErrorDetail, setGpsErrorDetail] = useState<string | null>(null);
  const [usingCepFallback, setUsingCepFallback] = useState(false);
  const gpsBusy = useRef(false);

  // Step 3 — Interesses
  const [socialTags, setSocialTags] = useState<string[]>([]);
  const [adultTags, setAdultTags] = useState<string[]>([]);
  const {
    socialTags: SOCIAL_TAGS,
    adultTags: ADULT_TAGS,
    socialIcons: SOCIAL_TAG_ICONS,
    adultIcons: ADULT_TAG_ICONS,
  } = useInterestTags();

  // Step 4 — Preferências
  const [feedFilterCategories, setFeedFilterCategories] = useState<FeedGenderCategory[]>([]);

  // ─── Carrega dados existentes do perfil ───
  useEffect(() => {
    if (!authReady) return;
    if (!user) { navigate('/login', { replace: true }); return; }
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('profiles')
          .select('username,name,avatar_url,birth_date,gender,gender_other,terms_accepted_at,privacy_accepted_at,adult_confirmed_at,address_cep,address_street,address_neighborhood,address_city,address_state,location_lat,location_lng,tags_social,tags_adult,feed_filter_categories')
          .eq('id', user.id).maybeSingle();
        if (data) {
          setUsername(data.username ?? '');
          setName(data.name ?? (user.user_metadata?.name ?? user.user_metadata?.full_name ?? ''));
          if (data.birth_date) {
            const [y,m,d] = String(data.birth_date).split('-');
            if (y && m && d) setBirthDateBR(`${d}/${m}/${y}`);
          }
          setGender(data.gender ?? '');
          setGenderOther(data.gender_other ?? '');
          setAcceptTerms(!!data.terms_accepted_at);
          setAcceptPrivacy(!!data.privacy_accepted_at);
          setAcceptAdult(!!data.adult_confirmed_at);
          setCep(data.address_cep ?? '');
          setStreet(data.address_street ?? '');
          setNeighborhood(data.address_neighborhood ?? '');
          setCity(data.address_city ?? '');
          setUf(data.address_state ?? '');
          if (data.location_lat && data.location_lng) {
            setGpsCoords({ lat: data.location_lat, lng: data.location_lng });
          }
          setSocialTags(Array.isArray(data.tags_social) ? data.tags_social : []);
          setAdultTags(Array.isArray(data.tags_adult) ? data.tags_adult : []);
          setFeedFilterCategories(Array.isArray(data.feed_filter_categories) ? data.feed_filter_categories : []);
          if (data.avatar_url) setAvatarExistingUrl(data.avatar_url as string);
        } else {
          setName((user.user_metadata as any)?.name ?? (user.user_metadata as any)?.full_name ?? '');
          // OAuth do Google traz picture; usamos como prévia mas exigimos upload explícito
          const oauthPic = (user.user_metadata as any)?.avatar_url || (user.user_metadata as any)?.picture;
          if (oauthPic) setAvatarExistingUrl(oauthPic);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [authReady, user, navigate]);

  // ─── Auto-slug do username a partir do nome ───
  useEffect(() => {
    if (!usernameTouched && name && !username) setUsername(slugifyUsername(name));
  }, [name, usernameTouched, username]);

  // ─── Debounced username check ───
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) { setUsernameStatus('idle'); return; }
    if (isValidUsername(u)) { setUsernameStatus('invalid'); return; }
    setUsernameStatus('checking');
    const t = window.setTimeout(async () => {
      try {
        const { username_taken } = await checkAvailability('', u);
        // permite manter o próprio username já gravado
        const { data: own } = await (supabase as any).from('profiles').select('id').eq('id', user?.id ?? '').eq('username', u).maybeSingle();
        setUsernameStatus(username_taken && !own ? 'taken' : 'ok');
      } catch { setUsernameStatus('ok'); }
    }, 450);
    return () => window.clearTimeout(t);
  }, [username, user?.id]);

  // ─── CEP autocompletar ───
  const fetchCep = useCallback(async (raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error('CEP não encontrado'); return; }
      setStreet(data.logradouro || ''); setNeighborhood(data.bairro || '');
      setCity(data.localidade || ''); setUf(data.uf || '');
      try {
        const geo = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${cleaned}&country=BR&format=json&limit=1`, { headers: { 'Accept-Language': 'pt-BR' } });
        const gd = await geo.json();
        if (gd?.[0]) setCepCoords({ lat: parseFloat(gd[0].lat), lng: parseFloat(gd[0].lon) });
      } catch { /* non-blocking */ }
      toast.success(`Endereço: ${data.localidade} – ${data.uf}`);
    } catch { toast.error('Busca de CEP falhou. Preencha manualmente.'); }
    finally { setCepLoading(false); }
  }, []);

  // ─── GPS ───
  const handleGetGPS = useCallback(() => {
    if (gpsBusy.current) return;
    if (!('geolocation' in navigator)) {
      setGpsErrorKind('unsupported'); setGpsErrorDetail('Navegador sem geolocalização.'); return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setGpsErrorKind('insecure'); setGpsErrorDetail('Esta página precisa estar em HTTPS.'); return;
    }
    gpsBusy.current = true; setGpsLoading(true); setGpsErrorKind(null); setGpsErrorDetail(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        gpsBusy.current = false; setGpsLoading(false);
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsCoords(coords); setUsingCepFallback(false);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&accept-language=pt-BR&addressdetails=1`);
          const data = await res.json();
          if (data?.address) {
            const a = data.address;
            const road = a.road || a.pedestrian || '';
            const suburb = a.suburb || a.neighbourhood || '';
            const cityName = a.city || a.town || a.village || '';
            const stateName = a.state_code || a.state || '';
            const postcode = a.postcode ? String(a.postcode).replace(/\D/g, '') : '';
            setGpsAddress([road, suburb, cityName, stateName].filter(Boolean).join(', '));
            if (road && !street) setStreet(road);
            if (suburb && !neighborhood) setNeighborhood(suburb);
            if (cityName && !city) setCity(cityName);
            if (stateName && !uf) setUf((stateName.length === 2 ? stateName : (a.state_code || '')).toUpperCase().slice(0,2));
            if (postcode && !cep) setCep(postcode.slice(0,8));
          }
        } catch { /* ignore */ }
        toast.success('Localização GPS obtida!');
      },
      (err) => {
        gpsBusy.current = false; setGpsLoading(false);
        const kind = err.code === 1 ? 'denied' : err.code === 2 ? 'unavailable' : 'timeout';
        setGpsErrorKind(kind);
        setGpsErrorDetail(err.message || 'Falha ao obter GPS.');
        toast.error('Não foi possível obter o GPS');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [cep, city, neighborhood, street, uf]);

  const handleUseCepAsLocation = useCallback(() => {
    if (!cepCoords) { toast.error('Preencha um CEP válido primeiro'); return; }
    setGpsCoords(cepCoords); setUsingCepFallback(true); setGpsErrorKind(null);
    setGpsAddress('Localização aproximada do CEP informado');
    toast.success('Usando localização aproximada do CEP');
  }, [cepCoords]);

  const distanceKm = gpsCoords && cepCoords ? haversineKm(gpsCoords.lat, gpsCoords.lng, cepCoords.lat, cepCoords.lng) : null;

  // ─── Validações ───
  const allConsents = acceptTerms && acceptPrivacy && acceptAdult && acceptContent;
  const validateStep1 = (): string | null => {
    const u = username.trim().toLowerCase();
    if (!u) return 'Informe um nome de usuário.';
    if (isValidUsername(u)) return isValidUsername(u);
    if (usernameStatus === 'taken') return 'Nome de usuário já em uso.';
    if (usernameStatus === 'checking') return 'Aguarde a verificação do usuário...';
    if (name.trim().length < 2) return 'Informe seu nome.';
    if (!birthDateBR || !birthDate) return 'Data de nascimento inválida.';
    if ((age ?? 0) < 18) return 'É necessário ter 18 anos ou mais.';
    if (!gender) return 'Selecione seu gênero.';
    if (gender === 'other' && !genderOther.trim()) return 'Descreva como você se identifica.';
    if (!avatarFile && !avatarExistingUrl) return 'Foto de perfil é obrigatória.';
    if (!allConsents) return 'Aceite todos os consentimentos.';
    return null;
  };
  const validateStep2 = (): string | null => {
    if (cep.replace(/\D/g, '').length !== 8) return 'CEP inválido.';
    if (!street.trim() || !neighborhood.trim() || !city.trim() || !uf.trim()) return 'Preencha rua, bairro, cidade e estado.';
    if (!gpsCoords) return 'Valide via GPS ou use a localização aproximada do CEP.';
    if (!usingCepFallback && distanceKm !== null && distanceKm > MAX_KM)
      return `GPS está a ${distanceKm.toFixed(1)} km do CEP (máx ${MAX_KM} km).`;
    return null;
  };
  const validateStep3 = (): string | null => {
    if (socialTags.length < 5) return 'Selecione no mínimo 5 interesses sociais.';
    if (adultTags.length < 1) return 'Selecione no mínimo 1 interesse adulto.';
    return null;
  };
  const validateStep4 = (): string | null => {
    if (feedFilterCategories.length < 1) return 'Selecione no mínimo 1 preferência de feed.';
    return null;
  };

  const goNext = () => {
    const err = step === 0 ? validateStep1() : step === 1 ? validateStep2() : step === 2 ? validateStep3() : null;
    if (err) { toast.error(err); return; }
    setStep(s => Math.min(3, s + 1));
  };
  const goBack = () => setStep(s => Math.max(0, s - 1));

  // ─── Submit final ───
  const handleSubmit = async () => {
    const err4 = validateStep4();
    if (err4) { toast.error(err4); return; }
    const err3 = validateStep3();
    if (err3) { toast.error(err3); setStep(2); return; }
    const err2 = validateStep2();
    if (err2) { toast.error(err2); setStep(1); return; }
    const err1 = validateStep1();
    if (err1) { toast.error(err1); setStep(0); return; }
    if (!user) return;

    setSaving(true);
    try {
      // Guard final — bloqueia conclusão sem foto/cidade/GPS
      if (!city.trim() || !uf.trim()) {
        toast.error('Endereço incompleto (cidade/estado).'); setStep(1); return;
      }
      if (!gpsCoords?.lat || !gpsCoords?.lng) {
        toast.error('GPS obrigatório para concluir.'); setStep(1); return;
      }

      // Upload do avatar (com retry x3) — obrigatório se não houver URL prévia
      let avatarUrlFinal: string | null = avatarExistingUrl;
      if (avatarFile) {
        setUploadingAvatar(true);
        let lastErr: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const ext = (avatarFile.name.split('.').pop() || 'jpg').toLowerCase();
            const path = `${user.id}/avatar_${Date.now()}.${ext}`;
            const { error: upErr } = await (supabase as any).storage
              .from('avatars').upload(path, avatarFile, { upsert: true, contentType: avatarFile.type || 'image/jpeg' });
            if (upErr) { lastErr = upErr; }
            else {
              const { data: { publicUrl } } = (supabase as any).storage.from('avatars').getPublicUrl(path);
              avatarUrlFinal = publicUrl; break;
            }
          } catch (e) { lastErr = e; }
          if (attempt < 3) await new Promise(r => setTimeout(r, 1200 * attempt));
        }
        setUploadingAvatar(false);
        if (!avatarUrlFinal) {
          toast.error('Falha ao enviar a foto de perfil. Tente novamente.');
          setStep(0); return;
        }
      }
      if (!avatarUrlFinal) {
        toast.error('Foto de perfil é obrigatória.'); setStep(0); return;
      }

      const now = new Date().toISOString();
      const chosenUsername = slugifyUsername(username);
      const payload: Record<string, any> = {
        id: user.id,
        user_id: user.id,
        username: chosenUsername,
        name: name.trim(),
        birth_date: birthDate,
        gender,
        ...(gender === 'other' ? { gender_other: genderOther.trim() } : {}),
        avatar_url: avatarUrlFinal,
        avatar_is_placeholder: false,
        address_cep: cep.replace(/\D/g, ''),
        address_street: street.trim(),
        address_neighborhood: neighborhood.trim(),
        address_city: city.trim(),
        address_state: uf.trim(),
        address_lat: gpsCoords.lat,
        address_lng: gpsCoords.lng,
        address_verified: true,
        location_lat: gpsCoords.lat,
        location_lng: gpsCoords.lng,
        tags_social: socialTags,
        tags_adult: adultTags,
        feed_filter_categories: feedFilterCategories,
        feed_filter_chosen_at: now,
        feed_filter_prompt_required: false,
        terms_accepted_at: now,
        privacy_accepted_at: now,
        adult_confirmed_at: now,
        onboarding_completed: true,
        updated_at: now,
      };
      const { error } = await (supabase as any).from('profiles').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      saveTermsConsent('signup-google');
      toast.success('Cadastro concluído. Bem-vindo ao Oculto!');
      navigate('/feed', { replace: true });
    } catch (err: any) {
      console.error('[CompletarCadastro] erro:', err);
      toast.error(err?.message || 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-dvh bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-dvh bg-background flex items-start justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <ShieldCheck className="h-10 w-10 text-primary mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Complete seu cadastro</h1>
          <p className="text-sm text-muted-foreground">Em 4 passos rápidos você libera o Oculto.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <StepBar current={step} onStepClick={(i) => setStep(i)} />

          {/* ── STEP 1 — Identidade ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuário (@)</Label>
                <Input
                  id="username" value={username}
                  onChange={(e) => { setUsernameTouched(true); setUsername(e.target.value.toLowerCase().replace(/\s/g, '')); }}
                  placeholder="seu_nick" maxLength={20}
                />
                {usernameStatus === 'invalid' && <p className="text-xs text-destructive">3–20 caracteres, letras, números ou _</p>}
                {usernameStatus === 'taken' && <p className="text-xs text-destructive">Já em uso.</p>}
                {usernameStatus === 'ok' && <p className="text-xs text-emerald-500">Disponível.</p>}
                {usernameStatus === 'checking' && <p className="text-xs text-muted-foreground">Verificando...</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome de exibição</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como você quer aparecer" maxLength={60} />
              </div>

              {/* Foto de perfil OBRIGATÓRIA */}
              <div className="space-y-2">
                <Label>Foto de perfil *</Label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full overflow-hidden border border-border bg-muted/30 flex items-center justify-center shrink-0">
                    {(avatarPreview || avatarExistingUrl) ? (
                      <img src={avatarPreview || avatarExistingUrl!} alt="Foto" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-muted-foreground text-center px-1">Sem foto</span>
                    )}
                  </div>
                  <label className="flex-1 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        if (!f) return;
                        if (f.size > 10 * 1024 * 1024) { toast.error('Imagem muito grande (máx 10MB).'); return; }
                        if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return; }
                        setAvatarFile(f);
                        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                        setAvatarPreview(URL.createObjectURL(f));
                      }}
                    />
                    <span className="inline-flex items-center justify-center w-full h-11 px-3 rounded-md border border-primary/40 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition">
                      {avatarFile ? 'Trocar foto' : (avatarExistingUrl ? 'Confirmar / trocar foto' : 'Selecionar foto')}
                    </span>
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">Obrigatória. Perfis sem foto não são aceitos no Oculto.</p>
              </div>


              <div className="space-y-2">
                <Label htmlFor="birth">Data de nascimento</Label>
                <Input id="birth" inputMode="numeric" placeholder="dd/mm/aaaa" value={birthDateBR}
                  onChange={(e) => setBirthDateBR(maskBRDate(e.target.value))} maxLength={10} />
                {birthDateBR && (age ?? 0) < 18 && <p className="text-xs text-destructive">Você precisa ter 18 anos ou mais.</p>}
              </div>

              <div className="space-y-2">
                <Label>Gênero / Tipo</Label>
                <div className="grid grid-cols-2 gap-2">
                  {GENDERS.map((g) => (
                    <button key={g.value} type="button" onClick={() => setGender(g.value)}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${gender === g.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:border-primary/40'}`}>
                      <span className="mr-1">{g.icon}</span>{g.label}
                    </button>
                  ))}
                </div>
                {gender === 'other' && (
                  <Input value={genderOther} onChange={(e) => setGenderOther(e.target.value)} placeholder="Descreva como você se identifica" maxLength={40} className="mt-2" />
                )}
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={acceptAdult} onCheckedChange={(v) => setAcceptAdult(!!v)} className="mt-0.5" />
                  <span>Confirmo que tenho <strong>18 anos ou mais</strong> e desejo acessar conteúdo adulto.</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(!!v)} className="mt-0.5" />
                  <span>Li e aceito os <a href="/legal/termos-de-uso" target="_blank" className="text-primary underline">Termos de Uso</a>.</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={acceptPrivacy} onCheckedChange={(v) => setAcceptPrivacy(!!v)} className="mt-0.5" />
                  <span>Li e aceito a <a href="/legal/politica-de-privacidade" target="_blank" className="text-primary underline">Política de Privacidade</a> (LGPD).</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={acceptContent} onCheckedChange={(v) => setAcceptContent(!!v)} className="mt-0.5" />
                  <span>Concordo com as <strong>regras de conteúdo</strong> da plataforma (sem violência, sem menores, sem ilegalidades).</span>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }} className="h-11 px-4">
                  Sair
                </Button>
                <Button onClick={goNext} className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  Continuar <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2 — Localização ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Usada para o Radar e distâncias. Seus dados são privados.</p>
              <div className="space-y-1">
                <Label htmlFor="cep">CEP *</Label>
                <div className="flex gap-2">
                  <Input id="cep" placeholder="00000000" value={cep}
                    onChange={(e) => setCep(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    onBlur={() => fetchCep(cep)} maxLength={8} className="h-11 flex-1" />
                  <Button variant="outline" onClick={() => fetchCep(cep)} disabled={cepLoading || cep.replace(/\D/g, '').length !== 8} className="h-11 px-3 shrink-0">
                    {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <div className="space-y-1"><Label>Rua *</Label><Input value={street} onChange={(e) => setStreet(e.target.value)} className="h-11" /></div>
                <div className="space-y-1"><Label>Bairro *</Label><Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="h-11" /></div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1"><Label>Cidade *</Label><Input value={city} onChange={(e) => setCity(e.target.value)} className="h-11" /></div>
                  <div className="space-y-1"><Label>UF *</Label><Input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2))} maxLength={2} className="h-11" /></div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1.5">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Por que pedimos sua localização?</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">Usamos seu GPS apenas para aproximá-lo de pessoas reais por perto. Sua localização exata <strong className="text-foreground">nunca é compartilhada</strong> — só a região aproximada (cidade/bairro).</p>
              </div>

              <div className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5"><Navigation className="h-4 w-4 text-green-400" /> Validar via GPS *</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Obrigatório. Máx. {MAX_KM} km do CEP.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleGetGPS} disabled={gpsLoading}
                    className={`shrink-0 h-9 ${gpsCoords ? 'border-green-500/50 text-green-400' : ''}`}>
                    {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : gpsCoords ? <><Check className="h-3.5 w-3.5 mr-1" />OK</> : <><Navigation className="h-3.5 w-3.5 mr-1" />Usar GPS</>}
                  </Button>
                </div>
                {gpsCoords && (
                  <div className="text-xs p-2.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 space-y-1">
                    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold"><MapPin className="h-3 w-3" /> Local detectado</p>
                    {gpsAddress && <p className="font-medium leading-snug">{gpsAddress}</p>}
                    <p className="font-mono text-[11px] opacity-70">{gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}</p>
                  </div>
                )}
                {distanceKm !== null && (
                  <div className={`flex items-center gap-2 text-xs p-2 rounded-md ${distanceKm <= MAX_KM ? 'bg-green-500/10 text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                    {distanceKm <= MAX_KM ? <><Check className="h-3.5 w-3.5" /> {distanceKm.toFixed(1)} km do CEP</> : <><AlertTriangle className="h-3.5 w-3.5" /> {distanceKm.toFixed(1)} km (máx {MAX_KM})</>}
                  </div>
                )}
                {gpsErrorKind && !gpsCoords && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 space-y-2 text-xs text-destructive">
                    <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />
                      {gpsErrorKind === 'denied' && 'Permissão de localização bloqueada'}
                      {gpsErrorKind === 'unavailable' && 'Sinal de GPS indisponível'}
                      {gpsErrorKind === 'timeout' && 'GPS demorou demais'}
                      {gpsErrorKind === 'insecure' && 'Conexão não segura'}
                      {gpsErrorKind === 'unsupported' && 'GPS não suportado'}
                    </p>
                    {gpsErrorDetail && <p className="text-destructive/90">{gpsErrorDetail}</p>}
                    <Button type="button" size="sm" onClick={handleUseCepAsLocation} disabled={!cepCoords}
                      className="h-9 bg-amber-500 hover:bg-amber-500/90 text-amber-950 font-semibold">
                      <MapPin className="h-3.5 w-3.5 mr-1" /> Usar localização aproximada do CEP
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={goBack} className="h-11 px-4"><ChevronLeft className="h-4 w-4" /></Button>
                <Button onClick={goNext} className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">Continuar <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </div>
          )}

          {/* ── STEP 3 — Interesses ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Selecione o que combina com você. Mín. 5 sociais e 1 adulta.</p>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm"><Tag className="h-3.5 w-3.5" /> Interesse Social ({socialTags.length}/5+)</Label>
                <div className="flex flex-wrap gap-2">
                  {SOCIAL_TAGS.map((t) => (
                    <TagChip key={t} label={t} icon={SOCIAL_TAG_ICONS[t] || '🏷️'}
                      selected={socialTags.includes(t)}
                      onToggle={() => setSocialTags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])} />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm"><span className="text-destructive font-semibold">+18</span> Interesse Adulto ({adultTags.length}/1+)</Label>
                <div className="flex flex-wrap gap-2">
                  {ADULT_TAGS.map((t) => (
                    <TagChip key={t} label={t} icon={ADULT_TAG_ICONS[t] || '🔥'}
                      selected={adultTags.includes(t)}
                      onToggle={() => setAdultTags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])} />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={goBack} className="h-11 px-4"><ChevronLeft className="h-4 w-4" /></Button>
                <Button onClick={goNext} className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">Avançar <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </div>
          )}

          {/* ── STEP 4 — Preferências ── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Quais tipos de perfis devem aparecer no seu feed? Pode marcar mais de uma.</p>
              <div className="grid grid-cols-2 gap-2">
                {FEED_GENDER_CATEGORY_DEFS.map((def) => {
                  const Icon = def.icon;
                  const selected = feedFilterCategories.includes(def.key);
                  return (
                    <button key={def.key} type="button"
                      onClick={() => setFeedFilterCategories(p => p.includes(def.key) ? p.filter(k => k !== def.key) : [...p, def.key])}
                      className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-colors ${selected ? 'bg-primary/15 border-primary text-foreground' : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50'}`}
                      aria-pressed={selected}>
                      <div className="flex items-center gap-2 w-full">
                        <Icon className={`h-4 w-4 ${def.accent}`} />
                        <span className="text-sm font-semibold flex-1">{def.label}</span>
                        {selected && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <span className="text-[10px] leading-snug text-muted-foreground">{def.description}</span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-2 border border-border/30">💡 Você pode alterar nas Configurações depois.</p>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={goBack} className="h-11 px-4"><ChevronLeft className="h-4 w-4" /></Button>
                <Button onClick={handleSubmit} disabled={saving}
                  className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Concluir e Entrar 🎉'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
