import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Tag as TagIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { resolveAvatarUrl } from '@/lib/avatarUrl';

interface TagProfile {
  id: string;
  user_id: string | null;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  plan_type: string | null;
}

export default function PesquisarTagPage() {
  const navigate = useNavigate();
  const { tag: tagSlug = '' } = useParams();
  const [sp] = useSearchParams();
  const label = sp.get('label') || tagSlug;
  const isAdult = sp.get('adult') === '1';

  const [profiles, setProfiles] = useState<TagProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const column = isAdult ? 'tags_adult' : 'tags_social';

  useEffect(() => {
    let canceled = false;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('id, user_id, name, username, avatar_url, plan_type')
          .contains(column, [label])
          .limit(120);

        if (canceled) return;
        if (error) {
          console.error('[PesquisarTagPage] error:', error);
          setProfiles([]);
        } else {
          setProfiles((data || []) as TagProfile[]);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [column, label]);

  const visible = useMemo(() => profiles, [profiles]);

  return (
    <div className="min-h-dvh pt-20 pb-24 px-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <TagIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Pessoas com a tag</h1>
            <p className="text-sm text-muted-foreground">
              {label} · {isAdult ? 'Afinidade +18' : 'Afinidade social'}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          Ninguém com essa tag ativa por aqui ainda.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visible.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/creator/${p.id}`)}
              className="group flex flex-col items-center gap-2 p-3 rounded-2xl bg-card hover:bg-muted/40 border border-border/50 transition-colors"
            >
              <Avatar className="h-16 w-16 ring-2 ring-transparent group-hover:ring-primary/40 transition">
                <AvatarImage src={resolveAvatarUrl(p.avatar_url) || undefined} loading="lazy" />
                <AvatarFallback>{(p.name || '?').charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="text-center min-w-0 w-full">
                <div className="text-sm font-medium truncate">{p.name || 'Sem nome'}</div>
                {p.username && <div className="text-xs text-muted-foreground truncate">@{p.username}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
