import { Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AttentionPingListenerMount } from "@/hooks/useAttentionPings";
import { GlobalChatNotificationsMount } from "@/hooks/useGlobalChatNotifications";
import { RareAchievementBroadcastMount } from "@/components/aura-match/RareAchievementBroadcast";
import { PostLoginLoadingScreen } from "@/components/PostLoginLoadingScreen";
import { rememberLastProtectedPath } from "@/lib/lastProtectedPath";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Guarda o último caminho protegido visitado — usado pelo ErrorBoundary
  // para restaurar o contexto do usuário em falhas de chunk após deploy,
  // evitando que ele volte por engano para a Landing.
  useEffect(() => {
    if (user) rememberLastProtectedPath(location.pathname + location.search);
  }, [user, location.pathname, location.search]);

  if (loading) {
    return (
      <PostLoginLoadingScreen
        message="Carregando seu Oculto..."
        hint="Verificando sua sessão com segurança"
      />
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <AttentionPingListenerMount />
      <GlobalChatNotificationsMount />
      <RareAchievementBroadcastMount />
      {children}
    </>
  );
}
