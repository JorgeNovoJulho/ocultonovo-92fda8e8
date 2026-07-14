/**
 * Hook para geração e gerenciamento de dados seed (perfis pioneiros)
 * Usado exclusivamente por admins para popular a plataforma
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

// Interface para callback de progresso
export interface SeedProgressCallback {
  onProgress?: (stage: string, percent: number) => void;
}

// Brazilian first names
const maleNames = [
  'Lucas', 'Pedro', 'Gabriel', 'Mateus', 'Rafael', 'Bruno', 'Thiago', 'Felipe',
  'Gustavo', 'Rodrigo', 'André', 'Diego', 'Fernando', 'Caio', 'Vinícius',
  'Leonardo', 'Henrique', 'Marcelo', 'Fábio', 'Daniel'
];

const femaleNames = [
  'Ana', 'Juliana', 'Fernanda', 'Camila', 'Gabriela', 'Bruna', 'Amanda',
  'Larissa', 'Carolina', 'Mariana', 'Natália', 'Letícia', 'Beatriz', 'Rafaela',
  'Isabela', 'Vanessa', 'Patrícia', 'Aline', 'Jéssica', 'Carla'
];

const lastNames = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Pereira', 'Ferreira',
  'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes',
  'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Alves', 'Monteiro'
];

// Cities with approximate coordinates
const cities = [
  { name: 'São Paulo', lat: -23.5505, lng: -46.6333 },
  { name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729 },
  { name: 'Curitiba', lat: -25.4284, lng: -49.2733 },
  { name: 'Sorocaba', lat: -23.5015, lng: -47.4526 },
  { name: 'Campinas', lat: -22.9099, lng: -47.0626 },
  { name: 'Belo Horizonte', lat: -19.9167, lng: -43.9345 },
  { name: 'Porto Alegre', lat: -30.0346, lng: -51.2177 },
  { name: 'Salvador', lat: -12.9714, lng: -38.5014 },
];

// Bios
const maleBios = [
  'Curtindo a vida, um dia de cada vez 🌴',
  'Aventureiro e apaixonado por música 🎸',
  'Buscando novas conexões e experiências',
  'Fotografo nas horas vagas 📷',
  'Fitness e lifestyle 💪',
  'Viajante e sonhador ✈️',
  'Ama praia, sol e boas companhias',
  'Chef de cozinha amador 🍳',
  'Empresário | Lifestyle',
  'Vivendo intensamente cada momento',
];

const femaleBios = [
  'Sorriso no rosto sempre 💕',
  'Amo viajar e conhecer pessoas novas ✨',
  'Fashion | Beauty | Lifestyle',
  'Apaixonada por café e boas conversas ☕',
  'Aqui pra fazer novas amizades',
  'Modelo | Influencer',
  'Artista e sonhadora 🎨',
  'Personal trainer | Vida saudável',
  'Ama a natureza e animais 🐾',
  'Sempre de bom humor 🌸',
];

const coupleBios = [
  'Casal buscando novas amizades 👫',
  'Juntos há 3 anos, explorando o mundo',
  'Amamos conhecer pessoas de mente aberta',
  'Casal fitness | Lifestyle',
  'Viajantes apaixonados ❤️',
];

// Post captions
const publicCaptions = [
  'Aproveitando o sol ☀️',
  'Novo por aqui! Me sigam 💕',
  'Alguém para conversar?',
  'Bom dia, pessoas lindas!',
  'Começando a semana bem 💪',
  'Gratidão por mais um dia 🙏',
  'Selfie do dia 📸',
  'Vibes positivas sempre ✨',
  'Praia mode on 🏖️',
  'Café e boas energias ☕',
  'Sextou! Quem vai sair?',
  'Academia feita! 💪',
  'Noite especial 🌙',
  'Aproveitando o feriado',
  'Viagem dos sonhos ✈️',
];

const friendsCaptions = [
  'Para os amigos mais chegados 💕',
  'Bastidores do meu dia',
  'Só para quem me segue 😉',
  'Momento especial',
  'Compartilhando com vocês',
];

// Textos de comentários realistas para perfis pioneiros
const commentTexts = [
  'Que foto linda! 😍',
  'Arrasou demais!',
  'Perfeição! 🔥',
  'Maravilhoso(a)!',
  'Amei essa foto ❤️',
  'Tá demais!',
  'Simplesmente incrível',
  'Uau! 👏',
  'Que produção!',
  'Lacrou!',
  'Sensacional 🙌',
  'Muito bom!',
  'Adorei ver isso',
  'Sempre arrasando!',
  'Top demais 💕',
  'Você é incrível!',
  'Que energia boa ✨',
  'Meta de vida 😍',
  'Arrasou no look!',
  'Lindeza pura!',
  'Que lugar lindo!',
  'Quero ir aí também!',
  'Inspiração 🌟',
  'Que vibe maravilhosa!',
  'Parabéns! Ficou perfeito',
];

// Avatar placeholder URLs using UI Avatars or similar
function getAvatarUrl(name: string, gender: 'male' | 'female' | 'couple'): string {
  const colors = ['FF6B6B', 'FFE66D', '4ECDC4', '45B7D1', 'A78BFA', 'FB7185', 'F472B6', '818CF8'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const bgColor = gender === 'female' ? 'FFE4E6' : gender === 'couple' ? 'FEF3C7' : 'DBEAFE';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bgColor}&color=${color}&size=200&bold=true`;
}

// Post image placeholders using Lorem Picsum
function getPostImageUrl(index: number): string {
  // Use different seed values for variety
  const seeds = [100, 200, 300, 400, 500, 1000, 1050, 1100, 1200, 1084, 1035, 1024, 1025, 1026, 1027];
  const seed = seeds[index % seeds.length] + Math.floor(Math.random() * 50);
  return `https://picsum.photos/seed/${seed}/800/800`;
}

function randomOffset(value: number, range: number): number {
  return value + (Math.random() - 0.5) * range;
}

function generateUsername(firstName: string, lastName: string): string {
  const suffixes = ['_', '.', '', '__'];
  const numbers = ['', Math.floor(Math.random() * 99).toString(), Math.floor(Math.random() * 999).toString()];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  const number = numbers[Math.floor(Math.random() * numbers.length)];
  return `${firstName.toLowerCase()}${suffix}${lastName.toLowerCase()}${number}`.replace(/[áàãâ]/g, 'a').replace(/[éèê]/g, 'e').replace(/[íì]/g, 'i').replace(/[óòõô]/g, 'o').replace(/[úù]/g, 'u').replace(/ç/g, 'c');
}

interface SeedProfile {
  user_id: string;
  name: string;
  username: string;
  bio: string;
  avatar_url: string;
  location_lat: number;
  location_lng: number;
  is_creator: boolean;
  is_verified: boolean;
  is_online: boolean;
  profile_type: string;
  plan_type: string;
  is_seed: boolean;
}

interface SeedPost {
  user_id: string;
  content_text: string;
  media_url: string;
  media_type: 'image';
  is_adult: boolean;
  privacy_level: string;
  likes_count: number;
  comments_count: number;
  is_seed: boolean;
}

export function useGenerateSeedData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { onProgress?: (stage: string, percent: number) => void }) => {
      const { onProgress } = options || {};
      
      // Notificar início
      onProgress?.("Preparando dados...", 5);
      
      const profiles: SeedProfile[] = [];
      const posts: SeedPost[] = [];
      
      // Generate 50 pioneer profiles
      for (let i = 0; i < 50; i++) {
        const profileType = i < 30 ? 'single' : i < 45 ? 'single' : 'couple';
        const gender: 'male' | 'female' | 'couple' = profileType === 'couple' 
          ? 'couple' 
          : i % 2 === 0 ? 'female' : 'male';

        let firstName: string;
        let bio: string;

        if (gender === 'couple') {
          const maleName = maleNames[Math.floor(Math.random() * maleNames.length)];
          const femaleName = femaleNames[Math.floor(Math.random() * femaleNames.length)];
          firstName = `${maleName} & ${femaleName}`;
          bio = coupleBios[Math.floor(Math.random() * coupleBios.length)];
        } else if (gender === 'female') {
          firstName = femaleNames[Math.floor(Math.random() * femaleNames.length)];
          bio = femaleBios[Math.floor(Math.random() * femaleBios.length)];
        } else {
          firstName = maleNames[Math.floor(Math.random() * maleNames.length)];
          bio = maleBios[Math.floor(Math.random() * maleBios.length)];
        }

        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const name = profileType === 'couple' ? firstName : `${firstName} ${lastName}`;
        const city = cities[Math.floor(Math.random() * cities.length)];

        // Generate a unique fake user_id (UUID format)
        const fakeUserId = crypto.randomUUID();

        profiles.push({
          user_id: fakeUserId,
          name,
          username: generateUsername(firstName.split(' ')[0], lastName),
          bio,
          avatar_url: getAvatarUrl(name, gender),
          location_lat: randomOffset(city.lat, 0.2),
          location_lng: randomOffset(city.lng, 0.2),
          is_creator: Math.random() > 0.3, // 70% are creators
          is_verified: Math.random() > 0.6, // 40% verified
          is_online: Math.random() > 0.5, // 50% online
          profile_type: profileType,
          plan_type: Math.random() > 0.7 ? 'premium' : 'free',
          is_seed: true,
        });
      }

      onProgress?.("Gerando perfis pioneiros...", 15);

      // Insert profiles using RPC function (bypasses RLS with SECURITY DEFINER)
      // Cast to any to bypass strict type checking - the RPC accepts JSONB
      const { data: insertedProfiles, error: profileError } = await (supabase as any)
        .rpc('generate_seed_profiles', { 
          profiles_data: profiles
        });

      if (profileError) {
        console.error('Profile insert error:', profileError);
        throw new Error(`Erro ao criar perfis: ${profileError.message}`);
      }

      const profileResults = insertedProfiles as { id: string; user_id: string }[] | null;

      if (!profileResults || profileResults.length === 0) {
        throw new Error('Nenhum perfil foi criado');
      }

      onProgress?.("Perfis criados! Gerando posts...", 35);

      // Generate posts for each profile (3-5 posts per profile)
      let postIndex = 0;
      for (const profile of profileResults) {
        const numPosts = 3 + Math.floor(Math.random() * 3); // 3-5 posts
        
        for (let j = 0; j < numPosts; j++) {
          const isPublic = Math.random() > 0.3; // 70% public, 30% friends
          posts.push({
            user_id: profile.id, // Use profile.id, not user_id
            content_text: isPublic 
              ? publicCaptions[Math.floor(Math.random() * publicCaptions.length)]
              : friendsCaptions[Math.floor(Math.random() * friendsCaptions.length)],
            media_url: getPostImageUrl(postIndex),
            media_type: 'image',
            // Casos variados para validar manualmente o blur +18 em dados seed/mock.
            is_adult: postIndex % 3 !== 1,
            privacy_level: isPublic ? 'public' : 'friends',
            likes_count: Math.floor(Math.random() * 500),
            comments_count: Math.floor(Math.random() * 50),
            is_seed: true,
          });
          postIndex++;
        }
      }

      // Insert posts using RPC function
      const { data: insertedPosts, error: postsError } = await (supabase as any)
        .rpc('generate_seed_posts', { 
          posts_data: posts
        });

      if (postsError) {
        console.error('Posts insert error:', postsError);
        throw new Error(`Erro ao criar posts: ${postsError.message}`);
      }

      const postResults = insertedPosts as { id: string }[] | null;

      onProgress?.("Posts criados! Gerando likes...", 55);

      // Generate random likes between seed profiles
      const seedLikes: { user_id: string; post_id: string; is_seed: boolean }[] = [];
      let seedCommentsCount = 0;
      
      if (postResults && profileResults) {
        const profileIds = profileResults.map(p => p.id);
        const postIds = postResults.map(p => p.id);

        // Each profile likes 10-20 random posts
        for (const profileId of profileIds) {
          const numLikes = 10 + Math.floor(Math.random() * 11);
          const shuffledPosts = [...postIds].sort(() => Math.random() - 0.5);
          
          for (let k = 0; k < Math.min(numLikes, shuffledPosts.length); k++) {
            seedLikes.push({
              user_id: profileId,
              post_id: shuffledPosts[k],
              is_seed: true,
            });
          }
        }

        // Insert likes using RPC function in batches
        const batchSize = 500;
        for (let i = 0; i < seedLikes.length; i += batchSize) {
          const batch = seedLikes.slice(i, i + batchSize);
          const { error: likesError } = await (supabase as any).rpc('generate_seed_likes', { 
            likes_data: batch 
          });
          if (likesError) {
            console.error('Likes insert error:', likesError);
          }
        }

        onProgress?.("Likes gerados! Gerando comentários...", 75);

        // Gerar comentários aleatórios para os posts
        const seedComments: { post_id: string; user_id: string; content: string }[] = [];
        
        for (const postId of postIds) {
          const numComments = Math.floor(Math.random() * 8); // 0-7 comentários por post
          const shuffledProfiles = [...profileIds].sort(() => Math.random() - 0.5);
          
          for (let c = 0; c < Math.min(numComments, shuffledProfiles.length); c++) {
            seedComments.push({
              post_id: postId,
              user_id: shuffledProfiles[c],
              content: commentTexts[Math.floor(Math.random() * commentTexts.length)],
            });
          }
        }

        // Inserir comentários via RPC em batches
        for (let i = 0; i < seedComments.length; i += batchSize) {
          const batch = seedComments.slice(i, i + batchSize);
          const { error: commentsError } = await (supabase as any).rpc('generate_seed_comments', { 
            comments_data: batch 
          });
          if (commentsError) {
            console.error('Comments insert error:', commentsError);
          }
        }
        
        seedCommentsCount = seedComments.length;
      }

      onProgress?.("Finalizado!", 100);

      return {
        profiles: profileResults?.length || 0,
        posts: postResults?.length || 0,
        likes: seedLikes.length,
        comments: seedCommentsCount,
      };
    },
    onSuccess: (data) => {
      toast.success(`Seed data criado! ${data.profiles} perfis, ${data.posts} posts, ${data.likes} likes, ${data.comments} comentários`);
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['radar-users'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function usePurgeSeedData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Call the purge function using raw SQL via rpc
      const { data, error } = await supabase.rpc('purge_seed_data' as any);

      if (error) {
        throw new Error(`Erro ao limpar dados: ${error.message}`);
      }

      return data as unknown as { deleted_profiles: number; deleted_posts: number; deleted_likes: number; deleted_comments: number };
    },
    onSuccess: (data) => {
      toast.success(`Dados de teste removidos! ${data.deleted_profiles} perfis, ${data.deleted_posts} posts, ${data.deleted_likes} likes, ${data.deleted_comments || 0} comentários`);
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['radar-users'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useSeedDataStats() {
  return useMutation({
    mutationFn: async () => {
      // Use raw query approach to avoid TypeScript deep instantiation issues
      const { count: profilesCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .filter('is_seed', 'eq', true);
        
      const { count: postsCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .filter('is_seed', 'eq', true);
        
      const { count: likesCount } = await supabase
        .from('post_likes')
        .select('*', { count: 'exact', head: true })
        .filter('is_seed', 'eq', true);

      return {
        profiles: profilesCount || 0,
        posts: postsCount || 0,
        likes: likesCount || 0,
      };
    },
  });
}
