import { supabase } from '@/lib/supabaseExternal';

export const uploadReportEvidence = async (
  file: File,
  reporterId: string,
  conversationId: string,
) => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `chat-reports/${conversationId}/${reporterId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('media').upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
};
