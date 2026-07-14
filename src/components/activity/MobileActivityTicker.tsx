import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  usePublicActivities, 
  activityConfig, 
  formatActivityMessage, 
  formatActivityTime,
  PublicActivity 
} from '@/hooks/usePublicActivities';
import { Activity, User, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface MobileActivityTickerProps {
  className?: string;
}

export function MobileActivityTicker({ className }: MobileActivityTickerProps) {
  const { activities, isLoading } = usePublicActivities(10);
  const [currentActivity, setCurrentActivity] = useState<PublicActivity | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const currentIndexRef = useRef(0);
  const lastActivityIdRef = useRef<string | null>(null);

  // Rotate through activities
  useEffect(() => {
    if (activities.length === 0 || isDismissed) return;

    // Check for new activity - show immediately
    if (activities[0]?.id !== lastActivityIdRef.current) {
      lastActivityIdRef.current = activities[0]?.id || null;
      setCurrentActivity(activities[0]);
      currentIndexRef.current = 0;
      setIsVisible(true);
    }

    // Auto-rotate every 4 seconds
    const interval = setInterval(() => {
      currentIndexRef.current = (currentIndexRef.current + 1) % activities.length;
      
      // Fade out, change, fade in
      setIsVisible(false);
      setTimeout(() => {
        setCurrentActivity(activities[currentIndexRef.current]);
        setIsVisible(true);
      }, 300);
    }, 4000);

    return () => clearInterval(interval);
  }, [activities, isDismissed]);

  // Initialize with first activity
  useEffect(() => {
    if (activities.length > 0 && !currentActivity && !isDismissed) {
      setCurrentActivity(activities[0]);
    }
  }, [activities, currentActivity, isDismissed]);

  if (isLoading || !currentActivity || isDismissed) {
    return null;
  }

  const config = activityConfig[currentActivity.activity_type];
  const message = formatActivityMessage(currentActivity);
  const time = formatActivityTime(currentActivity.created_at);

  return (
    <div className={cn("md:hidden", className)}>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "flex items-center gap-2 px-3 py-2 mx-2 rounded-lg",
              config.bgColor,
              "border border-border/30 backdrop-blur-sm shadow-sm"
            )}
          >
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <Activity className="h-3 w-3 text-muted-foreground" />
            </div>

            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {currentActivity.is_anonymous ? (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-3 w-3 text-muted-foreground" />
                </div>
              ) : (
                <Avatar className="h-6 w-6">
                  <AvatarImage src={currentActivity.actor_avatar_url || ''} />
                  <AvatarFallback className="text-[10px]">
                    {currentActivity.actor_name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">
                {config.icon}
              </span>
            </div>

            {/* Message */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-foreground/90 truncate leading-tight">
                {message}
              </p>
            </div>

            {/* Time */}
            <span className={cn("text-[10px] flex-shrink-0", config.color)}>
              {time}
            </span>

            {/* Dismiss button */}
            <button
              onClick={() => setIsDismissed(true)}
              className="flex-shrink-0 p-1 rounded-full hover:bg-background/50 transition-colors"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
