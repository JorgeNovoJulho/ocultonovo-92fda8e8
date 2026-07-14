export type CommunityCreateFeedback = {
  title: string;
  description: string;
};

export function communityCreateFeedback(input?: {
  reason?: string | null;
  message?: string | null;
  current?: number | null;
  limit?: number | null;
}): CommunityCreateFeedback {
  const raw = `${input?.reason ?? ''} ${input?.message ?? ''}`.toLowerCase();

  if (raw.includes('limit_reached')) {
    const current = input?.current ?? 0;
    const limit = input?.limit ?? 0;
    return {
      title: 'Limite de comunidades atingido',
      description: limit > 0
        ? `Seu plano já tem ${current}/${limit} comunidades ativas ou em análise. Arquive uma comunidade existente ou faça upgrade para criar outra.`
        : 'Seu plano atingiu o limite de comunidades ativas ou em análise. Arquive uma comunidade existente ou faça upgrade para criar outra.',
    };
  }

  if (raw.includes('plan_not_allowed')) {
    return {
      title: 'Seu plano não permite criar comunidades',
      description: 'A criação de comunidades está liberada apenas para planos habilitados. Atualize seu plano para criar sua comunidade.',
    };
  }

  if (raw.includes('feature_disabled')) {
    return {
      title: 'Criação temporariamente indisponível',
      description: 'As comunidades estão pausadas no momento. Tente novamente mais tarde.',
    };
  }

  if (raw.includes('duplicate key') || raw.includes('unique')) {
    return {
      title: 'Nome ou URL já em uso',
      description: 'Escolha outro nome para gerar uma URL diferente para a comunidade.',
    };
  }

  return {
    title: 'Não foi possível criar a comunidade',
    description: 'Revise os dados e tente novamente. Se continuar, avise o suporte.',
  };
}
