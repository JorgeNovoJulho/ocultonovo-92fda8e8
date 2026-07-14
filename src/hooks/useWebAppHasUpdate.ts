/**
 * useWebAppHasUpdate — consulta /version.json (via checkWebAppVersion) e
 * devolve se há uma atualização do WebApp pendente. Cache 5 min.
 *
 * Usado pelo carrossel "Descubra o Universo Oculto" para decidir a ordem:
 *  - sem atualização → "Faça sua primeira publicação" aparece em 1º.
 *  - com atualização → "Atualização do WebApp" volta para o 1º lugar
 *    e o card de primeira publicação cai para o 2º.
 */
import { useQuery } from "@tanstack/react-query";
import { checkWebAppVersion } from "@/utils/appUpdateRecovery";

export function useWebAppHasUpdate() {
  return useQuery({
    queryKey: ["webapp-has-update"],
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<boolean> => {
      try {
        const info = await checkWebAppVersion();
        return info ? !info.upToDate : false;
      } catch {
        return false;
      }
    },
  });
}
