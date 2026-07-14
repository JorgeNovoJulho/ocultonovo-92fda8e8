import handler from '../../api/link-cover-image';

export const onRequest = async (context: any) => {
  return handler(context.request);
};