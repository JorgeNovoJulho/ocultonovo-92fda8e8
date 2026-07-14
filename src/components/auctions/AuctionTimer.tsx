import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Clock, AlertTriangle } from "lucide-react";

interface AuctionTimerProps {
  endsAt: string;
  onEnd?: () => void;
  className?: string;
  showIcon?: boolean;
}

export function AuctionTimer({ endsAt, onEnd, className, showIcon = true }: AuctionTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isEnded: boolean;
    isUrgent: boolean;
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isEnded: false,
    isUrgent: false,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const endTime = new Date(endsAt).getTime();
      const now = Date.now();
      const difference = endTime - now;

      if (difference <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isEnded: true,
          isUrgent: false,
        });
        onEnd?.();
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      // Urgent if less than 1 minute
      const isUrgent = difference < 60000;

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        isEnded: false,
        isUrgent,
      });
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [endsAt, onEnd]);

  if (timeLeft.isEnded) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
        {showIcon && <Clock className="h-4 w-4" />}
        <span className="font-medium">Encerrado</span>
      </div>
    );
  }

  const formatNumber = (num: number) => num.toString().padStart(2, "0");

  return (
    <div
      className={cn(
        "flex items-center gap-2 font-mono transition-colors",
        timeLeft.isUrgent && "text-destructive animate-pulse",
        !timeLeft.isUrgent && "text-foreground",
        className
      )}
    >
      {showIcon && (
        timeLeft.isUrgent ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Clock className="h-4 w-4" />
        )
      )}
      <div className="flex items-center gap-1">
        {timeLeft.days > 0 && (
          <>
            <span className="font-bold">{timeLeft.days}</span>
            <span className="text-muted-foreground text-xs">d</span>
          </>
        )}
        <span className="font-bold">{formatNumber(timeLeft.hours)}</span>
        <span className="text-muted-foreground">:</span>
        <span className="font-bold">{formatNumber(timeLeft.minutes)}</span>
        <span className="text-muted-foreground">:</span>
        <span className="font-bold">{formatNumber(timeLeft.seconds)}</span>
      </div>
      {timeLeft.isUrgent && (
        <span className="text-xs font-semibold uppercase ml-1">Últimos segundos!</span>
      )}
    </div>
  );
}