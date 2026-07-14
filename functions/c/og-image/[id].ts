import imageHandler from '../../../api/og-c-image';

export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);
  const id = String(context.params?.id || '').trim();
  if (!id) return context.next();

  url.pathname = '/api/og-c-image';
  url.searchParams.set('id', id);
  return imageHandler(new Request(url.toString(), context.request));
};