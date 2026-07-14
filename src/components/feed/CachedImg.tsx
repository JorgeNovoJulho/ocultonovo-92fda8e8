/**
 * CachedImg — <img> que usa o cache persistente em 3 camadas do
 * ocultoPlayMediaCache (memória + sessionStorage + CacheStorage) para que
 * a imagem nunca seja re-baixada da rede em logins/montagens subsequentes.
 *
 * Primeiro render tenta blob: URL síncrono (cache memória). Se hit, usa-o.
 * Caso contrário, dispara lookup async no CacheStorage e prefetch para
 * popular a próxima visita. Em paralelo, exibe a URL original para o
 * navegador renderizar imediatamente (o HTTP cache do browser segura na
 * maioria das visitas — e a partir do segundo carregamento o blob: URL
 * persistido entrega zero round-trip).
 */
import { useEffect, useState, memo } from "react";
import {
  getCachedThumbBlobSync,
  getCachedThumbUrl,
  prefetchThumb,
} from "@/lib/ocultoPlayMediaCache";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
};

function CachedImgImpl({ src, ...rest }: Props) {
  const url = src || "";
  const [resolved, setResolved] = useState<string | null>(() =>
    url ? getCachedThumbBlobSync(url) : null,
  );

  useEffect(() => {
    if (!url) {
      setResolved(null);
      return;
    }
    const sync = getCachedThumbBlobSync(url);
    if (sync) {
      setResolved(sync);
      return;
    }
    let active = true;
    (async () => {
      const fromDisk = await getCachedThumbUrl(url);
      if (active && fromDisk) {
        setResolved(fromDisk);
        return;
      }
      // Sem hit — prefetch para popular o cache na próxima visita.
      prefetchThumb(url);
    })();
    return () => {
      active = false;
    };
  }, [url]);

  if (!url) return null;
  return <img {...rest} src={resolved || url} />;
}

export const CachedImg = memo(CachedImgImpl);
export default CachedImg;
