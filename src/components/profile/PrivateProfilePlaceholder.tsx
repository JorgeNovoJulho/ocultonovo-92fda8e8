import { Lock, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PrivateProfilePlaceholderProps {
  creatorName: string;
  onFollow: () => void;
  isFollowing: boolean;
  followLoading: boolean;
}

export function PrivateProfilePlaceholder({ creatorName, onFollow, isFollowing, followLoading }: PrivateProfilePlaceholderProps) {
  return (
    <Card className="mt-6 p-8 text-center bg-card/50 border-border/30">
      <CardContent className="space-y-4">
        <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          Este perfil é privado
        </h3>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Siga <strong>{creatorName}</strong> para ver suas publicações e conteúdo.
        </p>
        {!isFollowing && (
          <Button
            onClick={onFollow}
            disabled={followLoading}
            className="gap-2 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
          >
            <UserPlus className="h-4 w-4" />
            Seguir
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
