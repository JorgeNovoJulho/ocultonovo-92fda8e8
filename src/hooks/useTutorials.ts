import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface Tutorial {
  id: string;
  category: string;
  title: string;
  description: string | null;
  media_type: 'text' | 'image' | 'video' | 'audio' | 'link';
  media_url: string | null;
  link_url: string | null;
  author_id: string;
  created_at: string;
  updated_at: string;
}

const KEY = ['oculto_tutorials'];

export function useTutorials() {
  const qc = useQueryClient();

  const query = useQuery<Tutorial[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_tutorials')
        .select('*')
        .order('category', { ascending: true })
        .order('title', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tutorial[];
    },
    staleTime: 30_000,
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('oculto_tutorials_rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_tutorials' },
        () => qc.invalidateQueries({ queryKey: KEY }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return query;
}

export function useCreateTutorial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<Tutorial, 'id' | 'created_at' | 'updated_at'>,
    ) => {
      const { data, error } = await supabase
        .from('oculto_tutorials')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data as Tutorial;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTutorial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('oculto_tutorials')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Upload de mídia para o bucket público `tutoriais`. */
export async function uploadTutorialMedia(file: File, userId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('tutoriais').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('tutoriais').getPublicUrl(path);
  return data.publicUrl;
}

/** Busca o id do usuário oculto_master uma única vez por sessão. */
export async function findMasterUserId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .or('username.ilike.ocultomaster,username.ilike.oculto_master')
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as any).id ?? null;
}
