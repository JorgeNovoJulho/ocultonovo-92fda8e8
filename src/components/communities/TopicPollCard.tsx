/**
 * TopicPollCard — exibe enquete do tópico com barras de porcentagem,
 * voto único ou múltiplo, contagem total, status de fechamento e ações
 * de fechar/remover para autor ou moderador.
 *
 * Quando ainda não existe enquete, o autor do tópico ou um moderador
 * pode criar via formulário inline (pergunta + 2-8 opções + múltipla escolha).
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BarChart3, Check, Plus, X, Lock, Unlock, Trash2, MoreVertical, Loader2, Vote,
} from 'lucide-react';
import {
  useTopicPoll,
  useCreateTopicPoll,
  useVoteTopicPoll,
  useCloseTopicPoll,
  useDeleteTopicPoll,
} from '@/hooks/useCommunities';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  topicId: string;
  topicAuthorId: string;
  currentUserId: string | undefined;
  isMember: boolean;
  isMod: boolean;
  isTopicLocked: boolean;
}

export function TopicPollCard({
  topicId, topicAuthorId, currentUserId, isMember, isMod, isTopicLocked,
}: Props) {
  const { data: poll, isLoading } = useTopicPoll(topicId);
  const create = useCreateTopicPoll(topicId);
  const vote = useVoteTopicPoll(topicId);
  const close = useCloseTopicPoll(topicId);
  const del = useDeleteTopicPoll(topicId);

  const isOwner = currentUserId && topicAuthorId === currentUserId;
  const canManage = isOwner || isMod;

  // Form (quando não há enquete)
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);

  const isEffectivelyClosed = useMemo(() => {
    if (!poll) return false;
    if (poll.is_closed) return true;
    if (poll.closes_at && new Date(poll.closes_at).getTime() < Date.now()) return true;
    return false;
  }, [poll]);

  if (isLoading) return null;

  // ─── Nenhuma enquete: oferecer criação para autor/mod ───
  if (!poll) {
    if (!canManage || isTopicLocked) return null;
    if (!showForm) {
      return (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
            className="gap-1.5 text-xs h-8"
          >
            <BarChart3 className="h-3.5 w-3.5 text-fuchsia-400" />
            Adicionar enquete
          </Button>
        </div>
      );
    }
    return (
      <div className="mt-3 rounded-xl border border-fuchsia-500/40 bg-card/40 p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-fuchsia-400" />
          <p className="text-xs font-semibold">Nova enquete</p>
          <button
            onClick={() => { setShowForm(false); setQuestion(''); setOptions(['','']); }}
            className="ml-auto h-7 w-7 rounded hover:bg-accent flex items-center justify-center text-muted-foreground"
            title="Cancelar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div>
          <Label className="text-xs">Pergunta</Label>
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Sobre o que vocês querem decidir?"
            maxLength={140}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Opções ({options.length}/8)</Label>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={opt}
                onChange={(e) => {
                  const next = [...options];
                  next[i] = e.target.value;
                  setOptions(next);
                }}
                placeholder={`Opção ${i + 1}`}
                maxLength={80}
              />
              {options.length > 2 && (
                <button
                  onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                  className="h-9 w-9 rounded hover:bg-destructive/20 flex items-center justify-center text-destructive shrink-0"
                  title="Remover opção"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {options.length < 8 && (
            <button
              onClick={() => setOptions([...options, ''])}
              className="text-[11px] text-fuchsia-300 hover:text-fuchsia-200 inline-flex items-center gap-1 px-1 py-1"
            >
              <Plus className="h-3 w-3" /> Adicionar opção
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
          <div>
            <p className="text-xs font-medium">Permitir múltipla escolha</p>
            <p className="text-[10px] text-muted-foreground">Cada pessoa pode marcar várias opções.</p>
          </div>
          <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} />
        </div>

        <Button
          className="w-full gap-1"
          disabled={
            create.isPending ||
            question.trim().length < 3 ||
            options.filter((o) => o.trim()).length < 2
          }
          onClick={async () => {
            await create.mutateAsync({
              question: question.trim(),
              options: options.map((o) => o.trim()).filter(Boolean),
              allow_multiple: allowMultiple,
            });
            setShowForm(false); setQuestion(''); setOptions(['','']); setAllowMultiple(false);
          }}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Vote className="h-4 w-4" />}
          Criar enquete
        </Button>
      </div>
    );
  }

  // ─── Renderiza enquete existente ───
  const totalVotes = poll.total_votes;
  const myVotes = new Set(poll.my_option_ids);
  const hasVoted = myVotes.size > 0;
  const canVote = isMember && !isEffectivelyClosed && !isTopicLocked;

  return (
    <div className="mt-3 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/[0.03] p-3">
      <div className="flex items-start gap-2">
        <div className="h-7 w-7 rounded-md bg-fuchsia-600/20 border border-fuchsia-500/40 flex items-center justify-center shrink-0">
          <BarChart3 className="h-3.5 w-3.5 text-fuchsia-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[10px] uppercase font-semibold text-fuchsia-300/80">Enquete</p>
            {poll.allow_multiple && <Badge variant="outline" className="text-[9px] h-4 px-1.5">múltipla</Badge>}
            {isEffectivelyClosed && (
              <Badge className="bg-muted text-muted-foreground text-[9px] h-4 px-1.5 gap-0.5">
                <Lock className="h-2.5 w-2.5" /> Encerrada
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold mt-0.5">{poll.question}</p>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 w-7 rounded hover:bg-accent flex items-center justify-center text-muted-foreground shrink-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => close.mutate({ poll_id: poll.poll_id, close: !poll.is_closed })}>
                {poll.is_closed
                  ? <><Unlock className="h-3.5 w-3.5 mr-2" /> Reabrir</>
                  : <><Lock className="h-3.5 w-3.5 mr-2" /> Encerrar</>}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (window.confirm('Remover esta enquete? Os votos serão perdidos.'))
                    del.mutate(poll.poll_id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5">
        {poll.options.map((opt) => {
          const pct = totalVotes === 0 ? 0 : Math.round((opt.votes * 100) / totalVotes);
          const isMine = myVotes.has(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() => canVote && vote.mutate({ poll_id: poll.poll_id, option_id: opt.id })}
              disabled={!canVote || vote.isPending}
              className={`relative w-full text-left rounded-lg border overflow-hidden transition-colors ${
                isMine
                  ? 'border-fuchsia-500/60 bg-fuchsia-500/10'
                  : 'border-border bg-background/40 hover:border-fuchsia-500/40'
              } ${!canVote ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <div
                className={`absolute inset-y-0 left-0 transition-all ${
                  isMine ? 'bg-fuchsia-500/25' : 'bg-fuchsia-500/10'
                }`}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center gap-2 px-3 py-2">
                <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                  isMine ? 'border-fuchsia-400 bg-fuchsia-500/40' : 'border-muted-foreground/40'
                }`}>
                  {isMine && <Check className="h-2.5 w-2.5" />}
                </div>
                <span className="text-sm font-medium flex-1 truncate">{opt.label}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {pct}% · {opt.votes}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
        <span>{totalVotes} voto{totalVotes === 1 ? '' : 's'}</span>
        {poll.closes_at && (
          <span>
            {isEffectivelyClosed
              ? `encerrada ${formatDistanceToNow(new Date(poll.closes_at), { addSuffix: true, locale: ptBR })}`
              : `encerra ${formatDistanceToNow(new Date(poll.closes_at), { addSuffix: true, locale: ptBR })}`}
          </span>
        )}
        {!hasVoted && canVote && (
          <span className="text-fuchsia-300">toque numa opção para votar</span>
        )}
      </div>
    </div>
  );
}
