/**
 * oculto-play-audio-preview — gera no SERVIDOR o clip curto (até 30s) da
 * prévia de uma música do Oculto Play, para TODOS os usuários.
 *
 * Por que existe: o botão de prévia do card toca `audio_preview_url` (clip
 * pequeno, começa em ms). Músicas sem clip caíam no MP3 completo — download
 * grande + seek, o caso lento. Antes o clip só era gerado no navegador de
 * quem publicou (ou da conta master), porque usuários comuns não podem
 * gravar no item de outra pessoa.
 *
 * Como funciona: lê o item com a service role, baixa o MP3, recorta os
 * frames do trecho salvo (preview_start/end) sem recodificar, envia o clip
 * para o bucket e grava `audio_preview_url` — só se o item ainda estiver sem
 * clip (ou, com `force`, se quem pede é o autor ou o master).
 *
 * Entrada (POST JSON):
 *   { item_id: string, force?: boolean }   → um item
 *   { backfill: true, limit?: number }     → lote (só master ou service role)
 *
 * Deploy: supabase functions deploy oculto-play-audio-preview --no-verify-jwt
 * (o JWT é validado manualmente aqui, como nas demais funções do projeto).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ───────────────── Recorte de MP3 ─────────────────
/**
 * Recorte de MP3 SEM recodificar: o MP3 é uma sequência de "frames"
 * independentes (~26 ms cada). Copiar os frames entre o início e o fim do
 * trecho gera um MP3 válido, pequeno e que toca em qualquer navegador —
 * sem ffmpeg, sem decodificar áudio, em milissegundos.
 */

const BITRATES: Record<string, number[]> = {
  // [versão-layer] -> kbps por índice (0 = free, 15 = inválido)
  'V1L3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1],
  'V2L3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1],
};
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000],  // MPEG-2.5
};

interface FrameInfo {
  length: number;
  duration: number;
}

function readFrame(buf: Uint8Array, i: number): FrameInfo | null {
  if (i + 4 > buf.length) return null;
  if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
  const versionBits = (buf[i + 1] >> 3) & 0x03; // 3=V1, 2=V2, 0=V2.5, 1=reservado
  const layerBits = (buf[i + 1] >> 1) & 0x03;   // 1 = Layer III
  if (versionBits === 1 || layerBits !== 1) return null;
  const bitrateIdx = (buf[i + 2] >> 4) & 0x0f;
  const srIdx = (buf[i + 2] >> 2) & 0x03;
  const padding = (buf[i + 2] >> 1) & 0x01;
  if (bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) return null;
  const bitrate = BITRATES[versionBits === 3 ? 'V1L3' : 'V2L3'][bitrateIdx] * 1000;
  const sampleRate = SAMPLE_RATES[versionBits][srIdx];
  const samples = versionBits === 3 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding;
  if (length < 24) return null;
  return { length, duration: samples / sampleRate };
}

function skipId3v2(buf: Uint8Array): number {
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    const hasFooter = (buf[5] & 0x10) !== 0;
    return 10 + size + (hasFooter ? 10 : 0);
  }
  return 0;
}

/** Frame com cabeçalho VBR (Xing/Info/VBRI) — carrega a duração da faixa inteira. */
function isVbrHeaderFrame(buf: Uint8Array, start: number, length: number): boolean {
  const end = Math.min(buf.length, start + Math.min(length, 200));
  for (let i = start + 4; i < end - 3; i += 1) {
    const a = buf[i], b = buf[i + 1], c = buf[i + 2], d = buf[i + 3];
    if (a === 0x58 && b === 0x69 && c === 0x6e && d === 0x67) return true; // Xing
    if (a === 0x49 && b === 0x6e && c === 0x66 && d === 0x6f) return true; // Info
    if (a === 0x56 && b === 0x42 && c === 0x52 && d === 0x49) return true; // VBRI
  }
  return false;
}

interface Mp3ClipResult {
  clip: Uint8Array;
  totalDuration: number; // duração estimada da faixa inteira (s)
  clipDuration: number;
}

/**
 * Recorta [startSec, startSec + lengthSec) de um MP3 (Layer III).
 * Retorna null se o arquivo não for MP3 reconhecível.
 */
function cutMp3(buf: Uint8Array, startSec: number, lengthSec: number): Mp3ClipResult | null {
  let i = skipId3v2(buf);
  let t = 0;
  let validFrames = 0;
  const endSec = startSec + lengthSec;
  let clipStart = -1;
  let clipEnd = -1;
  let clipDuration = 0;
  let first = true;

  while (i < buf.length - 4) {
    const f = readFrame(buf, i);
    // Exige que o próximo frame também seja válido (evita falso sync no meio do áudio).
    if (!f || (i + f.length < buf.length - 4 && !readFrame(buf, i + f.length))) {
      i += 1;
      continue;
    }
    if (first) {
      first = false;
      if (isVbrHeaderFrame(buf, i, f.length)) { i += f.length; continue; }
    }
    validFrames += 1;
    if (t >= startSec && t < endSec) {
      if (clipStart < 0) clipStart = i;
      clipEnd = i + f.length;
      clipDuration += f.duration;
    }
    t += f.duration;
    i += f.length;
  }

  if (validFrames < 10 || clipStart < 0 || clipEnd <= clipStart) return null;
  return { clip: buf.slice(clipStart, clipEnd), totalDuration: t, clipDuration };
}

// ───────────────── Função ─────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const BUCKET = 'oculto-play-media';
const MAX_SOURCE_BYTES = 60 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type Admin = ReturnType<typeof createClient>;

