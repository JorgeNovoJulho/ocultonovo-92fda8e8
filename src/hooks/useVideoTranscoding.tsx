import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';

export interface TranscodingJob {
  id: string;
  post_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  master_url?: string;
  preview_url?: string;
  hls_manifest_url?: string;
  error_message?: string;
  metadata?: Record<string, any>;
}

export function useVideoTranscoding() {
  const { session } = useAuth();

  const triggerTranscode = async (postId: string, originalUrl: string) => {
    if (!session?.access_token) return null;

    try {
      const { data, error } = await supabase.functions.invoke('transcode-video', {
        body: { post_id: postId, original_url: originalUrl, media_type: 'video' },
      });

      if (error) {
        console.error('[useVideoTranscoding] Trigger error:', error);
        return null;
      }

      return data as { job_id: string; status: string };
    } catch (err) {
      console.error('[useVideoTranscoding] Exception:', err);
      return null;
    }
  };

  return { triggerTranscode };
}

/**
 * Watch a specific post's video processing status in real-time
 */
export function useVideoProcessingStatus(postId: string | null) {
  const [status, setStatus] = useState<string>('none');
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (!postId) return;

    // Initial fetch
    const fetchStatus = async () => {
      const { data } = await supabase
        .from('video_transcoding_jobs' as any)
        .select('status, progress, metadata')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setStatus((data as any).status);
        setProgress((data as any).progress || 0);
      }
    };

    fetchStatus();

    // Real-time subscription
    const unsub = subscribeTable(
      'video_transcoding_jobs',
      (payload: any) => {
        const job = payload.new;
        if (!job || job.post_id !== postId) return;
        setStatus(job.status);
        setProgress(job.progress || 0);
      },
      { events: ['UPDATE'] },
    );

    return () => {
      unsub();
    };
  }, [postId]);

  return { status, progress, isProcessing: status === 'processing' || status === 'pending' };
}
