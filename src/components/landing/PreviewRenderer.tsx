import { HeroSection } from './HeroSection';
import { FeaturesSection } from './FeaturesSection';
import { PlansSection } from './PlansSection';
import { BannerSection } from './BannerSection';
import { CreatorsSection } from './CreatorsSection';
import { CouplesSection } from './CouplesSection';
import { CTASection } from './CTASection';
import { FooterSection } from './FooterSection';
import { HowItWorksSection } from './HowItWorksSection';
import { UniverseGridSection } from './UniverseGridSection';
import { DifferenceStatsSection } from './DifferenceStatsSection';

interface PreviewRendererProps {
  sectionType: string;
  sectionKey: string;
  content: Record<string, any>;
}

export function PreviewRenderer({ sectionType, sectionKey, content }: PreviewRendererProps) {
  switch (sectionType) {
    case 'hero':
      return <HeroSection content={content} />;

    case 'features':
      return <FeaturesSection content={content} />;

    case 'how_it_works':
      return <HowItWorksSection content={content} />;

    case 'universe_grid':
      return <UniverseGridSection content={content} />;

    case 'difference_stats':
      return <DifferenceStatsSection content={content} />;
    
    case 'plans':
      return <PlansSection content={content} />;
    
    case 'banner':
      return <BannerSection content={content} sectionKey={sectionKey} />;
    
    case 'content':
      if (sectionKey === 'creators') {
        return <CreatorsSection content={content} />;
      }
      if (sectionKey === 'couples') {
        return <CouplesSection content={content} />;
      }
      return (
        <div className="p-8 text-center text-muted-foreground">
          Preview não disponível para esta seção
        </div>
      );
    
    case 'cta':
      return <CTASection content={content} />;
    
    case 'footer':
      return <FooterSection content={content} />;
    
    default:
      return (
        <div className="p-8 text-center text-muted-foreground">
          Preview não disponível
        </div>
      );
  }
}