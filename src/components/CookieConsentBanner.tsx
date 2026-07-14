import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, Settings, Shield, BarChart3, Sparkles, Target, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCookieConsent, CookiePreferences } from '@/hooks/useCookieConsent';
import { Link } from 'react-router-dom';

export function CookieConsentBanner() {
  const { 
    preferences, 
    showBanner, 
    setShowBanner,
    savePreferences, 
    acceptAll, 
    acceptEssentialOnly,
    isLoading,
    hasConsented,
  } = useCookieConsent();
  
  const [showSettings, setShowSettings] = useState(false);
  const [tempPreferences, setTempPreferences] = useState<CookiePreferences>(preferences);

  // Não exibir em páginas públicas de convite nem em links públicos de
  // compartilhamento do OCULTO PLAY (/play/p/:id e /play/share/:id).
  if (typeof window !== 'undefined' && (
    /^\/creator-invite(\/|$)/.test(window.location.pathname) ||
    /^\/play\/(p|share)\//.test(window.location.pathname)
  )) {
    return null;
  }

  // Garantia extra: se já consentiu (localStorage), não renderiza nada — apenas no primeiro acesso
  if (hasConsented || isLoading || !showBanner) {
    return null;
  }


  const handleSaveCustom = () => {
    savePreferences(tempPreferences);
    setShowSettings(false);
  };

  const cookieCategories = [
    {
      id: 'essential' as const,
      icon: Shield,
      title: 'Essenciais',
      description: 'Necessários para o funcionamento básico do site. Não podem ser desativados.',
      required: true,
    },
    {
      id: 'analytics' as const,
      icon: BarChart3,
      title: 'Analytics',
      description: 'Nos ajudam a entender como você usa o site para melhorar sua experiência.',
      required: false,
    },
    {
      id: 'personalization' as const,
      icon: Sparkles,
      title: 'Personalização',
      description: 'Permitem lembrar suas preferências e personalizar o conteúdo para você.',
      required: false,
    },
    {
      id: 'marketing' as const,
      icon: Target,
      title: 'Marketing',
      description: 'Usados para mostrar anúncios relevantes e medir a eficácia das campanhas.',
      required: false,
    },
  ];

  return (
    <>
      {/* Banner Principal */}
      <AnimatePresence>
        {showBanner && !showSettings && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
          >
            <div className="max-w-4xl mx-auto bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Header com gradiente */}
              <div className="bg-gradient-to-r from-primary/20 to-accent/20 p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-full">
                    <Cookie className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">Usamos Cookies 🍪</h3>
                    <p className="text-sm text-muted-foreground">
                      Para melhorar sua experiência conforme a LGPD
                    </p>
                  </div>
                </div>
              </div>

              {/* Conteúdo */}
              <div className="p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Utilizamos cookies e tecnologias semelhantes para melhorar sua experiência, 
                  personalizar conteúdo e analisar nosso tráfego. Você pode personalizar suas 
                  preferências ou aceitar todas.{' '}
                  <Link 
                    to="/legal/cookies" 
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Saiba mais <ExternalLink className="w-3 h-3" />
                  </Link>
                </p>

                {/* Botões de ação */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={acceptAll}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    Aceitar Todos
                  </Button>
                  <Button
                    onClick={acceptEssentialOnly}
                    variant="outline"
                    className="flex-1"
                  >
                    Apenas Essenciais
                  </Button>
                  <Button
                    onClick={() => {
                      setTempPreferences(preferences);
                      setShowSettings(true);
                    }}
                    variant="ghost"
                    className="flex-1 gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Configurar
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Configurações Detalhadas */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Configurações de Cookies
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Escolha quais categorias de cookies você deseja permitir. 
              Suas preferências serão salvas e você pode alterá-las a qualquer momento 
              nas configurações de privacidade.
            </p>

            {/* Lista de categorias */}
            <div className="space-y-4">
              {cookieCategories.map((category) => {
                const Icon = category.icon;
                const isEnabled = category.required || tempPreferences[category.id];

                return (
                  <div
                    key={category.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      isEnabled 
                        ? 'border-primary/50 bg-primary/5' 
                        : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${
                          isEnabled ? 'bg-primary/20' : 'bg-muted'
                        }`}>
                          <Icon className={`w-4 h-4 ${
                            isEnabled ? 'text-primary' : 'text-muted-foreground'
                          }`} />
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground flex items-center gap-2">
                            {category.title}
                            {category.required && (
                              <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                Obrigatório
                              </span>
                            )}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {category.description}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={isEnabled}
                        disabled={category.required}
                        onCheckedChange={(checked) => {
                          if (!category.required) {
                            setTempPreferences(prev => ({
                              ...prev,
                              [category.id]: checked
                            }));
                          }
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Links legais */}
            <div className="flex flex-wrap gap-4 text-sm pt-4 border-t border-border">
              <Link 
                to="/legal/cookies" 
                className="text-primary hover:underline"
                onClick={() => setShowSettings(false)}
              >
                Política de Cookies
              </Link>
              <Link 
                to="/legal/privacidade" 
                className="text-primary hover:underline"
                onClick={() => setShowSettings(false)}
              >
                Política de Privacidade
              </Link>
              <Link 
                to="/legal/termos-de-uso" 
                className="text-primary hover:underline"
                onClick={() => setShowSettings(false)}
              >
                Termos de Uso
              </Link>
            </div>
          </div>

          {/* Botões do modal */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button
              onClick={handleSaveCustom}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              Salvar Preferências
            </Button>
            <Button
              onClick={() => setShowSettings(false)}
              variant="outline"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
