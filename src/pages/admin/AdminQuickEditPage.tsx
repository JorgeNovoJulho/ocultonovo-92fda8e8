import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Search, Save, Loader2, User, Crown, Shield } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface ProfileRow {
  id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  plan_type: string | null;
  is_verified: boolean;
  is_creator: boolean;
  is_vip: boolean;
  email?: string | null;
}

export default function AdminQuickEditPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPlan, setEditPlan] = useState('free');
  const [editUsername, setEditUsername] = useState('');

  // Search profiles
  const { data: results, isLoading: searching, refetch } = useQuery({
    queryKey: ['admin-quick-search', search],
    queryFn: async () => {
      if (!search.trim()) return [];
      const term = `%${search.trim()}%`;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, plan_type, is_verified, is_creator, is_vip')
        .or(`name.ilike.${term},username.ilike.${term}`)
        .limit(10);
      if (error) throw error;
      return (data || []) as ProfileRow[];
    },
    enabled: false,
  });

  // Load selected profile
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['admin-quick-profile', selectedId],
    queryFn: async () => {
      if (!selectedId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', selectedId)
        .maybeSingle();
      if (error) throw error;
      return data as ProfileRow | null;
    },
    enabled: !!selectedId,
  });

  // Update mutation
  const updateMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Nenhum perfil selecionado');
      const updates: Record<string, any> = {};
      if (editName.trim()) updates.name = editName.trim();
      if (editUsername.trim()) updates.username = editUsername.trim();
      updates.plan_type = editPlan;
      if (editPlan === 'vip') updates.is_vip = true;
      else updates.is_vip = false;

      const { error } = await supabase
        .from('profiles')
        .update(updates as any)
        .eq('id', selectedId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Perfil atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['admin-quick-profile', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSearch = () => {
    if (search.trim()) refetch();
  };

  const handleSelect = (p: ProfileRow) => {
    setSelectedId(p.id);
    setEditName(p.name || '');
    setEditUsername(p.username || '');
    setEditPlan(p.plan_type || 'free');
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        Edição Rápida de Perfil
      </h1>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          placeholder="Buscar por nome ou username..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={searching} size="icon">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <div className="border border-border rounded-lg divide-y divide-border">
          {results.map(p => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors ${selectedId === p.id ? 'bg-primary/10' : ''}`}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={p.avatar_url || ''} />
                <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{p.name || 'Sem nome'}</p>
                <p className="text-xs text-muted-foreground">@{p.username || 'sem-username'} • {p.plan_type || 'free'}</p>
              </div>
              {p.plan_type === 'vip' && <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />}
            </button>
          ))}
        </div>
      )}

      {results && results.length === 0 && search.trim() && (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum perfil encontrado.</p>
      )}

      {/* Edit Form */}
      {selectedId && (
        <div className="border border-border rounded-lg p-4 space-y-4 bg-card">
          <h2 className="font-semibold text-sm text-muted-foreground">Editando: {profile?.name || selectedId}</h2>

          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome do perfil" />
          </div>

          <div className="space-y-2">
            <Label>Username</Label>
            <Input value={editUsername} onChange={e => setEditUsername(e.target.value)} placeholder="username" />
          </div>

          <div className="space-y-2">
            <Label>Plano</Label>
            <select
              value={editPlan}
              onChange={e => setEditPlan(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="free">Gratuito</option>
              <option value="premium">Premium</option>
              <option value="vip">VIP</option>
            </select>
          </div>

          <Button
            onClick={() => updateMut.mutate()}
            disabled={updateMut.isPending}
            className="w-full"
          >
            {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Alterações
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Alterações são aplicadas diretamente no banco de dados externo em tempo real.
      </p>
    </div>
  );
}
