import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Clock, User, Theater, CreditCard, Ban, CheckCircle, QrCode, Smartphone, Monitor, Eye, EyeOff, Ghost } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useImpersonation } from '@/hooks/useImpersonation';
import { useImpersonationStore, SimulatedPaymentStatus, ViewportMode, SimulatedShadowbanMode } from '@/store/useImpersonationStore';
import { SimulatePixModal } from './SimulatePixModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ImpersonationBanner() {
  const { isImpersonating, targetUser, isLoading, exitImpersonation, getImpersonationInfo } = useImpersonation();
  const { simulatedStatus, setSimulatedStatus, viewportMode, setViewportMode, simulatedShadowban, setSimulatedShadowban } = useImpersonationStore();
  const [showPixModal, setShowPixModal] = useState(false);

  if (!isImpersonating || !targetUser) return null;

  const info = getImpersonationInfo();
  const duration = info?.duration || 0;

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'vip':
        return <Badge className="bg-amber-500 text-black">VIP</Badge>;
      case 'premium':
      case 'monthly':
        return <Badge className="bg-purple-600">Premium</Badge>;
      default:
        return <Badge variant="secondary">Gratuito</Badge>;
    }
  };

  const getStatusLabel = (status: SimulatedPaymentStatus) => {
    switch (status) {
      case 'overdue':
        return 'Pagamento Atrasado';
      case 'suspended':
        return 'Conta Suspensa';
      default:
        return 'Normal';
    }
  };

  const getShadowbanLabel = (mode: SimulatedShadowbanMode) => {
    switch (mode) {
      case 'as_banned_user':
        return 'Visão do Banido';
      case 'as_external_viewer':
        return 'Visão Pública';
      default:
        return 'Desativado';
    }
  };

  const handleStatusChange = (status: SimulatedPaymentStatus) => {
    setSimulatedStatus(status);
  };

  const handleShadowbanChange = (mode: SimulatedShadowbanMode) => {
    setSimulatedShadowban(mode);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Warning and User Info */}
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
            <span className="font-semibold text-sm sm:text-base">
              MODO TESTE
            </span>
            <span className="hidden sm:inline text-white/90">|</span>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 hidden sm:block" />
              <span className="text-sm sm:text-base font-medium truncate max-w-[150px] sm:max-w-none">
                {targetUser.name}
              </span>
              {targetUser.username && (
                <span className="text-white/70 text-sm hidden md:inline">
                  @{targetUser.username}
                </span>
              )}
            </div>
            {getPlanBadge(targetUser.plan_type)}
            
            {/* Status Simulation Badge */}
            {simulatedStatus && simulatedStatus !== 'active' && (
              <Badge variant="outline" className="border-white/50 text-white bg-white/10">
                🎭 {getStatusLabel(simulatedStatus)}
              </Badge>
            )}
            
            {/* Shadowban Simulation Badge */}
            {simulatedShadowban && simulatedShadowban !== 'off' && (
              <Badge variant="outline" className="border-white/50 text-white bg-purple-500/30">
                👻 {getShadowbanLabel(simulatedShadowban)}
              </Badge>
            )}
          </div>

          {/* Right: Viewport Toggle, Simulation Dropdown, PIX Button, Duration and Exit Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Viewport Mode Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewportMode(viewportMode === 'mobile' ? 'desktop' : 'mobile')}
              className="text-white hover:bg-white/20 gap-2"
              title={viewportMode === 'mobile' ? 'Alternar para Desktop' : 'Alternar para Mobile'}
            >
              {viewportMode === 'mobile' ? (
                <>
                  <Smartphone className="h-4 w-4" />
                  <span className="hidden md:inline">Mobile</span>
                </>
              ) : (
                <>
                  <Monitor className="h-4 w-4" />
                  <span className="hidden md:inline">Desktop</span>
                </>
              )}
            </Button>

            {/* PIX Simulation Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPixModal(true)}
              className="text-white hover:bg-white/20 gap-2"
            >
              <QrCode className="h-4 w-4" />
              <span className="hidden md:inline">Simular PIX</span>
            </Button>

            {/* Simulation Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/20 gap-2"
                >
                  <Theater className="h-4 w-4" />
                  <span className="hidden sm:inline">Simular Status</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Simular Status Financeiro</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => handleStatusChange('active')}
                  className="gap-2"
                >
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Normal (Pagamento OK)</span>
                  {(!simulatedStatus || simulatedStatus === 'active') && (
                    <Badge variant="secondary" className="ml-auto text-xs">Ativo</Badge>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleStatusChange('overdue')}
                  className="gap-2"
                >
                  <CreditCard className="h-4 w-4 text-amber-500" />
                  <span>⚠️ Pagamento Atrasado</span>
                  {simulatedStatus === 'overdue' && (
                    <Badge variant="secondary" className="ml-auto text-xs">Ativo</Badge>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleStatusChange('suspended')}
                  className="gap-2"
                >
                  <Ban className="h-4 w-4 text-red-500" />
                  <span>🚫 Conta Suspensa</span>
                  {simulatedStatus === 'suspended' && (
                    <Badge variant="secondary" className="ml-auto text-xs">Ativo</Badge>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Shadowban Simulation Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/20 gap-2"
                >
                  <Ghost className="h-4 w-4" />
                  <span className="hidden sm:inline">Shadowban</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Simular Shadowban</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => handleShadowbanChange('off')}
                  className="gap-2"
                >
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Desativado</span>
                  {(!simulatedShadowban || simulatedShadowban === 'off') && (
                    <Badge variant="secondary" className="ml-auto text-xs">Ativo</Badge>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleShadowbanChange('as_banned_user')}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4 text-amber-500" />
                  <div className="flex flex-col">
                    <span>👤 Visão do Usuário Banido</span>
                    <span className="text-xs text-muted-foreground">Ações parecem funcionar normalmente</span>
                  </div>
                  {simulatedShadowban === 'as_banned_user' && (
                    <Badge variant="secondary" className="ml-auto text-xs">Ativo</Badge>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleShadowbanChange('as_external_viewer')}
                  className="gap-2"
                >
                  <EyeOff className="h-4 w-4 text-purple-500" />
                  <div className="flex flex-col">
                    <span>🔍 Visão Pública (Validação)</span>
                    <span className="text-xs text-muted-foreground">Verifica se conteúdo está oculto</span>
                  </div>
                  {simulatedShadowban === 'as_external_viewer' && (
                    <Badge variant="secondary" className="ml-auto text-xs">Ativo</Badge>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="hidden sm:flex items-center gap-1 text-white/80 text-sm">
              <Clock className="h-4 w-4" />
              <span>{duration} min</span>
            </div>
            
            <Button
              variant="secondary"
              size="sm"
              onClick={exitImpersonation}
              disabled={isLoading}
              className="bg-white text-red-600 hover:bg-white/90 font-semibold gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Encerrar e Voltar</span>
              <span className="sm:hidden">Voltar</span>
            </Button>
          </div>
        </div>
      </div>

      {/* PIX Simulation Modal */}
      <SimulatePixModal
        open={showPixModal}
        onOpenChange={setShowPixModal}
        userName={targetUser.name}
        planType={targetUser.plan_type}
      />
    </div>
  );
}