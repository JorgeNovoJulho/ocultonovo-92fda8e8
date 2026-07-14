import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Trophy, Clock, CheckCircle, DollarSign, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreatorPoll } from "@/hooks/useCreatorPolls";

interface PollRankingCardProps {
  poll: CreatorPoll;
  rank: number;
}

export function PollRankingCard({ poll, rank }: PollRankingCardProps) {
  const getRankBadge = () => {
    if (rank === 1) {
      return (
        <Badge className="bg-yellow-500 text-yellow-950 border-0">
          <Trophy className="h-3 w-3 mr-1" />
          #1
        </Badge>
      );
    }
    if (rank === 2) {
      return (
        <Badge className="bg-gray-400 text-gray-900 border-0">
          <Trophy className="h-3 w-3 mr-1" />
          #2
        </Badge>
      );
    }
    if (rank === 3) {
      return (
        <Badge className="bg-amber-600 text-amber-50 border-0">
          <Trophy className="h-3 w-3 mr-1" />
          #3
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">#{rank}</Badge>
    );
  };

  const maxVotes = Math.max(...poll.options.map((o) => o.votes_count), 1);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  };

  return (
    <Card className="overflow-hidden hover:border-primary/50 transition-colors">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getRankBadge()}
              {poll.is_active ? (
                <Badge variant="outline" className="border-emerald-500 text-emerald-500">
                  <Clock className="h-3 w-3 mr-1" />
                  Ativa
                </Badge>
              ) : (
                <Badge variant="outline" className="border-muted-foreground">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Encerrada
                </Badge>
              )}
            </div>
            <h4 className="font-medium text-sm line-clamp-2">{poll.question}</h4>
          </div>
        </div>

        {/* Mini Progress Bars */}
        <div className="space-y-1.5 mb-3">
          {poll.options.slice(0, 3).map((option) => (
            <div key={option.id} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="truncate text-muted-foreground">{option.option_text}</span>
                  <span className="font-medium">{option.votes_count}</span>
                </div>
                <Progress 
                  value={(option.votes_count / maxVotes) * 100} 
                  className="h-1.5"
                />
              </div>
            </div>
          ))}
          {poll.options.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{poll.options.length - 3} opções
            </p>
          )}
        </div>

        {/* Stats Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {poll.total_votes} votos
            </span>
            <span className="flex items-center gap-1 text-emerald-500 font-medium">
              <DollarSign className="h-3 w-3" />
              R$ {poll.total_revenue.toFixed(2)}
            </span>
          </div>
          <span>{formatDate(poll.created_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
