import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, Clock, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCartByToken, useMarkCartClicked } from '@/hooks/useCartAbandonment';
import { toast } from '@/hooks/use-toast';

export default function CheckoutResumePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  // Sem token (ex: dica "Você deixou algo pendente" sem cart específico) →
  // redireciona direto para a página de planos, evitando "Link Inválido".
  useEffect(() => {
    if (!token) {
      navigate('/subscriptions', { replace: true });
    }
  }, [token, navigate]);

  const { data: cart, isLoading, error } = useCartByToken(token);
  const { mutate: markClicked } = useMarkCartClicked();

  // Mark as clicked when page loads
  useEffect(() => {
    if (token && cart && cart.status !== 'clicked' && cart.status !== 'recovered') {
      markClicked(token);
    }
  }, [token, cart, markClicked]);

  // Auto-redirect to checkout if cart is valid
  useEffect(() => {
    if (cart && cart.status !== 'recovered' && cart.status !== 'expired') {
      // Check if magic link is still valid
      const expiresAt = new Date(cart.magic_link_expires_at || cart.created_at);
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity

      if (new Date() < expiresAt) {
        // Build checkout URL with cart data
        const params = new URLSearchParams({
          plan: cart.plan_type,
          amount: cart.amount.toString(),
          recovered: 'true',
        });

        if (cart.coupon_code) {
          params.set('coupon', cart.coupon_code);
        }

        if (cart.ghost_mode) {
          params.set('ghost', 'true');
        }

        // Redirect after a brief moment
        const timer = setTimeout(() => {
          navigate(`/checkout?${params.toString()}`);
        }, 2000);

        return () => clearTimeout(timer);
      }
    }
  }, [cart, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando seu carrinho...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !cart) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Link Inválido</CardTitle>
            <CardDescription>
              Este link de recuperação não é válido ou já expirou.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate('/')} className="w-full">
              Voltar para o Início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cart.status === 'recovered') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <ShoppingCart className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-green-600">Compra Já Realizada!</CardTitle>
            <CardDescription>
              Você já finalizou essa compra. Aproveite seu acesso VIP! 💎
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate('/feed')} className="w-full">
              Ir para o Feed
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check expiration
  const expiresAt = new Date(cart.magic_link_expires_at || cart.created_at);
  expiresAt.setDate(expiresAt.getDate() + 7);
  
  if (new Date() >= expiresAt) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
            <CardTitle>Link Expirado</CardTitle>
            <CardDescription>
              Este link de recuperação expirou. Inicie um novo checkout para continuar.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate('/checkout')} className="w-full">
              Novo Checkout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading/redirect state
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Bem-vindo de Volta! 👋</CardTitle>
          <CardDescription>
            Encontramos seu carrinho. Redirecionando para o checkout...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Plano:</span>
                <span className="font-medium">
                  {cart.plan_type === 'annual' ? 'Anual' : 'Mensal'}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-muted-foreground">Valor:</span>
                <span className="font-bold text-primary">
                  R$ {cart.amount.toFixed(2).replace('.', ',')}
                </span>
              </div>
              {cart.coupon_code && (
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">Cupom:</span>
                  <span className="font-medium text-green-600">{cart.coupon_code}</span>
                </div>
              )}
              {cart.ghost_mode && (
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">Modo Fantasma:</span>
                  <span className="font-medium">Incluído 👻</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Redirecionando em 2 segundos...</span>
            </div>

            <Button 
              onClick={() => {
                const params = new URLSearchParams({
                  plan: cart.plan_type,
                  amount: cart.amount.toString(),
                  recovered: 'true',
                });
                if (cart.coupon_code) params.set('coupon', cart.coupon_code);
                if (cart.ghost_mode) params.set('ghost', 'true');
                navigate(`/checkout?${params.toString()}`);
              }}
              className="w-full"
            >
              Continuar Agora
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
