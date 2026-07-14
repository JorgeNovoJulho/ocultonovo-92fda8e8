import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, User, Loader2, Key, Plus } from 'lucide-react';
import { useTestProfilesLogin } from '@/hooks/useTestProfilesLogin';
import { useGenerateTestProfiles } from '@/hooks/useTestProfiles';
import { TestProfilesModal } from './TestProfilesModal';
import { cn } from '@/lib/utils';

export function AdminTestModeDropdown() {
  const { 
    profiles, 
    isLoading, 
    isLoggingIn, 
    loginAsTestProfile, 
    getPlanLabel, 
    getPlanColor,
    fetchTestProfiles 
  } = useTestProfilesLogin();
  
  const { generateTestProfiles, isGenerating, credentials, clearCredentials } = useGenerateTestProfiles();
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);

  const handleGenerateProfiles = async () => {
    await generateTestProfiles();
    fetchTestProfiles();
  };

  const hasProfiles = profiles.length > 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-dashed border-primary/50 text-primary hover:bg-primary/10"
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Modo Teste</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Perfis de Teste
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : hasProfiles ? (
            <>
              {profiles.map((profile) => (
                <DropdownMenuItem
                  key={profile.id}
                  onClick={() => loginAsTestProfile(profile.plan_type)}
                  className="flex items-center justify-between cursor-pointer"
                  disabled={isLoggingIn}
                >
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{profile.name}</span>
                  </div>
                  <Badge className={cn('text-xs', getPlanColor(profile.plan_type))}>
                    {getPlanLabel(profile.plan_type)}
                  </Badge>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowCredentialsModal(true)}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <Key className="h-4 w-4" />
                Ver Credenciais
              </DropdownMenuItem>
            </>
          ) : (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">
              Nenhum perfil de teste encontrado.
            </div>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleGenerateProfiles}
            disabled={isGenerating}
            className="flex items-center gap-2 text-primary"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {hasProfiles ? 'Regenerar Perfis' : 'Gerar Perfis de Teste'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modal de credenciais */}
      <TestProfilesModal
        open={showCredentialsModal || !!credentials}
        onOpenChange={(open) => {
          setShowCredentialsModal(open);
          if (!open) clearCredentials();
        }}
        profiles={credentials || profiles.map(p => ({
          email: p.email,
          password: p.email.includes('free') ? 'TesterFree2024!' :
                    p.email.includes('premium') ? 'TesterPremium2024!' : 'TesterVIP2024!',
          name: p.name,
          plan_type: p.plan_type,
          profile_id: p.id,
        }))}
      />
    </>
  );
}
