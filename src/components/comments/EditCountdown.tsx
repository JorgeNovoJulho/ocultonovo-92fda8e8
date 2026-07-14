import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditCountdownProps {
  createdAt: string;
  onExpire?: () => void;
  className?: string;
}

export function EditCountdown({ createdAt, onExpire, className }: EditCountdownProps) {
  const [remaining, setRemaining] = useState<number>(0);
  
  useEffect(() => {
    const calculateRemaining = () => {
      const created = new Date(createdAt).getTime();
      const now = Date.now();
      const diffMs = (5 * 60 * 1000) - (now - created);
      return Math.max(0, diffMs);
    };
    
    setRemaining(calculateRemaining());
    
    const interval = setInterval(() => {
      const newRemaining = calculateRemaining();
      setRemaining(newRemaining);
      
      if (newRemaining <= 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [createdAt, onExpire]);
  
  if (remaining <= 0) return null;
  
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  
  // Cor muda de verde para amarelo para vermelho conforme o tempo diminui
  const colorClass = remaining > 180000 
    ? 'text-green-500' 
    : remaining > 60000 
      ? 'text-yellow-500' 
      : 'text-destructive';
  
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs font-mono tabular-nums',
      colorClass,
      className
    )}>
      <Clock className="h-3 w-3" />
      {minutes}:{seconds.toString().padStart(2, '0')}
    </span>
  );
}
