import { forwardRef } from "react";
import { Shield, BadgeCheck, Users, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { useSmartOnlineCounter } from "@/hooks/useSmartOnlineCounter";
import { useSignupsToday } from "@/hooks/useSignupsToday";
import { TrustIndicators as TrustIndicatorsConfig } from "@/hooks/useHeroSettings";

interface TrustIndicatorsProps {
  config?: TrustIndicatorsConfig;
  showSignupsToday?: boolean;
}

export const TrustIndicators = forwardRef<HTMLDivElement, TrustIndicatorsProps>(function TrustIndicators({ config, showSignupsToday = false }, _ref) {
  const { count } = useSmartOnlineCounter();
  const { data: signupsToday = 0 } = useSignupsToday();
  
  const showOnline = config?.online_count ?? true;
  const showAnonymity = config?.anonymity_badge ?? true;
  const showAgeVerified = config?.age_verified_badge ?? true;

  const indicators = [
    showOnline && {
      icon: Users,
      label: `${count}+ online agora`,
      accent: "text-green-400",
      dot: true,
    },
    showSignupsToday && signupsToday > 0 && {
      icon: UserPlus,
      label: `+${signupsToday} hoje`,
      accent: "text-[#ff0080]",
      dot: false,
    },
    showAnonymity && {
      icon: Shield,
      label: "100% Anônimo",
      accent: "text-[#ff0080]",
      dot: false,
    },
    showAgeVerified && {
      icon: BadgeCheck,
      label: "+18 Verificado",
      accent: "text-[#ff0080]",
      dot: false,
    }
  ].filter(Boolean) as {
    icon: typeof Users;
    label: string;
    accent: string;
    dot: boolean;
  }[];

  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-3xl mt-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.8, duration: 0.6 }}
    >
      {indicators.map((indicator, index) => (
        <motion.div
          key={indicator.label}
          className="flex items-center justify-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm transition-colors hover:bg-white/10"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 + index * 0.12 }}
        >
          {indicator.dot ? (
            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse" />
          ) : (
            <indicator.icon className={`w-4 h-4 ${indicator.accent}`} />
          )}
          <span className="text-xs font-semibold text-white/70 uppercase tracking-widest">
            {indicator.label}
          </span>
        </motion.div>
      ))}
    </motion.div>
  );
});

TrustIndicators.displayName = 'TrustIndicators';
