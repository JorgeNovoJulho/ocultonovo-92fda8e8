import React, { useState } from 'react';
import { Phone, ArrowRight, Shield, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidBrazilianPhone, formatPhoneForDisplay } from '@/hooks/useCartAbandonment';

interface PhoneCaptureStepProps {
  onSubmit: (phone: string, name?: string) => void;
  isLoading?: boolean;
  userName?: string;
}

export function PhoneCaptureStep({ onSubmit, isLoading, userName }: PhoneCaptureStepProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState(userName || '');
  const [error, setError] = useState('');

  const formatInput = (value: string) => {
    // Remove non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format as (XX) XXXXX-XXXX
    if (digits.length <= 2) {
      return digits;
    } else if (digits.length <= 7) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    } else {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatInput(e.target.value);
    setPhone(formatted);
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const digits = phone.replace(/\D/g, '');
    
    if (!isValidBrazilianPhone(digits)) {
      setError('Digite um número de celular válido com DDD');
      return;
    }

    onSubmit(digits, name || undefined);
  };

  const isValid = isValidBrazilianPhone(phone.replace(/\D/g, ''));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <MessageCircle className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Quase lá! 📱</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Informe seu WhatsApp para receber o link de acesso
        </p>
      </div>

      <div className="space-y-4">
        {!userName && (
          <div className="space-y-2">
            <Label htmlFor="name">Seu nome</Label>
            <Input
              id="name"
              type="text"
              placeholder="Como quer ser chamado?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="phone">WhatsApp</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="phone"
              type="tel"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={handlePhoneChange}
              className={`pl-10 ${error ? 'border-destructive' : ''}`}
              autoComplete="tel"
              maxLength={16}
            />
          </div>
          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}
        </div>
      </div>

      <Button 
        type="submit" 
        className="w-full h-12 text-base gap-2"
        disabled={!isValid || isLoading}
      >
        {isLoading ? (
          'Processando...'
        ) : (
          <>
            Ir para Pagamento
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
        <Shield className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Seu número é protegido e será usado apenas para enviar informações sobre sua assinatura.
          Não compartilhamos seus dados.
        </p>
      </div>
    </form>
  );
}
