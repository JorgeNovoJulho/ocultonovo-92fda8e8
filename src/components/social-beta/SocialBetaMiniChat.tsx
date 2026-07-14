import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { Send } from 'lucide-react';

type Msg = { id: string; user_id: string; body: string; created_at: string };

export function SocialBetaMiniChat({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('oculto_social_beta_session_messages')
        .select('id,user_id,body,created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (alive) setMessages((data || []) as Msg[]);
    })();
    const unsub = subscribeTable('oculto_social_beta_session_messages', (payload: any) => {
      const row = payload?.new as Msg | undefined;
      if (!row || (row as any).session_id !== sessionId) return;
      setMessages((prev) => [...prev, row]);
    }, { events: ['INSERT'] });
    return () => { alive = false; unsub(); };
  }, [sessionId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setBody('');
    const { error } = await (supabase as any).rpc('social_beta_post_message', { _session_id: sessionId, _body: text });
    if (error) setBody(text);
    setSending(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col h-72">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">Mini chat da sessão</div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground">Sem mensagens ainda.</p>
        )}
        {messages.map((m) => {
          const mine = m.user_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border p-2 flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Escreva uma mensagem"
          maxLength={1000}
          className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
