import type { ChatTimestampMode } from './types';

export const formatChatTimestamp = (dateStr: string, mode: ChatTimestampMode) => {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions =
    mode === 'time'
      ? { hour: '2-digit', minute: '2-digit' }
      : {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        };

  return date.toLocaleString('pt-BR', options);
};

export const formatExactLastSeen = (value?: string | null) => {
  if (!value) return 'Último acesso indisponível';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Último acesso indisponível';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};
