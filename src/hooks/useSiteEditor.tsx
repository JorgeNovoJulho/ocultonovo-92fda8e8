import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { toast } from '@/hooks/use-toast';
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';
import { logger } from '@/lib/logger';

export interface SiteSection {
  id: string;
  section_key: string;
  section_name: string;
  section_type: string;
  content: Record<string, any>;
  is_visible: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface SiteImage {
  id: string;
  image_key: string;
  image_url: string;
  alt_text: string | null;
  section_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}

const DEFAULT_SECTIONS: SiteSection[] = [
  {
    id: 'default-hero',
    section_key: 'hero',
    section_name: 'Hero Principal',
    section_type: 'hero',
    content: {
      badge: 'Conteúdo + Conexões Reais',
      title_line1: 'OCULTO.',
      title_line2: 'Onde o desejo',
      title_line3: 'encontra a conexão.',
      subtitle: 'A plataforma mais ousada do Brasil para casais, criadores e curiosos. Conteúdo exclusivo, radar ao vivo e total privacidade.',
      cta_primary: 'Explorar o Radar',
      cta_primary_link: '/radar',
      cta_secondary: 'Espiar',
      cta_secondary_link: '/spy',
      trust_online: '1.2K+ online agora',
      trust_anonymous: '100% anônimo',
      trust_age: '+18 anos',
    },
    is_visible: true,
    display_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: null,
  },
  {
    id: 'default-features',
    section_key: 'features',
    section_name: 'Funcionalidades',
    section_type: 'features',
    content: {
      title: 'Por que escolher o Oculto?',
      subtitle: 'Tudo que você precisa para explorar com segurança',
      items: [
        { icon: 'Shield', title: 'Privacidade Total', description: 'Modo ghost, perfis anônimos e criptografia ponta a ponta.' },
        { icon: 'Users', title: 'Comunidade Verificada', description: 'Perfis verificados por foto e documento.' },
        { icon: 'Radar', title: 'Radar ao Vivo', description: 'Veja quem está online e perto de você em tempo real.' },
        { icon: 'DollarSign', title: 'Monetize seu Conteúdo', description: 'Venda fotos, vídeos e assinaturas exclusivas.' },
      ],
    },
    is_visible: true,
    display_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: null,
  },
  {
    id: 'default-plans',
    section_key: 'plans',
    section_name: 'Planos',
    section_type: 'plans',
    content: {
      title: 'Escolha seu plano',
      subtitle: 'Comece grátis e evolua quando quiser',
      plans: [
        { name: 'Free', price: '0', period: '/mês', features: ['Perfil básico', 'Feed limitado', '5 curtidas/dia'], cta: 'Começar Grátis', highlighted: false },
        { name: 'VIP', price: '29,90', period: '/mês', features: ['Perfil completo', 'Feed ilimitado', 'Curtidas ilimitadas', 'Radar ao vivo', 'Modo Ghost'], cta: 'Assinar VIP', highlighted: true },
        { name: 'Black', price: '59,90', period: '/mês', features: ['Tudo do VIP', 'Badge exclusiva', 'Prioridade no radar', 'Suporte prioritário'], cta: 'Ser Black', highlighted: false },
      ],
    },
    is_visible: true,
    display_order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: null,
  },
  {
    id: 'default-cta',
    section_key: 'cta_final',
    section_name: 'CTA Final',
    section_type: 'cta',
    content: {
      title: 'Pronto para descobrir o que está oculto?',
      cta: 'Criar Conta Grátis',
      cta_link: '/signup',
    },
    is_visible: true,
    display_order: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: null,
  },
  {
    id: 'default-footer',
    section_key: 'footer',
    section_name: 'Rodapé',
    section_type: 'footer',
    content: {
      copyright: '© 2026 OCULTO. Todos os direitos reservados.',
      age_restriction: 'Proibido para menores de 18 anos.',
      links: [
        { label: 'Termos de Uso', href: '/terms' },
        { label: 'Privacidade', href: '/privacy' },
        { label: 'Contato', href: '/contact' },
      ],
    },
    is_visible: true,
    display_order: 5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: null,
  },
];

// Buscar todas as seções ordenadas
export function useSiteSections() {
  return useQuery({
    queryKey: ['site-sections'],
    queryFn: async (): Promise<SiteSection[]> => {
      try {
        const { data, error } = await supabase
          .from('site_sections')
          .select('*')
          .order('display_order', { ascending: true });

        if (error) {
          console.warn('[Oculto] site_sections not available, using defaults:', error.message);
          return DEFAULT_SECTIONS;
        }
        
        if (!data || data.length === 0) {
          logger.info('[Oculto] site_sections empty, using defaults');
          return DEFAULT_SECTIONS;
        }
        
        return data as SiteSection[];
      } catch {
        return DEFAULT_SECTIONS;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

// Buscar apenas seções visíveis (para a Landing) com Realtime
export function useVisibleSiteSections() {
  const queryClient = useQueryClient();
  const visibleDefaults = DEFAULT_SECTIONS.filter(s => s.is_visible);

  // Subscription para atualizações em tempo real
  useEffect(() => {
    const unsub = subscribeTable('site_sections', () => {
      queryClient.invalidateQueries({ queryKey: ['site-sections'] });
    });
    return () => unsub();
  }, [queryClient]);

  return useQuery({
    queryKey: ['site-sections', 'visible'],
    initialData: visibleDefaults,
    placeholderData: visibleDefaults,
    queryFn: async (): Promise<SiteSection[]> => {
      try {
        const { data, error } = await supabase
          .from('site_sections')
          .select('*')
          .eq('is_visible', true)
          .order('display_order', { ascending: true });

        if (error) {
          console.warn('[Oculto] visible site_sections not available, using defaults:', error.message);
          return visibleDefaults;
        }
        
        if (!data || data.length === 0) {
          return visibleDefaults;
        }
        
        return data as SiteSection[];
      } catch {
        return visibleDefaults;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

// Atualizar conteúdo de uma seção
export function useUpdateSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<SiteSection, 'section_name' | 'content' | 'is_visible'>>;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('site_sections')
        .update({
          ...updates,
          updated_by: user?.id,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-sections'] });
      toast({
        title: 'Seção atualizada',
        description: 'As alterações foram salvas com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Toggle visibilidade de uma seção
export function useToggleSectionVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isVisible }: { id: string; isVisible: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('site_sections')
        .update({
          is_visible: isVisible,
          updated_by: user?.id,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, { isVisible }) => {
      queryClient.invalidateQueries({ queryKey: ['site-sections'] });
      toast({
        title: isVisible ? 'Seção visível' : 'Seção oculta',
        description: `A seção foi ${isVisible ? 'ativada' : 'desativada'} com sucesso.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Reordenar seções
export function useReorderSections() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sections: { id: string; display_order: number }[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Atualizar cada seção com sua nova ordem
      for (const section of sections) {
        const { error } = await supabase
          .from('site_sections')
          .update({
            display_order: section.display_order,
            updated_by: user?.id,
          })
          .eq('id', section.id);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-sections'] });
      toast({
        title: 'Ordem atualizada',
        description: 'A ordem das seções foi salva.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao reordenar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Criar nova seção
export function useCreateSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (section: {
      section_key: string;
      section_name: string;
      section_type: string;
      content: Record<string, any>;
      display_order: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('site_sections')
        .insert({
          ...section,
          updated_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-sections'] });
      toast({
        title: 'Seção criada',
        description: 'A nova seção foi adicionada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Deletar seção
export function useDeleteSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('site_sections')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-sections'] });
      toast({
        title: 'Seção removida',
        description: 'A seção foi deletada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Upload de imagem do site
export function useUploadSiteImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      imageKey,
      altText,
      sectionId,
    }: {
      file: File;
      imageKey: string;
      altText?: string;
      sectionId?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Upload do arquivo
      const fileExt = file.name.split('.').pop() || 'jpg';
      const safeKey = imageKey.replace(/[^a-zA-Z0-9-_]/g, '_');
      const filePath = `${safeKey}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('site-assets')
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: '3600',
        });

      if (uploadError) throw uploadError;

      // URL pública via concatenação (zero requests extras)
      const publicUrl = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/site-assets/${filePath}`;

      // Salvar referência no banco
      const { data, error } = await supabase
        .from('site_images')
        .insert({
          image_key: imageKey,
          image_url: publicUrl,
          alt_text: altText,
          section_id: sectionId,
          uploaded_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as SiteImage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-images'] });
      toast({
        title: 'Imagem enviada',
        description: 'A imagem foi salva com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro no upload',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Buscar imagens do site
export function useSiteImages() {
  return useQuery({
    queryKey: ['site-images'],
    queryFn: async (): Promise<SiteImage[]> => {
      const { data, error } = await supabase
        .from('site_images')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SiteImage[];
    },
  });
}