/**
 * System Search Index
 * --------------------
 * Catálogo expandido de páginas, configurações e ações do sistema.
 * Vocabulário em PT-BR com sinônimos amplos para a busca tolerante do header.
 */

export type SystemSearchAction =
  | { type: 'open-plans-modal' }
  | { type: 'open-financeiro-modal' };

export interface SystemSearchEntry {
  id: string;
  title: string;
  description?: string;
  section: string;
  icon?: string; // lucide name
  route?: string;
  action?: SystemSearchAction;
  keywords: string[];
}

export const SYSTEM_SEARCH_INDEX: SystemSearchEntry[] = [
  // ───────── Perfil ─────────
  { id: 'profile-edit', title: 'Editar meu perfil', description: 'Foto, capa, bio, username, gênero, orientação', section: 'Perfil', icon: 'UserCog', route: '/profile',
    keywords: ['perfil','meu perfil','editar perfil','foto do perfil','avatar','imagem de perfil','foto perfil','trocar foto','mudar foto','capa','bio','biografia','username','nome de usuario','arroba','genero','gênero','orientacao','orientação','editar conta','minha conta','sobre mim','apresentacao','apresentação'] },
  { id: 'profile-photo', title: 'Trocar foto do perfil', description: 'Atualize seu avatar', section: 'Perfil', icon: 'Image', route: '/profile',
    keywords: ['foto','foto do perfil','avatar','trocar foto','mudar avatar','imagem perfil','nova foto','selfie','retrato'] },
  { id: 'my-media', title: 'Minhas mídias', description: 'Gerencie fotos e vídeos publicados', section: 'Perfil', icon: 'Images', route: '/my-media',
    keywords: ['minhas midias','minhas mídias','galeria','fotos','videos','vídeos','meu acervo','minhas publicacoes','minhas publicações','meus posts','meus conteudos','meus conteúdos','album','álbum'] },
  { id: 'vip-downloads', title: 'Conteúdos VIP baixados', section: 'Perfil', icon: 'Download', route: '/vip-downloads',
    keywords: ['vip downloads','baixados','acervo vip','meus vips','downloads','baixar conteudo'] },
  { id: 'saved', title: 'Salvos', description: 'Publicações que você guardou', section: 'Perfil', icon: 'Bookmark', route: '/saved',
    keywords: ['salvos','favoritos','guardados','bookmark','meus favoritos','posts salvos'] },

  // ───────── Conexões ─────────
  { id: 'followers', title: 'Meus seguidores', section: 'Conexões', icon: 'Users', route: '/followers',
    keywords: ['seguidores','quem me segue','fans','fas','fãs','minha audiencia','audiência'] },
  { id: 'following', title: 'Quem eu sigo', section: 'Conexões', icon: 'UserCheck', route: '/following',
    keywords: ['seguindo','quem eu sigo','minhas conexoes','conexões','seguidos'] },
  { id: 'likes', title: 'Curtidas no perfil', section: 'Conexões', icon: 'Heart', route: '/likes',
    keywords: ['curtidas','likes','quem curtiu','coracoes','corações','curtidores','curtir perfil'] },
  { id: 'visits', title: 'Quem visitou meu perfil', section: 'Conexões', icon: 'Eye', route: '/visits',
    keywords: ['visitas','visitantes','quem viu meu perfil','quem visitou','visualizacoes','visualizações de perfil','olhares','espiou','espião'] },
  { id: 'matches', title: 'Meus matches', section: 'Conexões', icon: 'Sparkles', route: '/matches',
    keywords: ['matches','matchs','match','combinacoes','combinações','par','parear','conexao','conexão','encontro','encontrei','crush'] },

  // Aura Match — múltiplos sinônimos (bate papo, chat ao vivo, salas)
  { id: 'aura-match', title: 'Aura Match — Salas ao Vivo', description: 'Bate-papo, salas ao vivo e descoberta por afinidade', section: 'Conexões', icon: 'Sparkles', route: '/aura-match',
    keywords: ['aura','aura match','salas','sala aura','sala ao vivo','salas ao vivo','salinha','bate papo','batepapo','bate-papo','papo','chat ao vivo','live chat','conversar ao vivo','afinidade','descobrir','descoberta','encontro','encontrar pessoas','conhecer pessoas','flertar','flerte','novos misteriosos','novos mistériosos','mistérios','misteriosos','rooms','clube','vibe'] },
  { id: 'aura-rooms-live', title: 'Salas ao vivo (Aura)', section: 'Conexões', icon: 'Radio', route: '/aura-match',
    keywords: ['salas ao vivo','live','transmissao','transmissão','bate papo ao vivo','grupo ao vivo','room','rooms'] },

  { id: 'perfect-pair', title: 'Par Perfeito', description: 'Swipe estilo Tinder dentro do Oculto', section: 'Conexões', icon: 'HeartHandshake', route: '/perfect-pair',
    keywords: ['par perfeito','perfect pair','swipe','combinar','tinder','encontrar par','escolher','curtir e passar','match swipe','encontro perfeito'] },

  // Radar — sinônimos de geolocalização e encontro presencial
  { id: 'radar', title: 'Radar', description: 'Pessoas próximas em tempo real', section: 'Conexões', icon: 'Radar', route: '/radar',
    keywords: ['radar','perto de mim','proximos','próximos','localizacao','localização','buscando agora','encontro','encontrar perto','quem ta perto','quem está perto','mapa','geo','geolocalizacao','geolocalização','gps','aqui perto','cidade','minha regiao','minha região','agora online'] },

  // Encontro Seguro — feature de check-in (descrita na memória); cai em /messages como hub
  { id: 'encontro-seguro', title: 'Encontro Seguro (Check-in)', description: 'Compartilhe check-in e SOS antes do encontro', section: 'Conexões', icon: 'ShieldCheck', route: '/messages',
    keywords: ['encontro seguro','seguranca','segurança','check in','check-in','sos','panico','pânico','aviso','contato emergencia','contato de emergência','encontro','meetup','presencial','seguro','safe date','date'] },

  { id: 'pesquisar', title: 'Buscar Mistériosos', section: 'Conexões', icon: 'Search', route: '/pesquisar',
    keywords: ['pesquisar','procurar usuarios','procurar usuários','encontrar pessoas','filtros','buscar','busca avancada','busca avançada','filtrar','procurar perfis'] },

  // ───────── Mensagens / Notificações ─────────
  { id: 'messages', title: 'Mensagens', description: 'Chat privado, DMs e Super DM', section: 'Mensagens', icon: 'MessageCircle', route: '/messages',
    keywords: ['mensagens','chat','dm','direct','conversas','inbox','privado','mensagem direta','super dm','conversa','responder','mandar mensagem','recados'] },
  { id: 'notifications', title: 'Notificações', section: 'Mensagens', icon: 'Bell', route: '/notifications',
    keywords: ['notificacoes','notificações','alertas','sino','avisos','novidades de notificacao'] },

  // ───────── Presentes & Gifts ─────────
  { id: 'my-gifts', title: 'Meus presentes', description: 'Presentes que você recebeu', section: 'Presentes', icon: 'Gift', route: '/my-gifts',
    keywords: ['presente','presentes','meus presentes','gifts','gift','meus gifts','presente recebido','recebidos','mimos','meus mimos','minhas lembrancas','minhas lembranças'] },
  { id: 'gifts-history', title: 'Histórico de presentes', description: 'Tudo que você enviou ou recebeu', section: 'Presentes', icon: 'History', route: '/gifts-history',
    keywords: ['historico presentes','histórico de presentes','presentes enviados','enviei presente','gifts history','presentes recebidos'] },

  // ───────── Eventos & Marketplace ─────────
  { id: 'events', title: 'Eventos VIP', description: 'Festas, encontros e eventos exclusivos', section: 'Descobrir', icon: 'CalendarHeart', route: '/events',
    keywords: ['eventos','evento','festas','festa','encontros','vip events','agenda','calendario','calendário','meetup','rolê','role','balada','programa'] },
  { id: 'auctions', title: 'Leilões', section: 'Descobrir', icon: 'Gavel', route: '/auctions',
    keywords: ['leiloes','leilões','leilao','bid','lance','arrematar','dar lance'] },
  { id: 'marketplace', title: 'Marketplace', section: 'Descobrir', icon: 'ShoppingBag', route: '/marketplace',
    keywords: ['marketplace','loja','produtos','itens','comprar','vender','venda','anuncios'] },
  { id: 'vitrine-vip', title: 'Vitrine VIP', section: 'Descobrir', icon: 'Crown', route: '/vitrine-vip',
    keywords: ['vitrine vip','criadores vip','top criadores','destaques','vitrine'] },
  { id: 'canal-vip', title: 'Canal VIP', section: 'Descobrir', icon: 'Crown', route: '/canal-vip',
    keywords: ['canal vip','meu canal','conteudo exclusivo','conteúdo exclusivo','canal'] },
  { id: 'novidades', title: 'Novidades', section: 'Descobrir', icon: 'Sparkles', route: '/novidades',
    keywords: ['novidades','novo','o que mudou','changelog','novas funcoes','novas funções','atualizacoes','atualizações'] },
  { id: 'spy', title: 'Espião / Spy Feed', section: 'Descobrir', icon: 'Eye', route: '/spy',
    keywords: ['espiao','espião','spy','olhar','curiosidade','espreita','xeretar'] },

  // ───────── Planos & Financeiro ─────────
  { id: 'subscriptions', title: 'Planos & Assinaturas', description: 'Free, Premium e VIP', section: 'Planos', icon: 'Crown', route: '/subscriptions',
    keywords: ['planos','plano','assinatura','assinaturas','premium','vip','upgrade','virar premium','virar vip','preço','preco','valor','mensalidade','cobranca','cobrança','contratar plano'] },
  { id: 'plans-modal', title: 'Ver planos disponíveis', section: 'Planos', icon: 'Crown', action: { type: 'open-plans-modal' },
    keywords: ['ver planos','abrir planos','modal de planos','comparar planos'] },
  { id: 'earnings', title: 'Rendimentos', section: 'Financeiro', icon: 'DollarSign', route: '/earnings',
    keywords: ['rendimentos','ganhos','receita','faturamento','meu dinheiro','quanto ganhei','meus ganhos','renda'] },
  { id: 'earnings-breakdown', title: 'Detalhamento de ganhos', section: 'Financeiro', icon: 'BarChart3', route: '/earnings/breakdown',
    keywords: ['detalhamento','breakdown','origem dos ganhos','de onde vem','analise ganhos','análise ganhos'] },
  { id: 'earnings-statement', title: 'Extrato', section: 'Financeiro', icon: 'FileText', route: '/earnings/statement',
    keywords: ['extrato','historico financeiro','histórico financeiro','statement','movimentos','movimentacao','movimentação'] },
  { id: 'wallet', title: 'Carteira', section: 'Financeiro', icon: 'Wallet', route: '/wallet',
    keywords: ['carteira','saldo','wallet','meu saldo','dinheiro na conta'] },
  { id: 'creator-wallet', title: 'Carteira do Criador', section: 'Financeiro', icon: 'Wallet', route: '/creator-wallet',
    keywords: ['carteira criador','saques','retirar dinheiro','pix saque','sacar','retirada'] },
  { id: 'transactions', title: 'Transações', section: 'Financeiro', icon: 'ArrowLeftRight', route: '/transactions',
    keywords: ['transacoes','transações','pagamentos','compras','historico de compras','histórico de compras'] },
  { id: 'bank-info', title: 'Dados bancários', section: 'Financeiro', icon: 'Landmark', route: '/bank-info',
    keywords: ['banco','dados bancarios','pix','chave pix','conta bancaria','minha chave pix','cadastrar pix'] },
  { id: 'coupons', title: 'Meus cupons', section: 'Financeiro', icon: 'Ticket', route: '/earnings/coupons',
    keywords: ['cupons','cupom','desconto','codigo promocional','código promocional','promo'] },
  { id: 'monetizacao', title: 'Ativar monetização', section: 'Financeiro', icon: 'Banknote', route: '/monetizacao',
    keywords: ['monetizacao','monetização','monetizar','ganhar dinheiro','virar criador','ativar vendas','vender conteudo','vender conteúdo'] },
  { id: 'invoices', title: 'Minhas faturas', section: 'Financeiro', icon: 'Receipt', route: '/dashboard',
    keywords: ['faturas','invoices','recibos','nota fiscal','minhas faturas','boletos'] },

  // ───────── Programa de Indicações (sinônimos: indicados, afiliados, madrinha) ─────────
  { id: 'indicacoes', title: 'Programa de Indicações', description: 'Indique amigos e ganhe comissões', section: 'Indicações', icon: 'Gift', route: '/indicacoes',
    keywords: ['indicacoes','indicações','indicados','indicado','minhas indicacoes','minhas indicações','afiliados','afiliado','referral','convidar amigos','convidar','madrinha','madrinhas','padrinho','comissao','comissão','comissoes','comissões','indicar','meu codigo','meu código','link de convite','programa de indicacoes','programa de indicações'] },

  // ───────── Configurações ─────────
  { id: 'settings', title: 'Configurações', section: 'Configurações', icon: 'Settings', route: '/settings',
    keywords: ['configuracoes','configurações','ajustes','preferencias','preferências','settings','opcoes','opções'] },
  { id: 'settings-pulses', title: 'Pulsos & Atenção', section: 'Configurações', icon: 'Activity', route: '/settings/pulses',
    keywords: ['pulsos','atencao','atenção','pings','sinais','pulso de aura','aura pulse'] },
  { id: 'settings-pulses-history', title: 'Histórico de Atenção', section: 'Configurações', icon: 'History', route: '/settings/pulses/history',
    keywords: ['historico atencao','histórico de atenção','quem te notou','pulsos recebidos'] },
  { id: 'theme', title: 'Tema claro/escuro', section: 'Configurações', icon: 'Moon', route: '/settings',
    keywords: ['tema','modo escuro','dark mode','claro','escuro','aparencia','aparência','cor do app'] },
  { id: 'language', title: 'Idioma', section: 'Configurações', icon: 'Languages', route: '/settings',
    keywords: ['idioma','language','portugues','português','english','espanhol','traducao','tradução','mudar idioma'] },
  { id: 'ghost-mode', title: 'Modo Invisível (Ghost)', section: 'Configurações', icon: 'Ghost', route: '/settings',
    keywords: ['modo invisivel','invisível','ghost','anonimo','anônimo','navegar oculto','espionar sem aparecer'] },
  { id: 'couple-verification', title: 'Verificação de Casal', section: 'Configurações', icon: 'BadgeCheck', route: '/couple-verification',
    keywords: ['verificacao casal','verificação casal','verificar casal','selo casal','duo','dupla verificada'] },

  // ───────── Suporte ─────────
  { id: 'support', title: 'Central de Ajuda / Suporte', section: 'Suporte', icon: 'LifeBuoy', route: '/support',
    keywords: ['suporte','ajuda','contato','reclamar','duvida','dúvida','ticket','central de ajuda','falar com suporte','atendimento','sac'] },
  { id: 'report', title: 'Denunciar', section: 'Suporte', icon: 'Flag', route: '/denunciar',
    keywords: ['denunciar','denuncia','denúncia','reportar','reportar usuario','reportar usuário','abuso','problema'] },
  { id: 'appeal', title: 'Contestação', section: 'Suporte', icon: 'Scale', route: '/contestacao',
    keywords: ['contestacao','contestação','contestar','recurso','apelacao','apelação'] },

  // ───────── Legal ─────────
  { id: 'legal-terms', title: 'Termos de Uso', section: 'Legal', icon: 'FileText', route: '/legal/termos-de-uso',
    keywords: ['termos','termos de uso','contrato','condicoes','condições'] },
  { id: 'legal-privacy', title: 'Política de Privacidade', section: 'Legal', icon: 'Shield', route: '/legal/politica-de-privacidade',
    keywords: ['privacidade','politica','política','lgpd','dados pessoais','politica de privacidade'] },
];
