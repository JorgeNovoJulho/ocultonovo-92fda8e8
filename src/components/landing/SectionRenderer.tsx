import { SiteSection } from '@/hooks/useSiteEditor';
import { FeaturesSection } from './FeaturesSection';
import { PlansSection } from './PlansSection';
import { BannerSection } from './BannerSection';
import { CreatorsSection } from './CreatorsSection';
import { CouplesSection } from './CouplesSection';
import { CTASection } from './CTASection';
import { FooterSection } from './FooterSection';
import { TestimonialsSection } from './TestimonialsSection';
import { HowItWorksSection } from './HowItWorksSection';
import { UniverseGridSection } from './UniverseGridSection';
import { DifferenceStatsSection } from './DifferenceStatsSection';
import { EarlyBirdBanner } from '@/components/EarlyBirdBanner';

interface SectionRendererProps {
  section: SiteSection;
}

export function SectionRenderer({ section }: SectionRendererProps) {
  const { section_type, section_key, content } = section;

  switch (section_type) {
    case 'hero':
      // Legacy CMS hero replaced by HeroSectionAdvanced rendered directly in Landing.tsx.
      // Returning null prevents duplicate heroes if admin keeps the old section_type='hero' entry.
      return null;

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
      return <BannerSection content={content} sectionKey={section_key} />;
    
    case 'content':
      if (section_key === 'creators') {
        return <CreatorsSection content={content} />;
      }
      if (section_key === 'couples') {
        return <CouplesSection content={content} />;
      }
      return null;
    
    case 'cta':
      return <CTASection content={content} />;
    
    case 'footer':
      return <FooterSection content={content} />;
    
    case 'testimonials':
      return <TestimonialsSection content={content} />;
    
    case 'early_bird':
      return (
        <section className="relative z-10 py-12 sm:py-16 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <EarlyBirdBanner 
              variant="full" 
              showCTA={content.show_cta ?? true}
              title={content.title}
              emoji={content.emoji}
              description={content.description}
              ctaText={content.cta_text}
            />
          </div>
        </section>
      );
    
    default:
      return null;
  }
}
