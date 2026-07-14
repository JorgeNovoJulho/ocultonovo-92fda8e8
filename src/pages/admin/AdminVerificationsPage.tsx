import { useState, memo, useCallback } from "react";
import { 
  ShieldCheck, Clock, CheckCircle, XCircle, FileText, Eye, Check, X, 
  Users, AlertTriangle, Crown, UserCheck, Fingerprint, Loader2, ExternalLink, Info,
  Download, Trash2, RotateCcw, Copy,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  useVerificationStats, useVerificationDocs, useApproveVerification, useRejectVerification, useApproveAllDocs,
  useIdentityStats, useIdentityUsers, useToggleIdentityVerification,
  useFounderStats, useFounderApplicationsList, useDeleteKycDocument,
  type GroupedVerification, type VerificationDoc, type IdentityVerificationUser, type FounderApplication,
  type KycDocField,
} from "@/hooks/useAdminVerifications";
import { useApproveFounder, useRejectFounder } from "@/hooks/useCreatorFounders";
import { useAuthStore } from "@/store/useAuthStore";
import { supabase } from "@/lib/supabaseExternal";
import { buildPublicUrl } from "@/lib/storageUrl";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate, Link } from "react-router-dom";

// ── Shared helpers ──────────────────────────────────────────────────────

const docTypeLabels: Record<string, string> = { 'rg_front': 'RG Frente', 'rg_back': 'RG Verso', 'selfie': 'Selfie' };
const statusConfig = {
  pending: { label: 'Pendente', color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' },
  approved: { label: 'Aprovado', color: 'bg-green-500/20 text-green-500 border-green-500/30' },
  rejected: { label: 'Rejeitado', color: 'bg-destructive/20 text-destructive border-destructive/30' }
};

const genderLabels: Record<string, string> = {
  man: 'Homem', woman: 'Mulher', couple: 'Casal', male: 'Homem', female: 'Mulher'
};

const planBadges: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  premium: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
  vip: 'bg-primary/20 text-primary border-primary/30',
};

function resolveAvatarUrl(avatarUrl?: string | null): string | undefined {
  if (!avatarUrl) return undefined;
  const clean = avatarUrl.trim();
  if (!clean) return undefined;
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
  return buildPublicUrl('avatars', clean);
}

const KYC_BUCKETS = ['kyc-documents', 'post-media', 'profile-media', 'avatars'] as const;
type KycBucket = typeof KYC_BUCKETS[number];
type KycFileKind = 'image' | 'pdf' | 'other';
type KycResolvedDocument = {
  label: string;
  field: KycDocField;
  originalPath: string;
  path: string;
  url: string;
  fileKind: KycFileKind;
  contentType: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
};

const kycSignedUrlCache = new Map<string, { value: Omit<KycResolvedDocument, 'label' | 'field' | 'originalPath' | 'status'>; expiresAt: number }>();
const KYC_SIGNED_URL_CACHE_MS = 55 * 60 * 1000;

type ProfileVerificationCheck = 'checking' | 'confirmed' | 'not_confirmed';

function isKycBucket(value: string): value is KycBucket {
  return (KYC_BUCKETS as readonly string[]).includes(value);
}

function inferKycFileKind(path: string, contentType?: string | null): KycFileKind {
  const type = (contentType || '').toLowerCase();
  const cleanPath = path.split('?')[0].toLowerCase();
  if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$/i.test(cleanPath)) return 'image';
  if (type.includes('pdf') || cleanPath.endsWith('.pdf')) return 'pdf';
  return 'other';
}

