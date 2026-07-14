import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { Shield, LogOut, ChevronLeft, AlertTriangle, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminStore } from "@/store/useAdminStore";
import { useAdminMetrics } from "@/hooks/useAdminMetrics";
import { useVerificationStats } from "@/hooks/useAdminVerifications";
import { useOpenSupportCount } from "@/hooks/useOpenSupportCount";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AdminNotificationBell } from "@/components/admin/AdminNotificationBell";
import AdminAlertsBell from "@/components/admin/AdminAlertsBell";
import { AdminTestModeDropdown } from "@/components/admin/AdminTestModeDropdown";
import { AdminThemeToggle } from "@/components/admin/AdminThemeToggle";
import { AdminPushPrompt } from "@/components/admin/AdminPushPrompt";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminSidebarNavGroup } from "@/components/admin/AdminSidebarNavGroup";
import { adminTopLevelItems, adminNavGroups, filterAdminNavGroups, filterAdminTopLevel } from "@/config/adminNavConfig";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useDeferredMount } from "@/hooks/useDeferredMount";

export function AdminLayout() {
  const navigate = useNavigate();
  const { currentAdminRole, setAdminRole } = useAdminStore();
  const { data: realMetrics } = useAdminMetrics();
  // Badges secundários da sidebar — adiados para não competir com o primeiro
  // paint da página admin (cada hook abre fetch Supabase + realtime).
  const badgesReady = useDeferredMount(1200);
  const { data: verificationStats } = useVerificationStats(badgesReady);
  const openSupportCount = useOpenSupportCount(badgesReady);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: isMaster = false } = useIsMasterAdmin();
  const { profile } = useProfile();
  const { user } = useAuth();
  const usernameFromMeta = (user?.user_metadata as any)?.username as string | undefined;
  const usernameFromEmail = user?.email ? user.email.split("@")[0] : undefined;
  const rawHandle = profile?.username || usernameFromMeta || usernameFromEmail;
  const adminHandle = rawHandle ? `@${String(rawHandle).replace(/^@+/, "")}` : "@admin";

  const visibleTopLevel = filterAdminTopLevel(adminTopLevelItems, isMaster);
  const visibleGroups = filterAdminNavGroups(adminNavGroups, isMaster);

  const pendingVerifications = (verificationStats?.autoApproved || 0) + (verificationStats?.pending || 0);

  const handleExitAdmin = () => {
    setAdminRole(null);
    navigate("/feed");
  };

  const getRoleBadge = () => {
    switch (currentAdminRole) {
      case 'ADMIN_MASTER':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Master</Badge>;
      case 'ADMIN_REGIONAL':
        return <Badge className="bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30">Regional</Badge>;
      case 'MODERATOR':
        return <Badge className="bg-primary/20 text-primary border-primary/30">Moderador</Badge>;
      default:
        return null;
    }
  };

  const getBadgeValue = (badgeKey?: string): number | undefined => {
    if (!badgeKey) return undefined;
    if (badgeKey === "pendingReports") return realMetrics?.pendingReports ?? 0;
    if (badgeKey === "pendingVerifications") return pendingVerifications;
    if (badgeKey === "openSupportTickets") return openSupportCount;
    return undefined;
  };

  const SidebarContent = ({ onNavClick }: { onNavClick?: () => void }) => (
    <>
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
            <Shield className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="font-bold text-foreground">Admin Panel</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {getRoleBadge()}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <nav className="p-3 space-y-1">
          {visibleTopLevel.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={onNavClick}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
                  isActive
                    ? "bg-destructive/10 text-destructive border border-destructive/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {visibleGroups.map((group) => (
            <AdminSidebarNavGroup
              key={group.title}
              title={group.title}
              icon={group.icon}
              defaultOpen={group.defaultOpen}
              items={group.items.map((item) => ({
                ...item,
                badge: getBadgeValue(item.badgeKey),
                badgeColor:
                  item.badgeKey === "pendingVerifications"
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                    : undefined,
              }))}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-border/50 space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          onClick={() => { onNavClick?.(); handleExitAdmin(); }}
        >
          <ChevronLeft className="h-5 w-5" />
          <span>Voltar ao App</span>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={async () => {
            onNavClick?.();
            await supabase.auth.signOut();
            navigate("/login", { replace: true });
          }}
        >
          <LogOut className="h-5 w-5" />
          <span>Sair</span>
        </Button>
      </div>
    </>
  );

  return (
    /* CRÍTICO: sem h-screen nem overflow-hidden no root — scroll nativo da janela */
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Desktop Sidebar — posição sticky, não fixed, para não travar o body */}
      <aside className="hidden lg:flex w-64 bg-card border-r border-border/50 flex-col shrink-0 sticky top-0 h-screen overflow-y-auto">
        <SidebarContent />
      </aside>

      {/* Main Content — ocupa o restante, scroll nativo da janela */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Bar */}
        <header className="h-14 border-b border-border/50 bg-card/50 flex items-center justify-between px-4 lg:px-6 shrink-0 sticky top-0 z-40">
          <div className="flex items-center gap-2">
            {/* Mobile Menu Button */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 flex flex-col">
                <SidebarContent onNavClick={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <AlertTriangle className="h-4 w-4 text-[hsl(45,93%,47%)] hidden sm:block" />
            <span className="text-sm text-muted-foreground hidden sm:block">
              Ambiente Administrativo - Ações são registradas
            </span>
            <span className="text-sm text-muted-foreground sm:hidden">{adminHandle}</span>
          </div>
          <TooltipProvider>
            <div className="flex items-center gap-2 sm:gap-3">
              <AdminTestModeDropdown />
              <AdminThemeToggle />
              <AdminAlertsBell />
              <AdminNotificationBell />
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium leading-tight">{adminHandle}</p>
                <p className="text-xs text-muted-foreground">{currentAdminRole}</p>
              </div>
            </div>
          </TooltipProvider>
        </header>

        {/* Page Content — scroll nativo da janela, sem overflow interno */}
        <main className="flex-1 bg-background/50 overflow-x-hidden" data-admin-scope>
          <Outlet />
        </main>
        <AdminPushPrompt />
      </div>
    </div>
  );
}