async function generateForItem(admin: Admin, supabaseUrl: string, itemId: string, force: boolean) {
  const { data: item, error } = await admin
    .from('oculto_play_items')
    .select('id, kind, audio_url, audio_preview_url, preview_start_seconds, preview_end_seconds, duration_sec')
    .eq('id', itemId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!item || (item as any).kind !== 'audio') return { ok: false, error: 'not_audio' };
  const it = item as any;
  if (it.audio_preview_url && !force) return { ok: true, audio_preview_url: it.audio_preview_url, skipped: true };
  if (!it.audio_url) return { ok: false, error: 'no_audio_url' };

  const res = await fetch(String(it.audio_url).split('#')[0]);
  if (!res.ok) return { ok: false, error: `download_${res.status}` };
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_SOURCE_BYTES) return { ok: false, error: 'source_too_large' };
  const buf = new Uint8Array(await res.arrayBuffer());

  const start = Math.max(0, Number(it.preview_start_seconds ?? 0) || 0);
  const endRaw = Number(it.preview_end_seconds ?? 0) || 0;
  const length = Math.max(5, Math.min(30, endRaw > start ? endRaw - start : 30));
  let cut = cutMp3(buf, start, length);
  // Trecho salvo além do fim da faixa (dados antigos): usa o começo.
  if (!cut && start > 0) cut = cutMp3(buf, 0, length);
  if (!cut) return { ok: false, error: 'not_mp3_or_too_short' };

  const path = `previews/${it.id}/${Date.now()}.mp3`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, cut.clip, {
    contentType: 'audio/mpeg',
    upsert: true,
    cacheControl: '31536000',
  });
  if (upErr) return { ok: false, error: `upload: ${upErr.message}` };
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;

  const patch: Record<string, unknown> = { audio_preview_url: publicUrl };
  if (!(Number(it.duration_sec) > 0) && cut.totalDuration > 0) patch.duration_sec = Math.round(cut.totalDuration);
  let q = admin.from('oculto_play_items').update(patch).eq('id', it.id);
  // Sem `force`, só grava se ninguém gerou o clip enquanto isso.
  if (!force) q = q.is('audio_preview_url', null);
  const { error: updErr } = await q;
  if (updErr) return { ok: false, error: `update: ${updErr.message}` };

  // Com `force`, apaga o clip anterior do bucket (melhor esforço).
  if (force && it.audio_preview_url && it.audio_preview_url !== publicUrl) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const clean = String(it.audio_preview_url).split('#')[0].split('?')[0];
    const idx = clean.indexOf(marker);
    if (idx >= 0) {
      try { await admin.storage.from(BUCKET).remove([decodeURIComponent(clean.slice(idx + marker.length))]); } catch { /* noop */ }
    }
  }

  // Marca o job antigo (se existir) como concluído — melhor esforço.
  try {
    await admin.from('oculto_play_audio_preview_jobs')
      .update({ status: 'done', error_message: null, updated_at: new Date().toISOString() })
      .eq('item_id', it.id);
  } catch { /* tabela opcional */ }

  return { ok: true, audio_preview_url: publicUrl, clip_bytes: cut.clip.length, clip_seconds: Number(cut.clipDuration.toFixed(2)) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const serviceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth: service role (cron) OU usuário logado.
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'unauthorized' }, 401);
    const isService = token === serviceKey;
    let userId: string | null = null;
    if (!isService) {
      const { data, error } = await createClient(supabaseUrl, anonKey).auth.getUser(token);
      if (error || !data?.user) return json({ error: 'unauthorized' }, 401);
      userId = data.user.id;
    }

    const body = await req.json().catch(() => ({} as any));

    const isMaster = async () => {
      if (isService) return true;
      const { data } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin_master' });
      return data === true;
    };

    // Lote (backfill) — só master/service role.
    if (body?.backfill) {
      if (!(await isMaster())) return json({ error: 'forbidden' }, 403);
      const limit = Math.max(1, Math.min(20, Number(body.limit) || 5));
      const { data: rows } = await admin
        .from('oculto_play_items')
        .select('id')
        .eq('kind', 'audio')
        .not('audio_url', 'is', null)
        .is('audio_preview_url', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      const results = [];
      for (const r of (rows ?? []) as any[]) {
        results.push({ id: r.id, ...(await generateForItem(admin, supabaseUrl, r.id, false)) });
      }
      return json({ ok: true, processed: results.length, results });
    }

    const itemId = String(body?.item_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(itemId)) return json({ error: 'invalid_item_id' }, 400);

    // `force` (regerar um clip existente) só para o autor ou o master.
    let force = false;
    if (body?.force) {
      if (await isMaster()) {
        force = true;
      } else {
        // author_id aponta para profiles.id; o usuário logado é auth uid.
        // Busca separada (sem JOIN — o banco externo não declara a FK).
        const { data: owner } = await admin
          .from('oculto_play_items')
          .select('author_id')
          .eq('id', itemId)
          .maybeSingle();
        const authorId = (owner as any)?.author_id ?? null;
        let ownerUserId: string | null = null;
        if (authorId) {
          const { data: prof } = await admin
            .from('profiles')
            .select('user_id')
            .eq('id', authorId)
            .maybeSingle();
          ownerUserId = (prof as any)?.user_id ?? null;
        }
        force = !!userId && (authorId === userId || ownerUserId === userId);
      }
    }

    const result = await generateForItem(admin, supabaseUrl, itemId, force);
    return json(result, result.ok ? 200 : 422);
  } catch (e) {
    console.error('[oculto-play-audio-preview]', e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