async function resolveKycDocumentUrl(rawPath?: string | null): Promise<Omit<KycResolvedDocument, 'label' | 'field' | 'originalPath' | 'status'> | null> {
  const value = rawPath?.trim();
  if (!value) return null;
  const cached = kycSignedUrlCache.get(value);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (value.startsWith('data:') || value.startsWith('blob:')) {
    const contentType = value.startsWith('data:') ? value.slice(5, value.indexOf(';')) : '';
    return { url: value, path: value, fileKind: inferKycFileKind(value, contentType), contentType };
  }

  const publicMarker = '/storage/v1/object/public/';
  const parsedPublicUrl = value.includes(publicMarker)
    ? value.slice(value.indexOf(publicMarker) + publicMarker.length)
    : '';
  const storageRef = parsedPublicUrl || value;
  const [maybeBucket, ...rest] = storageRef.replace(/^\/+/, '').split('/');
  const explicitBucket = isKycBucket(maybeBucket) ? maybeBucket : null;
  const cleanPath = decodeURIComponent(explicitBucket ? rest.join('/') : storageRef.replace(/^\/+/, ''));

  if ((value.startsWith('http://') || value.startsWith('https://')) && !parsedPublicUrl) {
    const resolved = { url: value, path: cleanPath || value, fileKind: inferKycFileKind(value), contentType: '' };
    kycSignedUrlCache.set(value, { value: resolved, expiresAt: Date.now() + KYC_SIGNED_URL_CACHE_MS });
    return resolved;
  }

  const candidates: Array<{ bucket: string; path: string }> = [];
  const addCandidate = (bucket: string, path: string) => {
    const normalized = path.replace(/^\/+/, '');
    if (normalized && !candidates.some((c) => c.bucket === bucket && c.path === normalized)) {
      candidates.push({ bucket, path: normalized });
    }
  };

  if (explicitBucket) addCandidate(explicitBucket, cleanPath);
  KYC_BUCKETS.forEach((bucket) => {
    addCandidate(bucket, cleanPath);
    if (!cleanPath.startsWith('verification/')) addCandidate(bucket, `verification/${cleanPath}`);
  });

  let firstSigned: Omit<KycResolvedDocument, 'label' | 'field' | 'originalPath' | 'status'> | null = null;
  for (const candidate of candidates) {
    const { data } = await supabase.storage.from(candidate.bucket).createSignedUrl(candidate.path, 3600);
    if (!data?.signedUrl) continue;
    firstSigned ||= { url: data.signedUrl, path: candidate.path, fileKind: inferKycFileKind(candidate.path), contentType: '' };
    try {
      const res = await fetch(data.signedUrl, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const resolved = { url: data.signedUrl, path: candidate.path, fileKind: inferKycFileKind(candidate.path, contentType), contentType };
        kycSignedUrlCache.set(value, { value: resolved, expiresAt: Date.now() + KYC_SIGNED_URL_CACHE_MS });
        return resolved;
      }
    } catch {
      // Se o HEAD for bloqueado pelo navegador, ainda temos um signedUrl de fallback.
    }
  }

  if (firstSigned) kycSignedUrlCache.set(value, { value: firstSigned, expiresAt: Date.now() + KYC_SIGNED_URL_CACHE_MS });
  return firstSigned;
}

function getMockKycAuditEntries(user?: IdentityVerificationUser | null) {
  if (!user?.kyc_submitted_at) return [];
  const submittedAt = new Date(user.kyc_submitted_at);
  const reviewAt = new Date(submittedAt.getTime() + 18 * 60 * 1000);
  const userLabel = user.display_name || user.name || user.username || user.email?.split('@')[0] || 'usuário';
  const rejectionReason = `KYC de ${userLabel}: documento ilegível ou divergente com a selfie enviada.`;
  return [
    {
      id: `${user.id}-mock-review`,
      action: user.is_verified ? 'Aprovou KYC' : 'Rejeitou KYC',
      admin: 'Admin Oculto',
      at: reviewAt,
      rejectionReason: user.is_verified ? null : rejectionReason,
    },
    {
      id: `${user.id}-mock-submit`,
      action: 'Recebeu documentos',
      admin: 'Sistema KYC',
      at: submittedAt,
      rejectionReason: null,
    },
  ];
}

