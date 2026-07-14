import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface UserSticker {
  id: string;
  url: string;
  storage_path: string | null;
  created_at: string;
}

const CACHE_KEY = (uid: string) => `oculto_user_stickers_${uid}`;

export function useUserStickers() {
  const { user } = useAuth();
  const [stickers, setStickers] = useState<UserSticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const loadedOnce = useRef(false);

  // Carrega cache local instantâneo (sem flicker)
  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(CACHE_KEY(user.id));
      if (raw) setStickers(JSON.parse(raw));
    } catch {}
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('oculto_user_stickers')
        .select('id,url,storage_path,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const list = (data || []) as UserSticker[];
      setStickers(list);
      try { localStorage.setItem(CACHE_KEY(user.id), JSON.stringify(list)); } catch {}
    } catch (err) {
      console.error('[user-stickers] refresh', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || loadedOnce.current) return;
    loadedOnce.current = true;
    refresh();
  }, [user?.id, refresh]);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    if (!user?.id) { toast.error('Faça login para importar figurinhas'); return; }
    const arr = Array.from(files);
    if (!arr.length) return;

    const valid = arr.filter((f) => {
      const okMime = /^image\/(png|webp|gif|jpe?g)$/i.test(f.type) || /\.(png|webp|gif|jpe?g)$/i.test(f.name);
      const okSize = f.size > 0 && f.size <= 2 * 1024 * 1024;
      return okMime && okSize;
    });
    if (!valid.length) {
      toast.error('Nenhuma figurinha válida (PNG/WEBP/GIF, máx 2MB cada)');
      return;
    }

    setImporting(true);
    setProgress(0);
    let ok = 0;
    let fail = 0;
    const inserted: UserSticker[] = [];

    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      try {
        const extRaw = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
        const ext = extRaw || 'png';
        const path = `${user.id}/stickers/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { data, error } = await supabase.storage
          .from('chat-media')
          .upload(path, file, {
            cacheControl: '31536000',
            contentType: file.type || 'image/png',
            upsert: false,
          });
        if (error) throw error;
        const url = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/chat-media/${data.path}`;
        const { data: row, error: insErr } = await supabase
          .from('oculto_user_stickers')
          .insert({
            user_id: user.id,
            url,
            storage_path: data.path,
            mime_type: file.type || 'image/png',
            size_bytes: file.size,
          })
          .select('id,url,storage_path,created_at')
          .single();
        if (insErr) {
          // pode ser duplicata — tudo bem, considera ok
          if (!/duplicate|unique/i.test(insErr.message)) throw insErr;
        } else if (row) {
          inserted.push(row as UserSticker);
        }
        ok++;
      } catch (err) {
        console.error('[user-stickers] import', err);
        fail++;
      } finally {
        setProgress(Math.round(((i + 1) / valid.length) * 100));
      }
    }

    if (inserted.length) {
      setStickers((prev) => {
        const merged = [...inserted, ...prev];
        try { localStorage.setItem(CACHE_KEY(user.id), JSON.stringify(merged)); } catch {}
        return merged;
      });
    }
    setImporting(false);
    setTimeout(() => setProgress(0), 600);

    if (ok && !fail) toast.success(`${ok} figurinha(s) importada(s)`);
    else if (ok && fail) toast.success(`${ok} importada(s), ${fail} falharam`);
    else toast.error('Falha ao importar figurinhas');

    // refetch silencioso para sincronizar
    refresh();
  }, [user?.id, refresh]);

  const remove = useCallback(async (sticker: UserSticker) => {
    if (!user?.id) return;
    try {
      await supabase.from('oculto_user_stickers').delete().eq('id', sticker.id);
      if (sticker.storage_path) {
        await supabase.storage.from('chat-media').remove([sticker.storage_path]);
      }
      setStickers((prev) => {
        const next = prev.filter((s) => s.id !== sticker.id);
        try { localStorage.setItem(CACHE_KEY(user.id), JSON.stringify(next)); } catch {}
        return next;
      });
    } catch (err) {
      console.error('[user-stickers] remove', err);
      toast.error('Não foi possível remover');
    }
  }, [user?.id]);

  return { stickers, loading, importing, progress, refresh, importFiles, remove };
}
