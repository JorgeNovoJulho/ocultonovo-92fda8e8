import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { trimAudioBlob } from '@/lib/audioTrim';
import { getCanonicalAuthorIds } from '@/lib/postAuthorResolver';
import { EXTERNAL_SUPABASE_URL as SUPABASE_URL } from '@/lib/appConfig';

const MAX_DURATION = 30;
// Aceita arquivos maiores agora — o usuário escolhe o trecho de até 30s.
const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB

export function useVoiceBio() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  // Duração TOTAL do áudio carregado (pode ser > MAX_DURATION quando vem do upload).
  const [totalDuration, setTotalDuration] = useState(0);
  // Marca de início do trecho a ser salvo (quando totalDuration > MAX_DURATION).
  const [trimStart, setTrimStart] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const trimDuration = Math.min(MAX_DURATION, Math.max(0.5, totalDuration - trimStart));
  const needsTrim = totalDuration > MAX_DURATION + 0.25;

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setTotalDuration(0); // gravação direta — já dentro do limite
        setTrimStart(0);
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
      };

      recorder.start(250);
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (elapsed >= MAX_DURATION) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
          setDuration(MAX_DURATION);
        } else {
          setDuration(elapsed);
        }
      }, 500);
    } catch (err) {
      console.error('Mic access denied:', err);
      toast.error('Permissão de microfone negada. Verifique as configurações do navegador.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const clearRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setTotalDuration(0);
    setTrimStart(0);
  }, [audioUrl]);

  /**
   * Importa um arquivo de áudio do dispositivo do usuário.
   * Aceita qualquer duração — o usuário escolhe o trecho de até 30 s.
   */
  const importFile = useCallback(async (file: File): Promise<boolean> => {
    if (!file) return false;
    if (!file.type.startsWith('audio/')) {
      toast.error('Selecione um arquivo de áudio válido (mp3, m4a, wav, webm…).');
      return false;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Arquivo grande demais (máx. 30 MB).');
      return false;
    }

    const tmpUrl = URL.createObjectURL(file);
    const realDuration = await new Promise<number>((resolve) => {
      const a = new Audio();
      a.preload = 'metadata';
      a.src = tmpUrl;
      const finish = (d: number) => {
        a.removeEventListener('loadedmetadata', onMeta);
        a.removeEventListener('durationchange', onDur);
        a.removeEventListener('error', onErr);
        resolve(d);
      };
      const onMeta = () => {
        if (a.duration && isFinite(a.duration) && a.duration > 0) finish(a.duration);
        else {
          try { a.currentTime = 1e101; } catch { /* noop */ }
        }
      };
      const onDur = () => {
        if (a.duration && isFinite(a.duration) && a.duration > 0) finish(a.duration);
      };
      const onErr = () => finish(0);
      a.addEventListener('loadedmetadata', onMeta);
      a.addEventListener('durationchange', onDur);
      a.addEventListener('error', onErr);
      setTimeout(() => finish(a.duration && isFinite(a.duration) ? a.duration : 0), 4000);
    });

    if (!realDuration || realDuration <= 0) {
      URL.revokeObjectURL(tmpUrl);
      toast.error('Não foi possível ler a duração deste áudio.');
      return false;
    }

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(file);
    setAudioUrl(tmpUrl);
    setTotalDuration(realDuration);
    setTrimStart(0);
    // Duração efetiva = min(real, MAX)
    setDuration(Math.min(MAX_DURATION, Math.round(realDuration)));
    if (realDuration > MAX_DURATION) {
      toast.info(`Áudio de ${Math.round(realDuration)}s — selecione o trecho de até ${MAX_DURATION}s.`, {
        duration: 3500,
      });
    }
    return true;
  }, [audioUrl]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !audioBlob) throw new Error('Dados inválidos');

      // Se o áudio é maior que 30s, recorta APENAS o trecho escolhido (WAV).
      let blobToUpload: Blob = audioBlob;
      let finalDuration = duration || Math.round(totalDuration) || MAX_DURATION;

      if (needsTrim) {
        try {
          const { blob: trimmed, duration: trimmedDur } = await trimAudioBlob(
            audioBlob,
            trimStart,
            MAX_DURATION,
          );
          blobToUpload = trimmed;
          finalDuration = Math.round(trimmedDur);
        } catch (err) {
          console.error('[voice-bio] trim failed:', err);
          throw new Error('Não foi possível recortar o trecho do áudio.');
        }
      } else if (totalDuration > 0) {
        finalDuration = Math.round(Math.min(MAX_DURATION, totalDuration));
      }

      const mime = blobToUpload.type || 'audio/webm';
      const ext = mime.includes('wav')
        ? 'wav'
        : mime.includes('mp4') || mime.includes('m4a')
          ? 'm4a'
          : mime.includes('mpeg') || mime.includes('mp3')
            ? 'mp3'
            : 'webm';
      const fileName = `${user.id}/voice-bio-${Date.now()}.${ext}`;

      // Bucket dedicado para bio em áudio (criado em 2026_05_22_voice_bio_bucket.sql).
      // O bucket "avatars" antigo rejeita áudio (limite 10 MB, MIME só imagem).
      const BUCKET = 'voice-bio';
      let uploadOk = false;
      let lastError: any = null;
      for (let i = 0; i < 3; i++) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(fileName, blobToUpload, {
            contentType: mime,
            upsert: true,
            cacheControl: '3600',
          });
        if (!error) { uploadOk = true; break; }
        lastError = error;
        console.warn(`[voice-bio] upload tentativa ${i + 1} falhou:`, error?.message);
        if (i < 2) await new Promise(r => setTimeout(r, 1200 * (i + 1)));
      }
      if (!uploadOk) {
        throw new Error(
          `Falha no upload: ${lastError?.message || 'erro desconhecido'}. Verifique se o bucket "voice-bio" existe.`,
        );
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;

      // Update resiliente: tenta por user_id E por id (sem depender de .select(),
      // que pode retornar null por RLS de leitura e gerar falso "salvo sem efeito").
      const patch = {
        voice_bio_url: publicUrl,
        voice_bio_duration: finalDuration,
      } as any;

      const byUserId = await (supabase as any)
        .from('profiles')
        .update(patch)
        .eq('user_id', user.id);

      const byId = await (supabase as any)
        .from('profiles')
        .update(patch)
        .eq('id', user.id);

      if (byUserId.error && byId.error) {
        throw byUserId.error;
      }

      return { publicUrl, finalDuration };
    },
    onSuccess: async ({ publicUrl, finalDuration }) => {
      // Reflete a URL no cache do perfil IMEDIATAMENTE.
      queryClient.setQueriesData({ queryKey: ['profile'] }, (old: any) => {
        if (!old || typeof old !== 'object') return old;
        return { ...old, voice_bio_url: publicUrl, voice_bio_duration: finalDuration };
      });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['creator-profile'] });

      // Gera um post no feed principal anunciando a nova bio em áudio.
      try {
        if (user?.id) {
          const { authorProfileId, creatorId } = await getCanonicalAuthorIds(user.id);
          // Garante UMA única postagem de bio de áudio por autor no feed:
          // remove qualquer post anterior do tipo 'voice_bio' antes de inserir o novo.
          try {
            await (supabase as any)
              .from('posts')
              .delete()
              .eq('post_type', 'voice_bio')
              .or(`author_id.eq.${authorProfileId},creator_id.eq.${creatorId}`);
          } catch (delErr) {
            console.warn('[voice-bio] falha ao limpar posts antigos:', delErr);
          }
          await (supabase as any).from('posts').insert({
            author_id: authorProfileId,
            creator_id: creatorId,
            content_text: '🎙️ Acabei de gravar minha nova bio em áudio! Toque play para ouvir.',
            media_url: publicUrl,
            media_type: 'audio',
            post_type: 'voice_bio',
            media_duration_seconds: finalDuration,
            privacy_level: 'public',
          });
          queryClient.invalidateQueries({ queryKey: ['posts'] });
        }
      } catch (err) {
        console.warn('[voice-bio] falha ao publicar post no feed:', err);
      }

      toast.success('Voice bio salvo e publicado no feed!');
      clearRecording();
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Erro ao salvar voice bio. Tente novamente.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      const patch = { voice_bio_url: null, voice_bio_duration: null } as any;
      await (supabase as any).from('profiles').update(patch).eq('user_id', user.id);
      await (supabase as any).from('profiles').update(patch).eq('id', user.id);
    },
    onSuccess: () => {
      queryClient.setQueriesData({ queryKey: ['profile'] }, (old: any) => {
        if (!old || typeof old !== 'object') return old;
        return { ...old, voice_bio_url: null, voice_bio_duration: null };
      });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['creator-profile'] });
      toast.success('Voice bio removido');
    },
  });

  return {
    isRecording,
    duration,
    maxDuration: MAX_DURATION,
    audioBlob,
    audioUrl,
    totalDuration,
    trimStart,
    trimDuration,
    needsTrim,
    setTrimStart,
    startRecording,
    stopRecording,
    clearRecording,
    importFile,
    upload: uploadMutation.mutate,
    isUploading: uploadMutation.isPending,
    deleteVoiceBio: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
