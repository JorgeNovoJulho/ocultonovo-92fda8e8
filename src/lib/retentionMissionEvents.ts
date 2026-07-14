import { supabase } from '@/lib/supabaseExternal';

export async function notifyRetentionMissionCompleted(key: string) {
  try {
    const { error } = await (supabase as any).rpc('retention_mission_complete', { p_key: key });
    if (error) throw error;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('retention:mission-completed', { detail: { key } }));
    }

    return true;
  } catch {
    return false;
  }
}

export function notifyEnterRoomMissionCompleted() {
  return notifyRetentionMissionCompleted('d1_enter_room');
}