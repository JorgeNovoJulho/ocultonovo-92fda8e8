import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RealFeed } from "@/components/RealFeed";

const Index = () => {
  const navigate = useNavigate();
  // Pós-login: se o usuário veio de um link de compartilhamento do OCULTO PLAY,
  // levamos direto para o item, restaurando o contexto do visitante.
  useEffect(() => {
    try {
      const itemId = sessionStorage.getItem('oculto_play_return_item');
      if (itemId) {
        sessionStorage.removeItem('oculto_play_return_item');
        navigate(`/oculto-play?item=${itemId}`, { replace: true });
      }
    } catch { /* noop */ }
  }, [navigate]);

  return <RealFeed />;
};

export default Index;
