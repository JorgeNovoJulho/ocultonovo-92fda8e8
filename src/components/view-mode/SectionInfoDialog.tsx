/**
 * SectionInfoDialog — wrapper que reaproveita o SlideInfoDialog/useSlideGuide
 * existentes para mostrar "Saiba mais" das seções da Home.
 *
 * Não cria sistema novo de guia. Quando guideKey existir em oculto_slide_guides,
 * o SlideInfoDialog usa o conteúdo do banco; senão cai no fallback hard-coded
 * ou no fallback genérico FALLBACK do próprio SlideInfoDialog.
 */
import { SlideInfoDialog } from '@/components/feed/SlideInfoDialog';
import type { DiscoverySlide } from '@/data/discoveryUniverseSlides';
import type { HomeSectionConfig } from '@/config/homeSections';

interface Props {
  section: HomeSectionConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCta?: () => void;
}

export function SectionInfoDialog({ section, open, onOpenChange, onCta }: Props) {
  if (!section) return null;

  const slide: DiscoverySlide = {
    id: `home-section-${section.key}`,
    slug: section.guideKey || section.key,
    title: section.label,
    description: section.description,
    ctaLabel: 'Abrir agora',
    ctaRoute: '/feed',
    icon: 'sparkles',
    category: 'home-section',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 0,
    isNew: false,
  };

  // Fallback local — usado pelo SlideInfoDialog quando não há registro em
  // oculto_slide_guides nem entrada hard-coded no GUIDES interno.
  const previewOverride =
    !section.guideKey
      ? {
          intro: section.description,
          steps: [
            'Esta seção aparece na sua Home quando ativa.',
            'No Modo Simples ela fica disponível em Sessões Ocultas.',
            'Você pode ligar/desligar no Modo Personalizado.',
          ],
        }
      : undefined;

  return (
    <SlideInfoDialog
      open={open}
      onOpenChange={onOpenChange}
      slide={slide}
      onCta={onCta}
      previewOverride={previewOverride as any}
    />
  );
}
