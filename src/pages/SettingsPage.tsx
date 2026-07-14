import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useBlockedContacts, useUnblockContact } from "@/hooks/useBlockedContacts";
import { useMySubscriptions, MySubscription } from "@/hooks/useMySubscriptions";
import { KycUploadModal } from "@/components/kyc/KycUploadModal";
import { PrivacyCenterModal } from "@/components/privacy/PrivacyCenterModal";
import { DeleteAccountModal } from "@/components/settings/DeleteAccountModal";
import { LGPDConsentsCard } from "@/components/settings/LGPDConsentsCard";
import { LGPDDataRequestsCard } from "@/components/settings/LGPDDataRequestsCard";
import { HardwarePerformanceTab } from "@/components/settings/HardwarePerformanceTab";
import { AppUpdateCard } from "@/components/settings/AppUpdateCard";
import { ExperienceOcultoTab } from "@/components/view-mode/ExperienceOcultoTab";
import { FeedGenderFilterSettingsCard } from "@/components/feed/FeedGenderFilterSettingsCard";

import { CancelSubscriptionModal } from "@/components/settings/CancelSubscriptionModal";
import { SlideGuidesViewedResetCard } from "@/components/settings/SlideGuidesViewedResetCard";
import { useToast } from "@/hooks/use-toast";
import { useBannerUpload as useBannerUploadHook } from "@/hooks/useBannerUpload";
import { Camera, Loader2, Database, Cpu, FileText, MapPin, Link2 } from "lucide-react";
import { SOCIAL_PLATFORMS_META } from "@/components/profile/ProfileSocialLinks";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseExternal";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  User,
  Users,
  Shield,
  CreditCard,
  Trash2,
  Eye,
  EyeOff,
  MessageCircle,
  Radar,
  Calendar,
  Crown,
  Check,
  Upload,
  AlertCircle,
  CheckCircle2,
  Clock,
  Ban,
  KeyRound,
  Mail,
  Lock,
  Smartphone,
  FileCheck,
  X,
  Bell,
  BellOff,
  Heart,
  UserPlus,
  Unlock,
  RotateCcw,
  Flame,
  Trophy,
  Gift,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { showUpgradeToast } from "@/lib/upgradeToast";
import { appUrl, EXTERNAL_SUPABASE_URL } from "@/lib/appConfig";
import { repairProfile } from "@/lib/profileRepair";
import { LegalFooter } from "@/components/LegalFooter";
import { PushNotificationSettings } from "@/components/settings/PushNotificationSettings";
import { NotificationPreferencesCard } from "@/components/settings/NotificationPreferencesCard";
import { SuperDmSettingsCard } from "@/components/chat/SuperDmSettingsCard";
import { MediaVaultCard } from "@/components/settings/MediaVaultCard";
import { ProfileHighlightCard } from "@/components/settings/ProfileHighlightCard";
import { DataSaverSettings } from "@/components/settings/DataSaverSettings";
import { GhostModeSettings } from "@/components/settings/GhostModeSettings";
import { InvisibleModeSettings } from "@/components/settings/InvisibleModeSettings";
import { TagSelector } from "@/components/TagSelector";
import { AddressSettings } from "@/components/settings/AddressSettings";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { ProfileDebugger } from "@/components/settings/ProfileDebugger";
import { useAdminBypass } from "@/hooks/useAdminBypass";
import { useShowDebugPanels } from "@/hooks/useShowDebugPanels";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { InstallOcultoAppCard } from "@/components/pwa/InstallOcultoAppCard";
import { AddCardModal } from "@/components/settings/AddCardModal";
import { useUsernameCheck } from "@/hooks/useUsernameCheck";
import { VoiceBioRecorder } from "@/components/VoiceBioRecorder";
import { fetchProfileByAuthId } from "@/lib/profilePersistence";
import { ProfileMediaEditorModal } from "@/components/ProfileMediaEditorModal";
import { MobileLightCropModal } from "@/components/MobileLightCropModal";
import { Progress } from "@/components/ui/progress";
import { validateProfileImage } from "@/lib/profileMediaValidate";
import { logger } from '@/lib/logger';
import { useIsMobile } from '@/hooks/use-mobile';