const StatCard = memo(function StatCard({ title, value, icon: Icon, color, loading }: {
  title: string; value: number; icon: React.ElementType; color: string; loading?: boolean;
}) {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{loading ? '-' : value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function AdminVerificationsPage() {
  const [mainTab, setMainTab] = useState('couples');

  // Stats for badges
  const { data: coupleStats } = useVerificationStats();
  const { data: identityStats } = useIdentityStats();
  const { data: founderStats } = useFounderStats();

  const couplePending = (coupleStats?.pending || 0) + (coupleStats?.autoApproved || 0);
  const founderPending = founderStats?.pending || 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Central de Verificações
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Gerencie todas as verificações de identidade, casais e founders
        </p>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Casais Pendentes" value={couplePending} icon={Users} color="bg-yellow-500/20 text-yellow-500" />
        <StatCard title="Identidades Verificadas" value={identityStats?.verified || 0} icon={Fingerprint} color="bg-green-500/20 text-green-500" />
        <StatCard title="Founders Pendentes" value={founderPending} icon={Crown} color="bg-amber-500/20 text-amber-400" />
        <StatCard title="Total de Perfis" value={identityStats?.total || 0} icon={UserCheck} color="bg-primary/20 text-primary" />
      </div>

      {/* Main sections */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="bg-muted/50 w-full justify-start overflow-x-auto">
          <TabsTrigger value="couples" className="gap-1.5 data-[state=active]:bg-primary/20">
            <Users className="h-3.5 w-3.5" />
            Casais
            {couplePending > 0 && <Badge className="ml-1 bg-yellow-500 text-background h-5 px-1.5 text-[10px]">{couplePending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="identity" className="gap-1.5 data-[state=active]:bg-green-500/20">
            <Fingerprint className="h-3.5 w-3.5" />
            Identidade
          </TabsTrigger>
          <TabsTrigger value="founders" className="gap-1.5 data-[state=active]:bg-amber-500/20">
            <Crown className="h-3.5 w-3.5" />
            Founders
            {founderPending > 0 && <Badge className="ml-1 bg-amber-500 text-background h-5 px-1.5 text-[10px]">{founderPending}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="couples" className="mt-4">
          <CouplesSection />
        </TabsContent>
        <TabsContent value="identity" className="mt-4">
          <IdentitySection />
        </TabsContent>
        <TabsContent value="founders" className="mt-4">
          <FoundersSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COUPLES SECTION
// ═══════════════════════════════════════════════════════════════════════

function CouplesSection() {
  const [subTab, setSubTab] = useState('pending');
  const [rejectingDoc, setRejectingDoc] = useState<{ doc: VerificationDoc; profileId: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useVerificationStats();
  const { data: verifications, isLoading: docsLoading } = useVerificationDocs(subTab);
  const approveDoc = useApproveVerification();
  const rejectDoc = useRejectVerification();
  const approveAll = useApproveAllDocs();

  const openImageViewer = async (storagePath: string) => {
    const { data } = await supabase.storage.from('post-media').createSignedUrl(storagePath, 3600);
    if (data?.signedUrl) setViewingImage(data.signedUrl);
  };

  const handleRejectDoc = () => {
    if (!rejectingDoc || !rejectionReason.trim()) return;
    rejectDoc.mutate({ docId: rejectingDoc.doc.id, profileId: rejectingDoc.profileId, reason: rejectionReason });
    setRejectingDoc(null);
    setRejectionReason('');
  };

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="bg-muted/30">
          <TabsTrigger value="pending">
            Pendentes
            {((stats?.pending || 0) + (stats?.autoApproved || 0)) > 0 && (
              <Badge className="ml-1.5 bg-yellow-500 text-background h-5 px-1.5 text-[10px]">
                {(stats?.pending || 0) + (stats?.autoApproved || 0)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Aprovados</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitados</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>

        <TabsContent value={subTab} className="mt-4 space-y-3">
          {docsLoading ? (
            Array(2).fill(0).map((_, i) => (
              <Card key={i} className="bg-card/50"><CardContent className="p-4"><div className="flex gap-4"><Skeleton className="h-14 w-14 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /><Skeleton className="h-16 w-full" /></div></div></CardContent></Card>
            ))
          ) : verifications?.length === 0 ? (
            <EmptyState icon={Users} message={subTab === 'pending' ? 'Nenhum documento de casal aguardando revisão.' : 'Nenhum documento encontrado.'} />
          ) : (
            verifications?.map(group => (
              <CoupleVerificationCard key={group.profile?.id} group={group}
                onApproveDoc={(doc) => approveDoc.mutate({ docId: doc.id, profileId: doc.profile_id })}
                onRejectDoc={(doc) => setRejectingDoc({ doc, profileId: doc.profile_id })}
                onApproveAll={(profileId) => approveAll.mutate({ profileId })}
                onViewImage={openImageViewer}
                approving={approveDoc.isPending}
                approvingAll={approveAll.isPending}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Reject Modal */}
      <Dialog open={!!rejectingDoc} onOpenChange={() => setRejectingDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Rejeitar Documento</DialogTitle>
            <DialogDescription>Informe o motivo da rejeição.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Motivo da Rejeição</Label><Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Ex: Documento ilegível, foto borrada..." className="mt-2" rows={4} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectingDoc(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRejectDoc} disabled={!rejectionReason.trim() || rejectDoc.isPending}>
              {rejectDoc.isPending ? 'Rejeitando...' : 'Confirmar Rejeição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Viewer */}
      <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Visualizar Documento</DialogTitle></DialogHeader>
          {viewingImage && <img loading="lazy" decoding="async" src={viewingImage} alt="Documento" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const CoupleVerificationCard = memo(function CoupleVerificationCard({
  group, onApproveDoc, onRejectDoc, onApproveAll, onViewImage, approving, approvingAll
}: {
  group: GroupedVerification;
  onApproveDoc: (doc: VerificationDoc) => void;
  onRejectDoc: (doc: VerificationDoc) => void;
  onApproveAll: (profileId: string) => void;
  onViewImage: (path: string) => void;
  approving: boolean;
  approvingAll: boolean;
}) {
  const profile = group.profile;
  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12 border-2 border-primary/30">
            <AvatarImage src={profile?.avatar_url || ''} />
            <AvatarFallback className="bg-primary/20 text-primary">{profile?.name?.charAt(0) || '?'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-semibold truncate">@{profile?.username || 'sem-username'}</h3>
              {group.needsReview && <Badge variant="outline" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-[10px]"><Clock className="h-3 w-3 mr-1" />Aguardando</Badge>}
              {group.allApproved && <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/30 text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Verificado</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mb-3">{profile?.name}</p>
            
            {/* Partner docs */}
            {[{ n: 1, docs: group.partner1Docs, name: profile?.partner1_name, icon: "text-primary" },
              { n: 2, docs: group.partner2Docs, name: profile?.partner2_name, icon: "text-secondary" }
            ].map(p => (
              <div key={p.n} className="bg-muted/30 rounded-lg p-3 mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <Users className={`h-4 w-4 ${p.icon}`} />
                  <span className="text-sm font-medium">Parceiro {p.n}: {p.name || 'Não informado'}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.docs.length === 0 ? <span className="text-xs text-muted-foreground">Nenhum documento enviado</span> : p.docs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-1">
                      <Badge variant="outline" className={`${(statusConfig[(doc.needs_admin_review && doc.status !== 'rejected' ? 'pending' : doc.status) as keyof typeof statusConfig] || statusConfig.pending).color} text-xs`}>
                        {docTypeLabels[doc.document_type] || doc.document_type}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onViewImage(doc.storage_path)}><Eye className="h-3 w-3" /></Button>
                      {doc.needs_admin_review && doc.status !== 'rejected' && (
                        <>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-green-500 hover:bg-green-500/10" onClick={() => onApproveDoc(doc)} disabled={approving}><Check className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => onRejectDoc(doc)}><X className="h-3 w-3" /></Button>
                        </>
                      )}
                      {doc.status === 'rejected' && <span className="text-xs text-destructive">({doc.rejection_reason})</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {group.needsReview && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700 shrink-0" onClick={() => onApproveAll(group.profile?.id || '')} disabled={approvingAll}>
              <CheckCircle className="h-4 w-4 mr-1" /> Aprovar Todos
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// IDENTITY (KYC) SECTION
// ═══════════════════════════════════════════════════════════════════════

function IdentitySection() {
  const [filter, setFilter] = useState<'all' | 'verified' | 'unverified' | 'kyc_submitted'>('kyc_submitted');
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [viewingDocs, setViewingDocs] = useState<{
    user: IdentityVerificationUser;
    docs: KycResolvedDocument[];
  } | null>(null);
  const [profileVerificationCheck, setProfileVerificationCheck] = useState<Record<string, ProfileVerificationCheck>>({});
  const [confirmDelete, setConfirmDelete] = useState<{ field: KycDocField; path: string; label: string } | null>(null);
  const { data: stats } = useIdentityStats();
  const { data: users, isLoading } = useIdentityUsers(filter);
  const toggleVerify = useToggleIdentityVerification();
  const deleteDoc = useDeleteKycDocument();
  const { toast } = useToast();

  const copyRejectionReason = useCallback(async (reason?: string | null) => {
    if (!reason) return;
    await navigator.clipboard.writeText(reason);
    toast({ title: 'Motivo da rejeição copiado' });
  }, [toast]);

  const resolveVerificationProfile = useCallback(async (profileId: string, userId?: string | null) => {
    const { data: byId, error: byIdError } = await supabase
      .from('profiles')
      .select('id, is_verified')
      .eq('id', profileId)
      .maybeSingle();

    if (byIdError) throw byIdError;
    if (byId) return byId;

    if (userId && userId !== profileId) {
      const { data: byUserId, error: byUserIdError } = await supabase
        .from('profiles')
        .select('id, is_verified')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (byUserIdError) throw byUserIdError;
      if (byUserId) return byUserId;
    }

    return null;
  }, []);

  const refreshProfileVerificationStatus = useCallback(async (profileId: string, userId?: string | null) => {
    setProfileVerificationCheck((prev) => ({ ...prev, [profileId]: 'checking' }));
    const data = await resolveVerificationProfile(profileId, userId).catch(() => null);

    setProfileVerificationCheck((prev) => ({
      ...prev,
      [profileId]: !!data?.is_verified ? 'confirmed' : 'not_confirmed',
    }));
  }, [resolveVerificationProfile]);

  const handleToggle = useCallback((profileId: string, verified: boolean, userId?: string | null) => {
    setMutatingId(profileId);
    toggleVerify.mutate({ profileId, userId, verified }, {
      onSuccess: async (data) => {
        if (verified) await refreshProfileVerificationStatus(data.profileId || profileId, userId);
        else setProfileVerificationCheck((prev) => ({ ...prev, [profileId]: 'not_confirmed' }));
      },
      onError: () => setProfileVerificationCheck((prev) => ({ ...prev, [profileId]: 'not_confirmed' })),
      onSettled: () => setMutatingId(null),
    });
  }, [refreshProfileVerificationStatus, toggleVerify]);

  /** Resolve display name with fallback chain */
  const getDisplayName = (u: IdentityVerificationUser) =>
    u.display_name || u.name || u.username || u.email?.split('@')[0] || 'Usuário';

  /** Build profile link — prefer username, fallback to id */
  const getProfilePath = (u: IdentityVerificationUser) =>
    `/creator/${u.username || u.id}`;

  /** Force a download of the signed URL */
  const downloadDoc = useCallback(async (url: string, label: string, userName: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
      const safeName = `${userName}-${label}`.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      console.error('[AdminVerifications] download failed', err);
    }
  }, []);

  const retryKycDoc = useCallback(async (field: KycDocField) => {
    const current = viewingDocs?.docs.find((doc) => doc.field === field);
    if (!viewingDocs || !current) return;
    kycSignedUrlCache.delete(current.originalPath);
    setViewingDocs((prev) => prev ? {
      ...prev,
      docs: prev.docs.map((doc) => doc.field === field ? { ...doc, status: 'loading', error: undefined } : doc),
    } : prev);
    try {
      const resolved = await resolveKycDocumentUrl(current.originalPath);
      setViewingDocs((prev) => prev ? {
        ...prev,
        docs: prev.docs.map((doc) => doc.field === field ? {
          ...doc,
          ...(resolved || {}),
          status: resolved ? 'ready' : 'error',
          error: resolved ? undefined : 'Arquivo não encontrado no armazenamento.',
        } : doc),
      } : prev);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar documento.';
      setViewingDocs((prev) => prev ? {
        ...prev,
        docs: prev.docs.map((doc) => doc.field === field ? { ...doc, status: 'error', error: message } : doc),
      } : prev);
    }
  }, [viewingDocs]);

  /** Open KYC docs viewer with signed URLs */
  const openKycDocs = useCallback(async (u: IdentityVerificationUser) => {
    const items: { label: string; path: string | null | undefined; field: KycDocField }[] = [
      { label: 'Documento — Frente', path: u.kyc_document_url, field: 'kyc_document_url' },
      { label: 'Documento — Verso', path: u.kyc_document_back_url, field: 'kyc_document_back_url' },
      { label: 'Selfie de Validação', path: u.kyc_selfie_url, field: 'kyc_selfie_url' },
    ].filter((item): item is { label: string; path: string; field: KycDocField } => !!item.path);

    setViewingDocs({
      user: u,
      docs: items.map((it) => ({
        label: it.label,
        field: it.field,
        originalPath: it.path,
        path: it.path,
        url: '',
        fileKind: 'other',
        contentType: '',
        status: 'loading',
      })),
    });

    if (u.is_verified) void refreshProfileVerificationStatus(u.id, u.user_id);

    await Promise.all(items.map(async (it) => {
      try {
        const resolved = await resolveKycDocumentUrl(it.path);
        setViewingDocs((prev) => {
          if (!prev || prev.user.id !== u.id) return prev;
          return {
            ...prev,
            docs: prev.docs.map((doc) => doc.field === it.field ? {
              ...doc,
              ...(resolved || {}),
              status: resolved ? 'ready' : 'error',
              error: resolved ? undefined : 'Arquivo não encontrado no armazenamento.',
            } : doc),
          };
        });
      } catch (err) {
        setViewingDocs((prev) => {
          if (!prev || prev.user.id !== u.id) return prev;
          const message = err instanceof Error ? err.message : 'Erro ao carregar documento.';
          return {
            ...prev,
            docs: prev.docs.map((doc) => doc.field === it.field ? { ...doc, status: 'error', error: message } : doc),
          };
        });
      }
    }));
  }, [refreshProfileVerificationStatus]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Docs Enviados" value={stats?.kycSubmitted || 0} icon={FileText} color="bg-blue-500/20 text-blue-500" />
        <StatCard title="Verificados" value={stats?.verified || 0} icon={CheckCircle} color="bg-green-500/20 text-green-500" />
        <StatCard title="Não Verificados" value={stats?.unverified || 0} icon={Clock} color="bg-yellow-500/20 text-yellow-500" />
        <StatCard title="Total" value={stats?.total || 0} icon={UserCheck} color="bg-primary/20 text-primary" />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'verified' | 'unverified' | 'kyc_submitted')}>
        <TabsList className="bg-muted/30 overflow-x-auto">
          <TabsTrigger value="kyc_submitted" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Documentos Enviados
            {(stats?.kycSubmitted || 0) > 0 && (
              <Badge className="ml-1 bg-blue-500 text-background h-5 px-1.5 text-[10px]">
                {stats?.kycSubmitted}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="verified">Verificados</TabsTrigger>
          <TabsTrigger value="unverified">Não Verificados</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="mt-4 space-y-2">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => <Card key={i} className="bg-card/50"><CardContent className="p-3"><div className="flex gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div></div></CardContent></Card>)
          ) : users?.length === 0 ? (
            <EmptyState icon={Fingerprint} message="Nenhum usuário encontrado." />
          ) : (
            users?.map(u => (
              <Card key={u.id} className="bg-card/50 border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    {/* Clickable avatar + name area — client-side navigation */}
                    <Link
                      to={getProfilePath(u)}
                      className="flex items-center gap-3 flex-1 min-w-0 active:opacity-70 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage
                          src={resolveAvatarUrl(u.avatar_url)}
                          loading="lazy"
                          decoding="async"
                        />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {(getDisplayName(u))[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{getDisplayName(u)}</span>
                          {u.username && <span className="text-xs text-muted-foreground truncate">@{u.username}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {u.gender && <span className="text-[10px] text-muted-foreground">{genderLabels[u.gender] || u.gender}</span>}
                          {u.plan_type && <Badge variant="outline" className={`text-[10px] h-4 px-1 ${planBadges[u.plan_type] || ''}`}>{u.plan_type}</Badge>}
                          <span className="text-[10px] text-muted-foreground">
                            Entrou: {format(new Date(u.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </div>
                        {/* Subscription dates */}
                        {u.subscription_created_at && (
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">
                              Assinatura: {format(new Date(u.subscription_created_at), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                            {u.subscription_expires_at && (
                              <span className="text-[10px] text-muted-foreground">
                                Vencimento: {format(new Date(u.subscription_expires_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                            {u.subscription_status && (
                              <Badge variant="outline" className={`text-[9px] h-4 px-1 ${u.subscription_status === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                                {u.subscription_status === 'active' ? 'Ativa' : u.subscription_status === 'cancelled' ? 'Cancelada' : 'Expirada'}
                              </Badge>
                            )}
                          </div>
                        )}
                        {/* Pendencies for unverified users */}
                        {!u.is_verified && u.pendencies && u.pendencies.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {u.pendencies.map((p, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] h-4 px-1.5 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                                <Info className="h-2.5 w-2.5 mr-0.5" />{p}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      {u.kyc_submitted_at && !u.is_verified && (
                        <Badge variant="outline" className="bg-blue-500/20 text-blue-500 border-blue-500/30 text-[10px]">
                          <FileText className="h-3 w-3 mr-1" /> Docs enviados
                        </Badge>
                      )}
                      {u.is_verified ? (
                        <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" /> Verificado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
                          Não verificado
                        </Badge>
                      )}
                      {u.kyc_submitted_at && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openKycDocs(u); }}
                        >
                          <Eye className="h-3 w-3 mr-1" /> Ver Docs
                        </Button>
                      )}
                      <Button
                        variant={u.is_verified ? "outline" : "default"}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleToggle(u.id, !u.is_verified, u.user_id)}
                        disabled={mutatingId === u.id}
                      >
                        {mutatingId === u.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : u.is_verified ? (
                          <X className="h-3 w-3 mr-1" />
                        ) : (
                          <Check className="h-3 w-3 mr-1" />
                        )}
                        {u.is_verified ? 'Revogar' : 'Verificar'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* KYC Docs Viewer */}
      <Dialog open={!!viewingDocs} onOpenChange={() => setViewingDocs(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Documentos de {viewingDocs ? getDisplayName(viewingDocs.user) : ''}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                {viewingDocs?.user.kyc_submitted_at && (
                  <>Enviado em {format(new Date(viewingDocs.user.kyc_submitted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</>
                )}
              </span>
              {viewingDocs?.user.is_verified && (
                <span className="flex items-center gap-2">
                  {profileVerificationCheck[viewingDocs.user.id] === 'checking' ? (
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Confirmando no banco…
                    </Badge>
                  ) : profileVerificationCheck[viewingDocs.user.id] === 'confirmed' ? (
                    <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/30">
                      <CheckCircle className="h-3 w-3 mr-1" /> Verificado confirmado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Aguardando confirmação
                    </Badge>
                  )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {viewingDocs && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Auditoria KYC</p>
              <div className="space-y-2">
                {getMockKycAuditEntries(viewingDocs.user).map((entry) => (
                  <div key={entry.id} className="space-y-1 rounded-md border border-border/60 bg-background/40 p-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{entry.action}</span>
                      <span className="text-muted-foreground">{entry.admin} · {format(entry.at, "dd/MM HH:mm", { locale: ptBR })}</span>
                    </div>
                    <div className="rounded border border-border bg-muted/20 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-[10px] text-muted-foreground">Motivo da rejeição</Label>
                        {entry.rejectionReason && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => copyRejectionReason(entry.rejectionReason)}
                          >
                            <Copy className="h-3 w-3 mr-1" /> Copiar
                          </Button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-foreground">{entry.rejectionReason || 'Não se aplica a esta ação.'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewingDocs && viewingDocs.docs.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum documento legível encontrado no servidor.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {viewingDocs?.docs.map((it) => (
              <div key={it.label} className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{it.label}</p>
                {it.status === 'loading' ? (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                    <Skeleton className="h-56 w-full rounded-md" />
                    <p className="text-xs text-muted-foreground">Carregando URL segura do documento…</p>
                  </div>
                ) : it.status === 'error' ? (
                  <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <p className="text-xs text-destructive">{it.error || 'Não foi possível carregar este documento.'}</p>
                    <Button variant="outline" size="sm" className="mt-1 h-8 text-xs" onClick={() => retryKycDoc(it.field)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Tentar novamente
                    </Button>
                  </div>
                ) : it.fileKind === 'pdf' ? (
                  <iframe src={it.url} title={it.label} className="h-72 w-full rounded-lg border border-border bg-muted/20" />
                ) : it.fileKind === 'image' ? (
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="block">
                    <img loading="lazy" decoding="async" src={it.url} alt={it.label} className="w-full rounded-lg border border-border object-contain max-h-72 bg-muted/20" />
                  </a>
                ) : (
                  <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/20 p-4 text-center">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Formato não exibível no preview. Use baixar ou abrir em nova aba.</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8"
                    disabled={it.status !== 'ready'}
                    onClick={() =>
                      downloadDoc(
                        it.url,
                        it.label,
                        viewingDocs ? getDisplayName(viewingDocs.user) : 'doc',
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5 mr-1" /> Baixar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8"
                    disabled={it.status !== 'ready' || (it.fileKind !== 'image' && it.fileKind !== 'pdf')}
                    onClick={() => window.open(it.url, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8 text-destructive hover:bg-destructive/10 border-destructive/30"
                    onClick={() =>
                      setConfirmDelete({ field: it.field, path: it.path, label: it.label })
                    }
                    disabled={deleteDoc.isPending || it.status === 'loading'}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {viewingDocs && (
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  handleToggle(viewingDocs.user.id, false, viewingDocs.user.user_id);
                  setViewingDocs(null);
                }}
              >
                <X className="h-4 w-4 mr-1" /> Rejeitar
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={() => {
                  handleToggle(viewingDocs.user.id, true, viewingDocs.user.user_id);
                  setViewingDocs(null);
                }}
              >
                <Check className="h-4 w-4 mr-1" /> Aprovar identidade
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm delete single KYC document */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Excluir documento
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{confirmDelete?.label}</strong>? Esta ação remove o arquivo do servidor permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteDoc.isPending}
              onClick={() => {
                if (!confirmDelete || !viewingDocs) return;
                deleteDoc.mutate(
                  {
                    profileId: viewingDocs.user.id,
                    field: confirmDelete.field,
                    storagePath: confirmDelete.path,
                  },
                  {
                    onSuccess: () => {
                      setViewingDocs((prev) =>
                        prev
                          ? { ...prev, docs: prev.docs.filter((u) => u.field !== confirmDelete.field) }
                          : prev,
                      );
                      setConfirmDelete(null);
                    },
                  },
                );
              }}
            >
              {deleteDoc.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// FOUNDERS SECTION
// ═══════════════════════════════════════════════════════════════════════

function FoundersSection() {
  const { user } = useAuthStore();
  const [filterStatus, setFilterStatus] = useState('pending');
  const { data: stats } = useFounderStats();
  const { data: applications, isLoading } = useFounderApplicationsList(filterStatus);
  const approveMutation = useApproveFounder();
  const rejectMutation = useRejectFounder();

  const [selectedApp, setSelectedApp] = useState<FounderApplication | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleApprove = async (appId: string) => {
    if (!user?.id) return;
    try {
      await approveMutation.mutateAsync({ applicationId: appId, adminId: user.id });
      setSelectedApp(null);
    } catch (err) {
      console.error('[AdminVerifications] founder approval failed', err);
    }
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    try {
      const app = applications?.find(a => a.id === rejectId);
      if (app) {
        const extractPath = (url: string | null) => url?.match(/founder-media\/(.+)$/)?.[1] || null;
        const photoPath = extractPath(app.photo_url);
        const videoPath = extractPath(app.video_url);
        if (photoPath) await supabase.storage.from("founder-media").remove([photoPath]);
        if (videoPath) await supabase.storage.from("founder-media").remove([videoPath]);
      }
      await rejectMutation.mutateAsync({ applicationId: rejectId, reason: rejectReason });
      setRejectId(null);
      setRejectReason("");
      setSelectedApp(null);
    } catch (err) {
      console.error('[AdminVerifications] founder rejection failed', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Pendentes" value={stats?.pending || 0} icon={Clock} color="bg-yellow-500/20 text-yellow-500" />
        <StatCard title="Aprovados" value={stats?.approved || 0} icon={CheckCircle} color="bg-green-500/20 text-green-500" />
        <StatCard title="Rejeitados" value={stats?.rejected || 0} icon={XCircle} color="bg-destructive/20 text-destructive" />
        <StatCard title="Total" value={stats?.total || 0} icon={Crown} color="bg-amber-500/20 text-amber-400" />
      </div>

      <Tabs value={filterStatus} onValueChange={setFilterStatus}>
        <TabsList className="bg-muted/30">
          <TabsTrigger value="pending">
            Pendentes
            {(stats?.pending || 0) > 0 && <Badge className="ml-1.5 bg-amber-500 text-background h-5 px-1.5 text-[10px]">{stats?.pending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approved">Aprovados</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitados</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>

        <TabsContent value={filterStatus} className="mt-4 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : applications?.length === 0 ? (
            <EmptyState icon={Crown} message="Nenhuma candidatura founder encontrada." />
          ) : (
            applications?.map(app => (
              <Card key={app.id} className="bg-card/50 border-border/50 hover:border-amber-500/30 transition-colors cursor-pointer" onClick={() => setSelectedApp(app)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{app.applicant_name || app.user_id}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(app.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    {app.career_description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{app.career_description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={
                      app.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                      app.status === 'approved' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                      'bg-red-500/20 text-red-400 border-red-500/30'
                    }>
                      {app.status === 'pending' ? 'Pendente' : app.status === 'approved' ? 'Aprovado' : 'Reprovado'}
                    </Badge>
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Founder Detail Modal */}
      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Crown className="w-5 h-5 text-amber-400" /> Detalhes da Candidatura</DialogTitle>
          </DialogHeader>
          {selectedApp && (
            <div className="space-y-4">
              {selectedApp.applicant_name && <div><p className="text-xs text-muted-foreground">Nome</p><p className="text-sm font-medium">{selectedApp.applicant_name}</p></div>}
              {selectedApp.applicant_email && <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm">{selectedApp.applicant_email}</p></div>}
              {selectedApp.career_description && <div><p className="text-xs text-muted-foreground">Carreira</p><p className="text-sm">{selectedApp.career_description}</p></div>}
              {selectedApp.social_links && (
                <div>
                  <p className="text-xs text-muted-foreground">Redes Sociais</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(selectedApp.social_links).map(([k, v]) => v ? (
                      <a key={k} href={String(v).startsWith("http") ? String(v) : `https://${v}`} target="_blank" rel="noopener noreferrer">
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">{k} <ExternalLink className="w-3 h-3 ml-1" /></Badge>
                      </a>
                    ) : null)}
                  </div>
                </div>
              )}
              {selectedApp.photo_url && <div><p className="text-xs text-muted-foreground mb-1">Foto</p><img loading="lazy" decoding="async" src={selectedApp.photo_url} alt="Prova" className="rounded-lg max-h-64 object-cover" /></div>}
              {selectedApp.video_url && <div><p className="text-xs text-muted-foreground mb-1">Vídeo</p><video src={selectedApp.video_url} controls preload="metadata" className="rounded-lg max-h-64 w-full" muted /></div>}
              {selectedApp.status === 'pending' && (
                <div className="flex gap-2 pt-4 border-t border-border">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApprove(selectedApp.id)} disabled={approveMutation.isPending}>
                    {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />} APROVAR
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => setRejectId(selectedApp.id)} disabled={rejectMutation.isPending}>
                    <XCircle className="w-4 h-4 mr-1" /> REPROVAR
                  </Button>
                </div>
              )}
              {selectedApp.status === 'rejected' && selectedApp.rejection_reason && (
                <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/20">
                  <p className="text-xs text-destructive font-medium mb-1">Motivo da Reprovação:</p>
                  <p className="text-sm text-destructive/80">{selectedApp.rejection_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Reason Modal */}
      <Dialog open={!!rejectId} onOpenChange={() => setRejectId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Motivo da Reprovação</DialogTitle></DialogHeader>
          <Textarea placeholder="Informe o motivo..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || rejectMutation.isPending}>
              {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Empty state component ───────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="p-8 text-center">
        <Icon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-semibold mb-2">Nenhum documento encontrado</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
