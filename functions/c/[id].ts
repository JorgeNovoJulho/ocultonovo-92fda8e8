import ogHandler from '../../api/og-c';

export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);

  // Quando o React redireciona para ?app=1, deixa o SPA responder normalmente.
  if (url.searchParams.get('app') === '1') return context.next();

  const id = String(context.params?.id || '').trim();
  if (!id || id === 'og-image') return context.next();

  url.pathname = '/api/og-c';
  url.searchParams.set('id', id);
  return ogHandler(new Request(url.toString(), context.request));
};