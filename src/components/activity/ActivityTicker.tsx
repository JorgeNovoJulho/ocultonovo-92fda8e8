import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { 
  usePublicActivities, 
  activityConfig, 
  formatActivityMessage, 
  formatActivityTime,
  PublicActivity 
} from '@/hooks/usePublicActivities';
import { User, Sparkles } from 'lucide-react';

interface ActivityTickerProps {
  className?: string;
  maxVisible?: number;
}

export function ActivityTicker({ className, maxVisible = 5 }: ActivityTickerProps) {
  const { activities, isLoading } = usePublicActivities(20);
  const [visibleActivities, setVisibleActivities] = useState<PublicActivity[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const lastActivityIdRef = useRef<string | null>(null);

  // Auto-rotate through activities
  useEffect(() => {
    if (activities.length === 0) return;

    // Check for new activity
    if (activities[0]?.id !== lastActivityIdRef.current) {
      lastActivityIdRef.current = activities[0]?.id || null;
      // Show new activity immediately
      setVisibleActivities(activities.slice(0, maxVisible));
      setCurrentIndex(0);
    }

    // Rotate every 5 seconds
    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        const nextIndex = (prev + 1) % Math.max(activities.length, 1);
        const endIndex = Math.min(nextIndex + maxVisible, activities.length);
        setVisibleActivities(activities.slice(nextIndex, endIndex));
        return nextIndex;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [activities, maxVisible]);

  // Initialize visible activities
  useEffect(() => {
    if (activities.length > 0 && visibleActivities.length === 0) {
      setVisibleActivities(activities.slice(0, maxVisible));
    }
  }, [activities, maxVisible, visibleActivities.length]);

  if (isLoading || activities.length === 0) {
    return null;
  }

  return (
    <div className={cn("overflow-hidden", className)}>
      <AnimatePresence mode="popLayout">
        {visibleActivities.map((activity, index) => (
          <ActivityItem 
            key={activity.id} 
            activity={activity} 
            index={index}
            isNew={index === 0 && activity.id === lastActivityIdRef.current}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

interface ActivityItemProps {
  activity: PublicActivity;
  index: number;
  isNew?: boolean;
}

function ActivityItem({ activity, index, isNew }: ActivityItemProps) {
  const config = activityConfig[activity.activity_type];
  const message = formatActivityMessage(activity);
  const time = formatActivityTime(activity.created_at);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ 
        duration: 0.4, 
        delay: index * 0.1,
        ease: "easeOut"
      }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg mb-2 transition-all",
        config.bgColor,
        isNew && "ring-2 ring-primary/50 animate-pulse"
      )}
    >
      {/* Avatar or Anonymous Icon */}
      <div className="relative flex-shrink-0">
        {activity.is_anonymous ? (
          <div className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center",
            "bg-gradient-to-br from-muted to-muted-foreground/20"
          )}>
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : (
          <Avatar className="h-8 w-8">
            <AvatarImage src={activity.actor_avatar_url || ''} />
            <AvatarFallback className="text-xs">
              {activity.actor_name[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
        )}
        
        {/* Activity type icon */}
        <span className="absolute -bottom-1 -right-1 text-sm">
          {config.icon}
        </span>
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground/90 leading-tight truncate">
          {message}
        </p>
        <p className={cn("text-[10px] mt-0.5", config.color)}>
          {time}
        </p>
      </div>

      {/* New indicator */}
      {isNew && (
        <Sparkles className={cn("h-4 w-4 flex-shrink-0 animate-pulse", config.color)} />
      )}
    </motion.div>
  );
}
