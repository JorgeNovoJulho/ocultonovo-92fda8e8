import { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useImpersonationStore } from '@/store/useImpersonationStore';

interface MobileSimulatorContainerProps {
  children: ReactNode;
}

export function MobileSimulatorContainer({ children }: MobileSimulatorContainerProps) {
  const { isImpersonating, viewportMode } = useImpersonationStore();
  const isMobileDevice = useIsMobile();

  // Only show simulator when: admin is impersonating + on desktop + mobile mode active
  const shouldSimulate = isImpersonating && !isMobileDevice && viewportMode === 'mobile';

  if (!shouldSimulate) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[9998] bg-black/80 flex items-center justify-center overflow-hidden">
      {/* Phone Frame Container */}
      <div className="relative flex flex-col" style={{ width: '375px', height: '812px' }}>
        {/* Phone Frame */}
        <div 
          className="relative bg-black rounded-[50px] p-3 shadow-2xl border-4 border-zinc-700"
          style={{ width: '100%', height: '100%' }}
        >
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-3xl z-20 flex items-center justify-center gap-2">
            <div className="w-16 h-4 bg-zinc-900 rounded-full" />
            <div className="w-3 h-3 bg-zinc-800 rounded-full" />
          </div>

          {/* Screen Content */}
          <div 
            className="relative bg-background rounded-[40px] overflow-hidden"
            style={{ width: '100%', height: '100%' }}
          >
            {/* Status Bar Spacer */}
            <div className="h-12 bg-background" />
            
            {/* Scrollable Content Area */}
            <div 
              className="overflow-y-auto overflow-x-hidden"
              style={{ height: 'calc(100% - 48px - 34px)' }}
            >
              {children}
            </div>

            {/* Home Indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-foreground/30 rounded-full" />
          </div>
        </div>

        {/* Device Label */}
        <div className="mt-4 text-center">
          <span className="text-white/60 text-sm font-medium">
            📱 iPhone 14 Pro (375 × 812)
          </span>
        </div>
      </div>
    </div>
  );
}