export default function SettingsPage() {
  const { user: authUser } = useAuth();
  const { profile, updateProfile, isUpdating, isLoading: isProfileLoading } = useProfile();
  const { preferences, updatePreference, toggleAll, resetToDefaults, isUpdating: isUpdatingPrefs } = useNotificationPreferences();
  const { data: blockedContacts = [], isLoading: loadingBlocked } = useBlockedContacts();
  const unblockMutation = useUnblockContact();
  const { data: mySubscriptions = [], isLoading: loadingSubscriptions } = useMySubscriptions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const permissions = usePlanPermissions();
  const [activeTab, setActiveTab] = useState("account");
  const isMobile = useIsMobile();

  const { shouldBypass: isMasterAdmin } = useAdminBypass();
  const showDebug = useShowDebugPanels();
  const [showKycModal, setShowKycModal] = useState(false);
  const [showPrivacyCenter, setShowPrivacyCenter] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showCancelSubModal, setShowCancelSubModal] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<MySubscription | null>(null);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  
  // Referência para input de upload de avatar e banner
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarBlobRef = useRef<string | null>(null);

  // Editor de mídia (avatar / banner)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorKind, setEditorKind] = useState<"avatar" | "banner">("avatar");

  // Editor leve mobile
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);

  // Progresso de compressão/upload (avatar + banner)
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploadKind, setUploadKind] = useState<"avatar" | "banner" | null>(null);



  useEffect(() => {
    return () => {
      if (avatarBlobRef.current) {
        URL.revokeObjectURL(avatarBlobRef.current);
        avatarBlobRef.current = null;
      }
    };
  }, []);

  // Deep-link: /settings?openAvatar=1 → abre o seletor de foto automaticamente.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('openAvatar') !== '1') return;
    const t = window.setTimeout(() => {
      try { avatarInputRef.current?.click(); } catch { /* noop */ }
      const url = new URL(window.location.href);
      url.searchParams.delete('openAvatar');
      url.hash = 'avatar';
      window.history.replaceState({}, '', url.toString());
      document.getElementById('avatar-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
    return () => window.clearTimeout(t);
  }, []);

  // Deep-link: /settings?focus=username → garante aba "account", rola e foca o campo username.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('focus') !== 'username') return;
    setActiveTab('account');
    const t = window.setTimeout(() => {
      const el = document.getElementById('username') as HTMLInputElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { el.focus({ preventScroll: true }); } catch { /* noop */ }
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('focus');
      url.hash = 'username';
      window.history.replaceState({}, '', url.toString());
    }, 400);
    return () => window.clearTimeout(t);
  }, []);
  
  // Account settings state
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isRepairingProfile, setIsRepairingProfile] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [bio, setBio] = useState("");
  const bioMaxLength = 2000;
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [partner2BirthDate, setPartner2BirthDate] = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});

  const usernameCheck = useUsernameCheck(username, authUser?.id);

  // Privacy settings state - sincronizado com o perfil
  const [showOnRadar, setShowOnRadar] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [dmSetting, setDmSetting] = useState<"all" | "followers" | "none">("all");
  const [hideAge, setHideAge] = useState(false);
  const [hideLocation, setHideLocation] = useState(false);
  const [rankingAnonymity, setRankingAnonymity] = useState(false);
  const [showFanRanking, setShowFanRanking] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isBootstrappingProfile, setIsBootstrappingProfile] = useState(true);
  const profileSyncedRef = useRef(false);
  // Carregar dados do perfil quando disponível — APENAS UMA VEZ
  useEffect(() => {
    if (profile && !profileSyncedRef.current) {
      profileSyncedRef.current = true;
      setName(profile.name || "");
      setUsername(profile.username || "");
      setBio(profile.bio || "");
      setGender((profile as any).gender || "");
      setBirthDate((profile as any).birth_date || "");
      setPartner2BirthDate((profile as any).partner2_birth_date || "");
      setShowOnRadar((profile as any).show_on_radar ?? true);
      setShowOnlineStatus((profile as any).show_online_status ?? true);
      setHideAge((profile as any).hide_age ?? false);
      setHideLocation((profile as any).hide_location ?? false);
      setDmSetting((profile as any).dm_setting ?? "all");
      setRankingAnonymity((profile as any).ranking_anonymity ?? false);
      setShowFanRanking((profile as any).show_fan_ranking ?? true);
      setIsPrivate((profile as any).is_private ?? false);
      const sl = (profile as any).social_links;
      setSocialLinks(sl && typeof sl === "object" && !Array.isArray(sl) ? sl : {});
    }
  }, [profile]);

  // Sync crítico no abrir da tela: busca perfil por user_id do usuário autenticado
  useEffect(() => {
    const loadProfileOnOpen = async () => {
      const loggedUserId = authUser?.id;
      if (!loggedUserId) {
        setIsBootstrappingProfile(false);
        return;
      }

      try {
        const [{ data: sessionData }, { data: authData }] = await Promise.all([
          supabase.auth.getSession(),
          supabase.auth.getUser(),
        ]);

        logger.log('Sessão ativa no banco:', sessionData?.session);

        const data = await fetchProfileByAuthId(loggedUserId);

        logger.log('Dados recuperados do Supabase:', data);

        if (!data) {
          const authUserData = authData?.user;
          const fullName =
            (authUserData?.user_metadata?.name as string | undefined) ||
            (authUserData?.user_metadata?.full_name as string | undefined) ||
            '';
          const usernameFromMeta =
            (authUserData?.user_metadata?.username as string | undefined) ||
            (authUserData?.user_metadata?.preferred_username as string | undefined) ||
            '';
          const fallbackUsername =
            usernameFromMeta || authUserData?.email?.split('@')[0] || '';

          setName(fullName);
          setUsername(fallbackUsername.toLowerCase().replace(/\s+/g, ''));
          setBio('');
          return;
        }

        setName(data.name || '');
        setUsername(data.username || '');
        setBio(data.bio || '');
      } catch (err: any) {
        const status = Number(err?.status || 0);
        if (status === 403 || status === 404) {
          console.error(`[Perfil] Erro ${status} ao carregar perfil`, err);
        } else {
          console.error('[Perfil] Erro ao carregar perfil', err);
        }
      } finally {
        setIsBootstrappingProfile(false);
      }
    };

    loadProfileOnOpen();
  }, [authUser?.id]);

  useEffect(() => {
    // Prefer auth session email (always up-to-date)
    const loadEmail = async () => {
      const { data: { user: sessionUser } } = await supabase.auth.getUser();
      if (sessionUser?.email) {
        setEmail(sessionUser.email);
      } else if (authUser?.email) {
        setEmail(authUser.email);
      }
    };
    loadEmail();
  }, [authUser?.email]);

  useEffect(() => {
    if (import.meta.env.DEV) logger.log('[Oculto Master] DB ativo:', EXTERNAL_SUPABASE_URL);
  }, []);

  const applyAvatarInstantPreview = (file: File) => {
    if (avatarBlobRef.current) URL.revokeObjectURL(avatarBlobRef.current);
    const blobUrl = URL.createObjectURL(file);
    avatarBlobRef.current = blobUrl;
    setAvatarPreview(blobUrl);
  };

   // Handler para upload de avatar com preview instantâneo + retry + progresso
  const handleAvatarUpload = async (file: File, previewAlreadyApplied = false) => {
    const v = validateProfileImage(file);
    if (!v.ok) {
      toast({ title: "Imagem inválida", description: (v as any).reason, variant: "destructive" });
      return;
    }

    // 1. Preview INSTANTÂNEO antes de tudo
    if (!previewAlreadyApplied) {
      applyAvatarInstantPreview(file);
    }

    if (!authUser?.id) {
      toast({ title: "Sessão inválida", description: "Faça login novamente.", variant: "destructive" });
      return;
    }

    setIsUploadingAvatar(true);
    setUploadKind("avatar");
    setUploadProgress(5);
    setUploadStatus("Preparando imagem...");
    const previousAvatar = profile?.avatar_url || null;
    try {
      const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name || '');

      // 2. Compress — tenta WebP, cai para JPEG se o encoder do navegador falhar
      let compressed: Blob;
      let uploadExt: 'gif' | 'webp' | 'jpg' = 'webp';
      let uploadContentType: string = 'image/webp';

      const encodeImage = (mime: string, quality: number, maxW: number) => new Promise<Blob | null>((resolve) => {
        const img = new Image();
        const objUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(objUrl);
          try {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob(
              (blob) => { canvas.width = 0; canvas.height = 0; resolve(blob); },
              mime, quality
            );
          } catch { resolve(null); }
        };
        img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
        img.src = objUrl;
      });

      // Bucket "avatars" tem limite de 10MB — garantimos < 9MB
      const MAX_BYTES = 9 * 1024 * 1024;

      if (isGif) {
        if (file.size > MAX_BYTES) {
          throw new Error(`GIF muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 9MB para GIFs animados.`);
        }
        compressed = file;
        uploadExt = 'gif';
        uploadContentType = 'image/gif';
        setUploadProgress(35);
        setUploadStatus("GIF detectado — preservando animação...");
      } else {
        setUploadStatus("Comprimindo imagem...");
        setUploadProgress(15);

        const attempts: Array<{ mime: string; ext: 'webp' | 'jpg'; q: number; w: number }> = [
          { mime: 'image/webp', ext: 'webp', q: 0.8,  w: 1200 },
          { mime: 'image/webp', ext: 'webp', q: 0.7,  w: 1000 },
          { mime: 'image/jpeg', ext: 'jpg',  q: 0.82, w: 1200 },
          { mime: 'image/jpeg', ext: 'jpg',  q: 0.72, w: 1000 },
          { mime: 'image/jpeg', ext: 'jpg',  q: 0.6,  w: 800  },
        ];

        let result: Blob | null = null;
        let chosen = attempts[0];
        for (const a of attempts) {
          const blob = await encodeImage(a.mime, a.q, a.w);
          if (blob && blob.size <= MAX_BYTES) { result = blob; chosen = a; break; }
          if (blob && !result) { result = blob; chosen = a; }
        }

        if (!result) {
          if (file.size > MAX_BYTES) {
            throw new Error(`Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 9MB.`);
          }
          compressed = file;
          const t = (file.type || '').toLowerCase();
          uploadContentType = t.startsWith('image/') ? t : 'image/jpeg';
          uploadExt = t.includes('webp') ? 'webp' : 'jpg';
        } else if (result.size > MAX_BYTES) {
          throw new Error(`Imagem ainda muito grande após compressão (${(result.size / 1024 / 1024).toFixed(1)}MB). Tente uma foto menor.`);
        } else {
          compressed = result;
          uploadExt = chosen.ext;
          uploadContentType = chosen.mime;
        }
        setUploadProgress(45);
      }

      // 3. Upload com retry — captura erro real para diagnóstico
      setUploadStatus("Enviando para o servidor...");
      setUploadProgress(60);
      const filePath = `${authUser.id}/${Date.now()}_avatar.${uploadExt}`;
      const SUPABASE_URL = EXTERNAL_SUPABASE_URL;

      let uploadOk = false;
      let lastUploadErr: any = null;
      for (let i = 0; i < 3; i++) {
        const { error } = await supabase.storage
          .from('avatars')
          .upload(filePath, compressed, { upsert: true, contentType: uploadContentType, cacheControl: '3600' });
        if (!error) { uploadOk = true; break; }
        lastUploadErr = error;
        console.error('[Oculto] Avatar upload attempt', i + 1, 'failed:', error);
        setUploadStatus(`Falha na rede, tentando novamente (${i + 2}/3)...`);
        if (i < 2) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
      }
      if (!uploadOk) {
        const reason = lastUploadErr?.message || (typeof lastUploadErr === 'string' ? lastUploadErr : 'erro de rede');
        throw new Error(`Upload falhou: ${reason}`);
      }

      setUploadProgress(85);
      setUploadStatus("Finalizando...");

      // 4. URL pública via concatenação (zero requests extras)
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${filePath}`;
      const cacheBustUrl = `${publicUrl}?t=${Date.now()}`;

      // 5. Persist avatar_url on profiles via id
      const { error: avatarUpdateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl } as any)
        .eq('user_id', authUser.id);
      
      if (avatarUpdateError) {
        console.error('[Oculto] Avatar update error:', avatarUpdateError);
        updateProfile({ avatar_url: publicUrl });
      }

      setAvatarPreview(cacheBustUrl);

      // 6. Cleanup blob + invalidate cache
      if (avatarBlobRef.current) { URL.revokeObjectURL(avatarBlobRef.current); avatarBlobRef.current = null; }
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['profile', authUser.id] });

      setUploadProgress(100);
      setUploadStatus("Concluído!");
      toast({ title: "Foto atualizada!", description: "Sua foto de perfil foi alterada com sucesso." });
    } catch (error: any) {
      // Rollback to previous avatar (no layout break)
      setAvatarPreview(previousAvatar);
      if (avatarBlobRef.current) { URL.revokeObjectURL(avatarBlobRef.current); avatarBlobRef.current = null; }
      const msg = error.message?.includes('memória') || error.message?.includes('memory')
        ? 'Imagem muito pesada. Tente uma foto menor.'
        : (error.message || 'Tente novamente.');
      toast({ title: "Erro ao fazer upload", description: msg, variant: "destructive" });
      // Mantém imagem + recorte selecionados no editor leve do mobile para nova tentativa
      if (isMobile && editorFile) {
        setEditorKind("avatar");
        setMobileEditorOpen(true);
      }
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      // Esconder barra após pequeno delay para usuário ver o 100%
      setTimeout(() => {
        setUploadKind((k) => (k === "avatar" ? null : k));
        setUploadProgress(0);
        setUploadStatus("");
      }, 600);
    }
  };

  const { bannerPreview: settingsBannerPreview, isUploading: bannerHookUploading, uploadBanner } = useBannerUploadHook();

  const handleBannerUpload = async (file: File) => {
    if (!profile?.id) return;
    const v = validateProfileImage(file);
    if (!v.ok) {
      toast({ title: "Imagem inválida", description: (v as any).reason, variant: "destructive" });
      return;
    }
    setUploadKind("banner");
    setUploadProgress(20);
    setUploadStatus("Comprimindo e enviando banner...");
    let lastErr: any = null;
    let ok = false;
    try {
      // Retry automático com backoff (até 3x) — mantém arquivo selecionado
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          setUploadProgress(20 + attempt * 10);
          setUploadStatus(attempt === 1
            ? "Comprimindo e enviando banner..."
            : `Falha na rede, tentando novamente (${attempt}/3)...`);
          await uploadBanner(file);
          ok = true;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 1500 * attempt));
          }
        }
      }
      if (ok) {
        setUploadProgress(100);
        setUploadStatus("Concluído!");
      } else {
        // Reabre editor mobile preservando arquivo + recorte para nova tentativa
        if (isMobile && editorFile) {
          toast({
            title: "Falha no envio do banner",
            description: "Recorte preservado. Toque em 'Aplicar e enviar' para tentar novamente.",
            variant: "destructive",
          });
          setEditorKind("banner");
          setMobileEditorOpen(true);
        } else {
          toast({
            title: "Falha no envio do banner",
            description: (lastErr?.message || "Tente novamente em instantes."),
            variant: "destructive",
          });
        }
      }
    } finally {
      setTimeout(() => {
        setUploadKind((k) => (k === "banner" ? null : k));
        setUploadProgress(0);
        setUploadStatus("");
      }, 600);
    }
  };

  // Salvar alterações do perfil (nome/email)
  const handleSaveProfile = async () => {
    if (!authUser?.id) {
      toast({
        title: "Erro ao salvar",
        description: "Usuário não autenticado.",
        variant: "destructive",
      });
      return;
    }

    // Block save if username is taken
    if (usernameCheck.error && usernameCheck.isAvailable === false) {
      toast({ title: "Username indisponível", description: usernameCheck.error, variant: "destructive" });
      return;
    }

    setIsSavingProfile(true);
    try {

      const mergedTags = Array.from(new Set([...(profile?.tags_social || []), ...(profile?.tags_adult || [])]));
      const bannerUrl = (profile as any)?.banner_url || profile?.cover_image_url || null;

      // IMPORTANTE: o lookup só pode resolver pelo UUID do próprio usuário
      // autenticado (id / user_id). NUNCA incluir o username digitado aqui:
      // se outra conta já tiver esse username, o registro retornado seria de
      // OUTRO perfil e o canonicalProfileId apontaria para a pessoa errada,
      // fazendo o save "sumir" (o write iria para o profile de outra pessoa
      // via persistProfileForUser → identifiers).
      const profileLookupFilter = `id.eq.${authUser.id},user_id.eq.${authUser.id}`;

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, user_id')
        .or(profileLookupFilter)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const canonicalProfileId = (existingProfile as any)?.id || authUser.id;
      const partner2BirthDateValue = gender === 'couple' ? (partner2BirthDate || null) : null;

      const fullPayload: any = {
        username: username || null,
        display_name: name || 'Usuário',
        full_name: name || 'Usuário',
        name: name || 'Usuário',
        avatar_url: profile?.avatar_url || null,
        banner_url: bannerUrl,
        cover_image_url: bannerUrl,
        bio: bio || null,
        gender: gender || null,
        birth_date: birthDate || null,
        partner2_birth_date: partner2BirthDateValue,
        location_lat: profile?.location_lat || null,
        location_lng: profile?.location_lng || null,
        tags: mergedTags,
        tags_social: profile?.tags_social || [],
        tags_adult: profile?.tags_adult || [],
        social_links: Object.fromEntries(
          Object.entries(socialLinks).filter(([, v]) => typeof v === "string" && v.trim().length > 0).map(([k, v]) => [k, (v as string).trim()])
        ),
      };

      logger.log('[Oculto Diagnóstico] persistProfileForUser payload:', JSON.stringify(fullPayload));

      let profileError: any = null;
      try {
        const { persistProfileForUser } = await import('@/lib/profilePersistence');
        const result = await persistProfileForUser(authUser.id, fullPayload, {
          // Apenas UUIDs do dono autenticado — NUNCA o username digitado, senão
          // o write pode cair no perfil de OUTRA pessoa que já usa esse @.
          identifiers: [canonicalProfileId].filter(Boolean) as string[],
        });
        if (result.removedColumns.length > 0) {
          console.warn('[Oculto Diagnóstico] Colunas inexistentes removidas:', result.removedColumns);
        }
      } catch (err: any) {
        profileError = err;
        console.error('[Oculto Diagnóstico] persistProfileForUser ERRO:', err);
      }

      if (profileError) {
        console.error('[Oculto Diagnóstico] Upsert ERRO:', profileError);
        throw profileError;
      }
      logger.log('[Oculto Diagnóstico] Upsert OK — perfil salvo com sucesso');

      // Atualizar email no auth (se mudou)
      if (email && email !== authUser?.email) {
        const { error } = await supabase.auth.updateUser(
          { email },
          { emailRedirectTo: appUrl('/settings') }
        );
        if (error) throw error;
        toast({
          title: "Email atualizado",
          description: "Um email de confirmação foi enviado para o novo endereço.",
        });
      } else {
        toast({
          title: "Perfil atualizado!",
          description: "Suas alterações foram salvas.",
        });
      }

      // Limpa cache local e força sincronização fresh
      queryClient.removeQueries({ queryKey: ['profile', authUser.id] });
      queryClient.removeQueries({ queryKey: ['profile'] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile', authUser.id] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['posts'] }),
        queryClient.invalidateQueries({ queryKey: ['creator-profile'] }),
      ]);

      // Sem reload — atualização via cache invalidation
      setIsSavingProfile(false);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleRepairProfile = async () => {
    if (!authUser?.id || isRepairingProfile) return;

    setIsRepairingProfile(true);
    try {
      const result = await repairProfile(authUser.id);

      queryClient.removeQueries({ queryKey: ['profile', authUser.id] });
      queryClient.removeQueries({ queryKey: ['profile'] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile', authUser.id] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['posts'] }),
        queryClient.invalidateQueries({ queryKey: ['creator-profile'] }),
      ]);

      const details = result.messages.map((message) => message.text).join(' • ');
      toast({
        title: result.updated ? 'Perfil reparado' : 'Reparo concluído',
        description:
          result.repairedFields.length > 0
            ? `Campos ajustados: ${result.repairedFields.join(', ')}${details ? ` • ${details}` : ''}`
            : details || 'Nenhum campo adicional precisou ser atualizado.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao reparar perfil',
        description: error?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsRepairingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    const lockedEmail = (authUser?.email || '').toLowerCase() === 'testeapp2026@gmail.com';
    const lockedUsername = (username || '').toLowerCase() === 'testeapp';
    if (lockedEmail || lockedUsername) {
      toast({
        title: "Alteração bloqueada",
        description: "Apenas o administrador master @ocultomaster pode redefinir esta senha.",
        variant: "destructive",
      });
      return;
    }

    if (!currentPassword) {
      toast({
        title: "Erro",
        description: "Digite sua senha atual.",
        variant: "destructive",
      });
      return;
    }

    if (!newPassword) {
      toast({
        title: "Erro",
        description: "Digite a nova senha.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      // Verify current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authUser?.email || "",
        password: currentPassword,
      });

      if (signInError) {
        toast({
          title: "Senha atual incorreta",
          description: "Verifique sua senha atual e tente novamente.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: "Senha alterada!",
        description: "Sua senha foi atualizada com sucesso.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: "Erro ao alterar senha",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };
  const handleOpenVerification = () => {
    setShowKycModal(true);
  };

  // Handler para alterações de privacidade - salva automaticamente
  const handlePrivacyChange = (field: string, value: any) => {
    updateProfile({ [field]: value } as any);
  };

  const visibilityLock = {
    privateProfile: !permissions.canPrivateProfile,
    radar: permissions.isFree,
    onlineStatus: !permissions.canHideOnlineStatus,
    hideAge: !permissions.canHideAge,
    hideLocation: !permissions.canHideLocation,
    anonymousRanking: !permissions.canAnonymousRanking,
    fanRanking: permissions.isFree,
  };

  // Handler para desbloquear usuário
  const handleUnblock = (blockedUserId: string) => {
    unblockMutation.mutate(blockedUserId);
  };

  // Handler para cancelar assinatura
  const handleOpenCancelSub = (subscription: MySubscription) => {
    setSelectedSubscription(subscription);
    setShowCancelSubModal(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Determinar plano atual do usuário
  const getCurrentPlanDisplay = () => {
    const planType = profile?.plan_type || 'free';
    switch (planType) {
      case 'vip':
        return { name: 'Plano VIP', description: 'Acesso total ilimitado', icon: Crown, color: 'hsl(45,93%,47%)' };
      case 'monthly':
      case 'premium':
        return { name: 'Plano Premium', description: 'Acesso premium mensal', icon: Crown, color: 'hsl(280,70%,50%)' };
      default:
        return { name: 'Plano Gratuito', description: 'Acesso limitado ao conteúdo', icon: User, color: 'hsl(var(--muted-foreground))' };
    }
  };

  const currentPlan = getCurrentPlanDisplay();

  // Lista de bloqueados (apenas do tipo 'blocked')
  const blockedUsers = blockedContacts.filter(c => c.block_type === 'blocked');

  if ((isProfileLoading || isBootstrappingProfile) && !profile) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 h-full overflow-y-auto perf-no-animations">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-12 w-full" />
          <Card className="bg-card/50 border-border/30">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-20 w-20 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-9 w-40" />
                  <Skeleton className="h-4 w-52" />
                </div>
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-28 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 h-full overflow-y-auto">
      {/* Input oculto para upload de avatar — abre o editor (GIFs vão direto, preservando animação) */}
      <input
        type="file"
        ref={avatarInputRef}
        accept="image/jpeg,image/png,image/gif,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (avatarInputRef.current) avatarInputRef.current.value = '';
          if (!file) return;
          const v = validateProfileImage(file);
          if (!v.ok) {
            toast({ title: "Imagem inválida", description: (v as any).reason, variant: "destructive" });
            return;
          }
          const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name || '');
          if (isGif) {
            // GIF preserva animação — vai direto
            applyAvatarInstantPreview(file);
            void handleAvatarUpload(file, true);
            return;
          }
          setEditorKind("avatar");
          setEditorFile(file);
          if (isMobile) {
            // Editor leve com fallback automático
            setMobileEditorOpen(true);
          } else {
            setEditorOpen(true);
          }
        }}
      />
      {/* Input oculto para upload de banner — abre o editor (GIFs vão direto, preservando animação) */}
      <input
        type="file"
        ref={bannerInputRef}
        accept="image/jpeg,image/png,image/gif,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (bannerInputRef.current) bannerInputRef.current.value = '';
          if (!file) return;
          const v = validateProfileImage(file);
          if (!v.ok) {
            toast({ title: "Imagem inválida", description: (v as any).reason, variant: "destructive" });
            return;
          }
          const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name || '');
          if (isGif) {
            void handleBannerUpload(file);
            return;
          }
          setEditorKind("banner");
          setEditorFile(file);
          if (isMobile) {
            setMobileEditorOpen(true);
          } else {
            setEditorOpen(true);
          }
        }}
      />


      {/* Modal de edição de mídia (foto de perfil / banner) */}
      <ProfileMediaEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        file={editorFile}
        aspectRatio={editorKind === "avatar" ? 1 : 3}
        outputWidth={editorKind === "avatar" ? 1024 : 1500}
        title={editorKind === "avatar" ? "Editar foto de perfil" : "Editar banner do perfil"}
        onSave={async (blob) => {
          const ext = "jpg";
          const namedFile = new File(
            [blob],
            `${editorKind}_${Date.now()}.${ext}`,
            { type: blob.type || "image/jpeg" }
          );
          if (editorKind === "avatar") {
            applyAvatarInstantPreview(namedFile);
            await handleAvatarUpload(namedFile, true);
          } else {
            await handleBannerUpload(namedFile);
          }
          setEditorFile(null);
        }}
      />

      {/* Editor leve mobile (com fallback automático ao falhar canvas) */}
      <MobileLightCropModal
        open={mobileEditorOpen}
        onOpenChange={(v) => {
          setMobileEditorOpen(v);
          // NÃO limpa editorFile aqui: permite retry mantendo arquivo + recorte
        }}
        file={editorFile}
        aspectRatio={editorKind === "avatar" ? 1 : 3}
        outputWidth={editorKind === "avatar" ? 1024 : 1500}
        storageKey={editorKind}
        title={editorKind === "avatar" ? "Ajustar foto de perfil" : "Ajustar banner"}
        onConfirm={async (blob, usedFallback) => {
          const ext = blob.type.includes("png") ? "png" : blob.type.includes("gif") ? "gif" : "jpg";
          const namedFile = new File(
            [blob],
            `${editorKind}_${Date.now()}.${ext}`,
            { type: blob.type || "image/jpeg" }
          );
          if (usedFallback) {
            toast({
              title: "Recorte indisponível",
              description: "Enviando imagem original para garantir a atualização.",
            });
          }
          if (editorKind === "avatar") {
            applyAvatarInstantPreview(namedFile);
            await handleAvatarUpload(namedFile, true);
          } else {
            await handleBannerUpload(namedFile);
          }
        }}
      />

      {/* Overlay global de progresso de upload (avatar / banner) */}
      {uploadKind && (
        <div className="fixed inset-x-0 top-0 z-[120] px-4 pt-3 pointer-events-none">
          <div className="mx-auto max-w-md rounded-xl border border-primary/30 bg-background/95 backdrop-blur p-3 shadow-lg pointer-events-auto">
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className="font-medium">
                {uploadKind === "avatar" ? "Atualizando foto de perfil" : "Atualizando banner"}
              </span>
              <span className="text-muted-foreground">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
            {uploadStatus && (
              <p className="mt-2 text-[11px] text-muted-foreground">{uploadStatus}</p>
            )}
          </div>
        </div>
      )}


      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
            <p className="text-muted-foreground">
              Gerencie sua conta e preferências
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/30 border border-border/50 p-1 w-full grid grid-cols-4 md:grid-cols-8 gap-1 h-auto flex-wrap">
          <TabsTrigger value="account" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs md:text-sm">
            <User className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Conta</span>
          </TabsTrigger>
          <TabsTrigger value="address" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs md:text-sm">
            <MapPin className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Endereço</span>
          </TabsTrigger>
          <TabsTrigger value="tags" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs md:text-sm">
            <Heart className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Afinidades</span>
          </TabsTrigger>
          <TabsTrigger value="experience" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs md:text-sm">
            <Sparkles className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Experiência</span>
          </TabsTrigger>
          <TabsTrigger value="privacy" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs md:text-sm">
            <Shield className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Privacidade</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs md:text-sm">
            <Bell className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs md:text-sm">
            <CreditCard className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Assinaturas</span>
          </TabsTrigger>
          <TabsTrigger value="hardware" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs md:text-sm">
            <Cpu className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Hardware</span>
          </TabsTrigger>
        </TabsList>

        {/* ==================== ACCOUNT TAB ==================== */}
        <TabsContent value="account" className="space-y-6">
          {/* Profile Debugger — Master Admin only */}
          {showDebug && <ProfileDebugger onNavigateTab={setActiveTab} />}

          {/* Install App (PWA) — only visible when installable */}
          <InstallOcultoAppCard className="mb-4" />
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                Instalar aplicativo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Adicione o OCULTO à tela inicial do seu celular para acesso rápido, em tela cheia e sem a barra do navegador.
              </p>
              <InstallAppButton fullWidth surface="settings" hideWhenInstalled={false} label="Instalar OCULTO no dispositivo" />
            </CardContent>
          </Card>

          {/* Profile Section */}
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Perfil
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar id="avatar-section" className="h-20 w-20 ring-2 ring-primary/20" style={{ aspectRatio: '1/1', contain: 'layout style' }}>
                  <AvatarImage src={avatarPreview || profile?.avatar_url || (authUser?.user_metadata as any)?.avatar_url} alt={profile?.name || username || (authUser?.user_metadata as any)?.name} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                    {(profile?.name || username || (authUser?.user_metadata as any)?.name)?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mb-2"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                  >
                    {isUploadingAvatar ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Alterar Foto
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG ou GIF. Máximo 5MB.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleRepairProfile}
                    disabled={isRepairingProfile}
                  >
                    {isRepairingProfile ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Reparando...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reparar perfil
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Banner do Perfil */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-primary" />
                  Banner do Perfil
                </Label>
                <div
                  onClick={() => !bannerHookUploading && bannerInputRef.current?.click()}
                  className="relative rounded-xl overflow-hidden cursor-pointer group border border-border/50 hover:border-primary/50 transition-colors"
                  style={{ aspectRatio: '3/1', maxHeight: 200, minHeight: 112, contain: 'layout style' }}
                >
                  {/* Show preview (local blob) or persisted DB value */}
                  {(() => {
                    const persistedBanner = (profile as any)?.banner_url || profile?.cover_image_url;
                    const bannerSrc = settingsBannerPreview || (persistedBanner ? `${persistedBanner}?t=${profile.updated_at || ''}` : '');
                    return bannerSrc ? (
                      <img loading="lazy" decoding="async"
                        src={bannerSrc}
                        alt="Banner do perfil"
                        key={bannerSrc}
                        className="w-full h-full object-cover object-center"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 via-secondary/10 to-muted/30 flex items-center justify-center">
                        <Camera className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                    );
                  })()}
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {bannerHookUploading ? (
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    ) : (
                      <Camera className="h-6 w-6 text-foreground" />
                    )}
                  </div>
                  {bannerHookUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Recomendado: 1500×500px. JPG ou PNG, máximo 5MB.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="name">Seu Nome Real</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-muted/30 border-border/50"
                  />
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <Shield className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>Seu nome real nunca será mostrado a nenhum usuário, é necessário para confirmação da sua identidade na plataforma conforme Lei LGPD.</span>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s+/g, '').toLowerCase())}
                    className={cn(
                      "bg-muted/30 border-border/50",
                      usernameCheck.error && "border-destructive/50 focus-visible:ring-destructive/30"
                    )}
                    placeholder="seuusername"
                  />
                  {username.length >= 3 && (
                    <p className={cn(
                      "text-xs flex items-center gap-1",
                      usernameCheck.isChecking ? "text-muted-foreground" :
                      usernameCheck.error ? "text-destructive" :
                      usernameCheck.isAvailable ? "text-[hsl(142,76%,36%)]" : "text-muted-foreground"
                    )}>
                      {usernameCheck.isChecking ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Verificando...</>
                      ) : usernameCheck.error ? (
                        <><AlertCircle className="h-3 w-3" /> {usernameCheck.error}</>
                      ) : usernameCheck.isAvailable ? (
                        <><CheckCircle2 className="h-3 w-3" /> Disponível</>
                      ) : null}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-muted/30 border-border/50 pl-10"
                      />
                    </div>
                    <Badge variant="secondary" className="shrink-0 bg-muted/50 text-muted-foreground">
                      <Lock className="h-3 w-3 mr-1" />
                      Privado
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Seu email não está visível para outros usuários
                  </p>
                </div>
              </div>

              {/* Gender & Birth Date Section */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gender" className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Gênero
                  </Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className="bg-muted/30 border-border/50">
                      <SelectValue placeholder="Selecione seu gênero" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="woman">Mulher</SelectItem>
                      <SelectItem value="man">Homem</SelectItem>
                      <SelectItem value="trans">Trans</SelectItem>
                      <SelectItem value="couple">Casal</SelectItem>
                      <SelectItem value="prefer_not_say">Prefiro não dizer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birth_date" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Data de Nascimento
                    {birthDate && (() => {
                      const age = Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                      return <Badge variant="secondary" className="ml-1 text-xs">{age} anos</Badge>;
                    })()}
                  </Label>
                  <Input
                    id="birth_date"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="bg-muted/30 border-border/50"
                  />
                </div>
              </div>

              {/* Partner 2 birth date - only for couples */}
              {gender === 'couple' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div />
                  <div className="space-y-2">
                    <Label htmlFor="partner2_birth_date" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Data de Nascimento (Parceiro 2)
                      {partner2BirthDate && (() => {
                        const age = Math.floor((Date.now() - new Date(partner2BirthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                        return <Badge variant="secondary" className="ml-1 text-xs">{age} anos</Badge>;
                      })()}
                    </Label>
                    <Input
                      id="partner2_birth_date"
                      type="date"
                      value={partner2BirthDate}
                      onChange={(e) => setPartner2BirthDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="bg-muted/30 border-border/50"
                    />
                  </div>
                </div>
              )}

              {/* Bio Section */}
              <div className="space-y-2">
                <Label htmlFor="bio" className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Bio do Perfil
                </Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, bioMaxLength))}
                  placeholder="Conte um pouco sobre você..."
                  className="bg-muted/30 border-border/50 min-h-[120px] resize-none"
                  maxLength={bioMaxLength}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {bio.length}/{bioMaxLength} caracteres
                </p>
              </div>

              {/* Redes Sociais */}
              <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <Link2 className="h-4 w-4 text-primary" />
                    Minhas Redes Sociais
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  Preencha apenas as redes que deseja exibir no seu perfil. Os botões aparecem logo abaixo da sua bio.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SOCIAL_PLATFORMS_META.map(({ key, label, placeholder, helper }) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`social-${key}`} className="text-xs">
                        {label}
                      </Label>
                      <Input
                        id={`social-${key}`}
                        value={socialLinks[key] || ""}
                        onChange={(e) =>
                          setSocialLinks((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder={placeholder}
                        className="bg-background/60 border-border/50 h-9 text-sm"
                        autoComplete="off"
                      />
                      {helper && (
                        <p className="text-[10px] text-muted-foreground">{helper}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>



              {/* Voice Bio Section */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Bio em Áudio
                </Label>
                <VoiceBioRecorder
                  existingUrl={profile?.voice_bio_url || undefined}
                  existingDuration={profile?.voice_bio_duration || undefined}
                />
              </div>

              <Button 
                className="bg-primary hover:bg-primary/90"
                onClick={handleSaveProfile}
                disabled={isSavingProfile || isUpdating || usernameCheck.isAvailable === false || usernameCheck.isChecking}
              >
                {isSavingProfile ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Security Section */}
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                Segurança
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const lockedEmail = (authUser?.email || '').toLowerCase() === 'testeapp2026@gmail.com';
                const lockedUsername = (username || '').toLowerCase() === 'testeapp';
                const isLockedAccount = lockedEmail || lockedUsername;

                if (isLockedAccount) {
                  return (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
                      <Lock className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-amber-200">
                          Alteração de senha bloqueada para esta conta
                        </p>
                        <p className="text-xs text-amber-100/80">
                          Esta é uma conta protegida. Apenas o administrador master <span className="font-semibold">@ocultomaster</span> pode redefinir ou alterar a senha. Entre em contato pelo suporte se precisar.
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="current-password">Senha Atual (opcional)</Label>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="current-password"
                            type={showCurrentPassword ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="••••••••"
                            className="bg-muted/30 border-border/50 pl-10 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">Nova Senha</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="new-password"
                            type={showNewPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            className="bg-muted/30 border-border/50 pl-10 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="confirm-password"
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className="bg-muted/30 border-border/50 pl-10 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full md:w-auto"
                      onClick={handleChangePassword}
                      disabled={isChangingPassword || !newPassword}
                    >
                      {isChangingPassword ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Alterando...
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4 mr-2" />
                          Alterar Senha
                        </>
                      )}
                    </Button>

                    <div className="pt-4 border-t border-border/30">
                      <Button variant="outline" className="w-full md:w-auto">
                        <Smartphone className="h-4 w-4 mr-2" />
                        Ativar Autenticação em Duas Etapas
                      </Button>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Identity Verification */}
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-primary" />
                Verificação de Identidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!profile?.is_verified ? (
                <div className="p-4 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-[hsl(45,93%,47%)]/20">
                      <AlertCircle className="h-5 w-5 text-[hsl(45,93%,47%)]" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Verificação Pendente</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Complete a verificação biométrica para desbloquear todos os recursos e ganhar credibilidade.
                      </p>
                      <Button 
                        className="mt-3 bg-primary hover:bg-primary/90"
                        onClick={handleOpenVerification}
                        disabled={isUpdating}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Completar Verificação
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[hsl(142,76%,36%)]/10 border border-[hsl(142,76%,36%)]/30">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-[hsl(142,76%,36%)]/20">
                      <CheckCircle2 className="h-5 w-5 text-[hsl(142,76%,36%)]" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Verificado</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Sua identidade foi verificada com sucesso.
                      </p>
                      <Badge className="mt-2 bg-[hsl(142,76%,36%)]/20 text-[hsl(142,76%,36%)]">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Verificado
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unified KYC Upload Modal — documento + selfie, envia para o admin master aprovar */}
          <KycUploadModal
            open={showKycModal}
            onOpenChange={setShowKycModal}
          />

          <Card className="bg-destructive/5 border-destructive/30">
            <CardHeader>
              <CardTitle className="text-lg text-destructive flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Zona de Perigo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Ações irreversíveis. Proceda com cuidado.
              </p>
              <Button 
                variant="destructive" 
                className="gap-2"
                onClick={() => setShowDeleteAccountModal(true)}
              >
                <Trash2 className="h-4 w-4" />
                Excluir Conta Permanentemente
              </Button>
            </CardContent>
          </Card>

          {/* Destaque dourado de perfil (24h, pago) */}
          <ProfileHighlightCard />
        </TabsContent>

        {/* ==================== ADDRESS TAB ==================== */}
        <TabsContent value="address" className="space-y-6">
          <AddressSettings />
        </TabsContent>

        {/* ==================== TAGS / AFINIDADES TAB ==================== */}
        <TabsContent value="tags" className="space-y-6">
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                Minhas Afinidades
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Selecione seus interesses para encontrar pessoas compatíveis no Radar.
              </p>
            </CardHeader>
            <CardContent>
              <TagSelector
                socialTags={profile?.tags_social || []}
                adultTags={profile?.tags_adult || []}
                connectionMode={(profile as any)?.connection_mode ?? true}
                onSocialTagsChange={(tags) => updateProfile({ tags_social: tags } as any)}
                onAdultTagsChange={(tags) => updateProfile({ tags_adult: tags } as any)}
                onConnectionModeChange={(mode) => updateProfile({ connection_mode: mode } as any)}
              />
              <p className="text-[10px] text-muted-foreground mt-4 leading-relaxed">
                🔒 Suas tags ocultas +18 só são visíveis para outros usuários que também ativaram o "Modo Conexão". 
                Conforme a LGPD, seus dados são tratados com sigilo.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="experience" className="space-y-6">
          <FeedGenderFilterSettingsCard />
          <ExperienceOcultoTab />
        </TabsContent>

        <TabsContent value="privacy" className="space-y-6">
          {/* LGPD — Consentimentos granulares */}
          <LGPDConsentsCard />
          <LGPDDataRequestsCard />

          {/* Visibility Settings */}
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Visibilidade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {/* Private Profile Toggle */}
              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      Perfil Privado
                      {!permissions.canPrivateProfile && (
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Premium+</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Apenas seguidores podem ver suas publicações
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={permissions.isFree ? false : isPrivate} 
                  onCheckedChange={(v) => {
                    if (!permissions.canPrivateProfile) {
                      showUpgradeToast({ description: "Tornar o perfil privado é um recurso Premium. Faça upgrade para liberar." });
                      return;
                    }
                    setIsPrivate(v);
                    handlePrivacyChange('is_private', v);
                  }}
                  disabled={isUpdating || visibilityLock.privateProfile}
                />
              </div>

              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <Radar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      Aparecer no Radar
                      {permissions.isFree && (
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Premium+</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Outros usuários podem te encontrar por proximidade
                    </p>
                  </div>
                </div>
                <Switch
                  checked={permissions.isFree ? false : showOnRadar}
                  onCheckedChange={(v) => {
                    if (permissions.isFree) {
                      showUpgradeToast({ description: "Controlar a visibilidade no Radar é exclusivo dos planos Premium e VIP. Faça upgrade para liberar." });
                      return;
                    }
                    setShowOnRadar(v);
                    handlePrivacyChange('show_on_radar', v);
                  }}
                  disabled={isUpdating || visibilityLock.radar}
                />
              </div>

              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[hsl(142,76%,46%)]" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      Status Online
                      {!permissions.canHideOnlineStatus && (
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Premium+</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Mostrar quando você está online
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={permissions.isFree ? true : showOnlineStatus} 
                  onCheckedChange={(v) => {
                    if (!permissions.canHideOnlineStatus) {
                      showUpgradeToast({ description: "Ocultar o status online é um recurso Premium. Faça upgrade para liberar." });
                      return;
                    }
                    setShowOnlineStatus(v);
                    handlePrivacyChange('show_online_status', v);
                  }}
                  disabled={isUpdating || visibilityLock.onlineStatus}
                />
              </div>

              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      Ocultar Idade
                      {!permissions.canHideAge && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">VIP</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Sua idade não será exibida no perfil
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={permissions.isVip ? hideAge : false} 
                  onCheckedChange={(v) => {
                    if (!permissions.canHideAge) {
                      showUpgradeToast({ description: "Ocultar a idade é exclusivo do plano VIP. Faça upgrade para liberar." });
                      return;
                    }
                    setHideAge(v);
                    handlePrivacyChange('hide_age', v);
                  }}
                  disabled={isUpdating || visibilityLock.hideAge}
                />
              </div>

              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <EyeOff className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      Ocultar Localização
                      {!permissions.canHideLocation && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">VIP</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Esconder cidade/estado do perfil
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={permissions.isVip ? hideLocation : false} 
                  onCheckedChange={(v) => {
                    if (!permissions.canHideLocation) {
                      showUpgradeToast({ description: "Ocultar a localização é exclusivo do plano VIP. Faça upgrade para liberar." });
                      return;
                    }
                    setHideLocation(v);
                    handlePrivacyChange('hide_location', v);
                  }}
                  disabled={isUpdating || visibilityLock.hideLocation}
                />
              </div>

              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <Crown className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      Aparecer como Anônimo em Rankings
                      {!permissions.canAnonymousRanking && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">VIP</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Seu nome e foto serão ocultados nos rankings de criadores que você apoia
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={permissions.isVip ? rankingAnonymity : false} 
                  onCheckedChange={(v) => {
                    if (!permissions.canAnonymousRanking) {
                      showUpgradeToast({ description: "Aparecer anônimo em rankings é exclusivo do plano VIP. Faça upgrade para liberar." });
                      return;
                    }
                    setRankingAnonymity(v);
                    handlePrivacyChange('ranking_anonymity', v);
                  }}
                  disabled={isUpdating || visibilityLock.anonymousRanking}
                />
              </div>

              {profile?.is_creator && (
                <div className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <Trophy className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-foreground">Exibir Ranking de Fãs</p>
                      <p className="text-sm text-muted-foreground">
                        Mostra os maiores apoiadores no seu perfil
                      </p>
                    </div>
                  </div>
                  <Switch 
                    checked={permissions.isFree ? true : showFanRanking} 
                    onCheckedChange={(v) => {
                      if (permissions.isFree) {
                        showUpgradeToast({ description: "Controlar a visibilidade do ranking de fãs exige upgrade. Faça upgrade para liberar." });
                        return;
                      }
                      setShowFanRanking(v);
                      handlePrivacyChange('show_fan_ranking', v);
                    }}
                    disabled={isUpdating || visibilityLock.fanRanking}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Direct Messages */}
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                Mensagens Diretas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Quem pode te enviar mensagens</Label>
                <Select 
                  value={dmSetting} 
                  onValueChange={(v) => {
                    setDmSetting(v as any);
                    handlePrivacyChange('dm_setting', v);
                  }}
                >
                  <SelectTrigger className="bg-muted/30 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os usuários</SelectItem>
                    <SelectItem value="followers">Apenas seguidores</SelectItem>
                    <SelectItem value="none">Ninguém (DM desabilitada)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Super DM Settings */}
          <SuperDmSettingsCard />

          {/* Media Vault */}
          <MediaVaultCard />

          {/* Invisible Mode (VIP) */}
          <InvisibleModeSettings />

          {/* Ghost Mode */}
          <GhostModeSettings />

          {/* Data Saver */}
          <DataSaverSettings />

          {/* Block List */}
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Ban className="h-5 w-5 text-primary" />
                Lista de Bloqueados
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBlocked ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : blockedUsers.length > 0 ? (
                <div className="space-y-3">
                  {blockedUsers.map((blocked) => (
                    <div 
                      key={blocked.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage 
                          src={blocked.blocked_user?.avatar_url || ''} 
                          alt={blocked.blocked_user?.name || ''} 
                        />
                        <AvatarFallback>
                          {blocked.blocked_user?.name?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {blocked.blocked_user?.name || 'Usuário'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Bloqueado em {new Date(blocked.created_at || '').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleUnblock(blocked.blocked_user_id)}
                        disabled={unblockMutation.isPending}
                      >
                        {unblockMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Você não bloqueou nenhum usuário.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Central de Transparência LGPD */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Central de Transparência LGPD
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Veja exatamente quais dados a plataforma possui sobre você, exporte seus dados ou 
                exerça seu direito ao esquecimento.
              </p>
              <Button 
                variant="outline" 
                className="w-full border-primary/50 hover:bg-primary/10"
                onClick={() => setShowPrivacyCenter(true)}
              >
                <Shield className="h-4 w-4 mr-2" />
                Acessar Central de Transparência
              </Button>
            </CardContent>
          </Card>

          {/* Redefinir guias "Saiba mais" vistos */}
          <SlideGuidesViewedResetCard />

          {/* Links Legais */}
          <LegalFooter variant="sidebar" />
        </TabsContent>

        {/* ==================== NOTIFICATIONS TAB ==================== */}
        <TabsContent value="notifications" className="space-y-6">
          {/* Push Notifications Section */}
          <PushNotificationSettings />
          <NotificationPreferencesCard />

          {/* Atalho — Pulsos de Aura (preferências completas + histórico) */}
          <Card className="bg-card/50 border-fuchsia-500/30">
            <CardContent className="p-4">
              <Link to="/settings/pulses" className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-fuchsia-500/15">
                    <Sparkles className="h-5 w-5 text-fuchsia-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Pulsos de Aura</p>
                    <p className="text-sm text-muted-foreground">
                      Som, vibração, pulso Premium/Raro, ressonância e histórico
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>

          {/* Master Toggle */}
          <Card className="bg-card/50 border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/20">
                    <BellOff className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Pausar Todas as Notificações</p>
                    <p className="text-sm text-muted-foreground">
                      Desativa temporariamente todos os alertas
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={!preferences.push_enabled} 
                  onCheckedChange={(checked) => toggleAll(!checked)}
                  disabled={isUpdatingPrefs}
                  className="data-[state=checked]:bg-destructive"
                />
              </div>
            </CardContent>
          </Card>

          {/* Interactions Section */}
          <Card className={cn(
            "bg-card/50 border-border/30 transition-opacity",
            !preferences.push_enabled && "opacity-50 pointer-events-none"
          )}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                Interações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <Heart className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Curtidas</p>
                    <p className="text-sm text-muted-foreground">
                      Quando alguém curtir seu post
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.likes} 
                  onCheckedChange={(v) => updatePreference('likes', v)}
                  disabled={isUpdatingPrefs}
                />
              </div>

              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <Eye className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Visitas ao Perfil</p>
                    <p className="text-sm text-muted-foreground">
                      Quando alguém visitar seu perfil
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.visits} 
                  onCheckedChange={(v) => updatePreference('visits', v)}
                  disabled={isUpdatingPrefs}
                />
              </div>

              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <UserPlus className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Novos Seguidores</p>
                    <p className="text-sm text-muted-foreground">
                      Quando alguém começar a te seguir
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.follows} 
                  onCheckedChange={(v) => updatePreference('follows', v)}
                  disabled={isUpdatingPrefs}
                />
              </div>
            </CardContent>
          </Card>

          {/* Messages Section */}
          <Card className={cn(
            "bg-card/50 border-border/30 transition-opacity",
            !preferences.push_enabled && "opacity-50 pointer-events-none"
          )}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-blue-400" />
                Mensagens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Mensagens Diretas</p>
                    <p className="text-sm text-muted-foreground">
                      Novas mensagens na sua caixa de entrada
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.messages} 
                  onCheckedChange={(v) => updatePreference('messages', v)}
                  disabled={isUpdatingPrefs}
                />
              </div>

              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Camera className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Respostas aos Stories</p>
                    <p className="text-sm text-muted-foreground">
                      Quando alguém responder ao seu Flash Story
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.story_replies} 
                  onCheckedChange={(v) => updatePreference('story_replies', v)}
                  disabled={isUpdatingPrefs}
                />
              </div>
            </CardContent>
          </Card>

          {/* Financial Section */}
          <Card className={cn(
            "bg-card/50 border-border/30 transition-opacity",
            !preferences.push_enabled && "opacity-50 pointer-events-none"
          )}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Crown className="h-5 w-5 text-[hsl(45,93%,47%)]" />
                Financeiro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <Crown className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Novas Assinaturas</p>
                    <p className="text-sm text-muted-foreground">
                      Quando alguém assinar seu conteúdo VIP
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.subscriptions} 
                  onCheckedChange={(v) => updatePreference('subscriptions', v)}
                  disabled={isUpdatingPrefs}
                />
              </div>

              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Unlock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Desbloqueios de Mídia</p>
                    <p className="text-sm text-muted-foreground">
                      Quando alguém desbloquear sua mídia paga
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.unlocks} 
                  onCheckedChange={(v) => updatePreference('unlocks', v)}
                  disabled={isUpdatingPrefs}
                />
              </div>
            </CardContent>
          </Card>

          {/* Radar Section */}
          <Card className={cn(
            "bg-card/50 border-border/30 transition-opacity",
            !preferences.push_enabled && "opacity-50 pointer-events-none"
          )}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Radar className="h-5 w-5 text-orange-500" />
                Radar & Proximidade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-orange-500/10">
                    <Flame className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Buscando Agora Próximos</p>
                    <p className="text-sm text-muted-foreground">
                      Quando alguém perto de você ativar "Buscando Agora"
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.looking_now} 
                  onCheckedChange={(v) => updatePreference('looking_now', v)}
                  disabled={isUpdatingPrefs}
                />
              </div>

              <div className="flex items-center justify-between py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Som ao Receber Match</p>
                    <p className="text-sm text-muted-foreground">
                      Reproduzir som quando você receber um match
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.match_sound !== false} 
                  onCheckedChange={(v) => updatePreference('match_sound' as any, v)}
                  disabled={isUpdatingPrefs}
                />
              </div>

              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Radar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Vibração ao Receber Match</p>
                    <p className="text-sm text-muted-foreground">
                      Vibrar o dispositivo quando você receber um match
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.match_vibration !== false} 
                  onCheckedChange={(v) => updatePreference('match_vibration' as any, v)}
                  disabled={isUpdatingPrefs}
                />
              </div>
            </CardContent>
          </Card>

          {/* WhatsApp Promotions Opt-in */}
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-green-500" />
                WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Gift className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Receber novidades e promoções</p>
                    <p className="text-sm text-muted-foreground">
                      Receba ofertas exclusivas e promoções via WhatsApp
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={profile?.whatsapp_promotions_opt_in !== false}
                  onCheckedChange={(v) => updateProfile({ whatsapp_promotions_opt_in: v })}
                  disabled={isUpdating}
                />
              </div>
            </CardContent>
          </Card>

          {/* Reset Button */}
          <Button 
            variant="outline" 
            className="w-full"
            onClick={resetToDefaults}
            disabled={isUpdatingPrefs}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar Padrões
          </Button>
        </TabsContent>

        {/* ==================== SUBSCRIPTION TAB ==================== */}
        <TabsContent value="subscription" className="space-y-6">
          {/* My Plan */}
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                Meu Plano Atual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border/30">
                <div 
                  className="p-3 rounded-full"
                  style={{ backgroundColor: `${currentPlan.color}20` }}
                >
                  <currentPlan.icon 
                    className="h-6 w-6" 
                    style={{ color: currentPlan.color }} 
                  />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{currentPlan.name}</p>
                  <p className="text-sm text-muted-foreground">{currentPlan.description}</p>
                </div>
                <Badge variant="secondary">Ativo</Badge>
              </div>

              {profile?.plan_type === 'free' && (
                <Button 
                  className="w-full mt-4 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] font-bold"
                  onClick={() => window.location.href = '/checkout?plan=vip'}
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Fazer Upgrade para VIP
                </Button>
              )}
            </CardContent>
          </Card>

          {/* My Subscriptions to Creators */}
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Criadores que Assino
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSubscriptions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : mySubscriptions.length > 0 ? (
                <div className="space-y-4">
                  {mySubscriptions.map((sub) => (
                    <div 
                      key={sub.id}
                      className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border/30"
                    >
                      <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                        <AvatarImage src={sub.creator?.avatar_url || ''} alt={sub.creator?.name || ''} />
                        <AvatarFallback>{sub.creator?.name?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {sub.creator?.name || 'Criador'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          @{sub.creator?.username || 'usuario'} • Desde {new Date(sub.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                        </p>
                        {sub.expires_at && (
                          <p className="text-xs text-muted-foreground">
                            Próxima cobrança: {new Date(sub.expires_at).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-foreground">
                          {formatCurrency(sub.price || 0)}
                          <span className="text-xs text-muted-foreground font-normal">/mês</span>
                        </p>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 mt-1"
                          onClick={() => handleOpenCancelSub(sub)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="flex items-center justify-between pt-4 border-t border-border/30">
                    <p className="font-medium text-muted-foreground">Total mensal</p>
                    <p className="text-lg font-bold text-foreground">
                      {formatCurrency(mySubscriptions.reduce((acc, sub) => acc + (sub.price || 0), 0))}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">
                    Você não assina nenhum criador ainda.
                  </p>
                  <Button variant="outline" className="mt-4">
                    Explorar Criadores
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card className="bg-card/50 border-border/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Métodos de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg bg-muted/30 border border-dashed border-border/50 text-center">
                <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nenhum cartão cadastrado
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddCardModal(true)}>
                  Adicionar Cartão
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== HARDWARE TAB ==================== */}
        <TabsContent value="hardware" className="space-y-6">
          <AppUpdateCard />
          <HardwarePerformanceTab />
        </TabsContent>

      </Tabs>

      {/* Modals */}
      <PrivacyCenterModal
        open={showPrivacyCenter}
        onOpenChange={setShowPrivacyCenter}
      />

      <DeleteAccountModal
        open={showDeleteAccountModal}
        onOpenChange={setShowDeleteAccountModal}
      />

      <CancelSubscriptionModal
        open={showCancelSubModal}
        onOpenChange={setShowCancelSubModal}
        subscription={selectedSubscription}
      />

      <AddCardModal
        open={showAddCardModal}
        onOpenChange={setShowAddCardModal}
      />
    </div>
  );
}
