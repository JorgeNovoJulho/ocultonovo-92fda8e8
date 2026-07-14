import { useCallback, useEffect } from 'react';
import { useImpersonationStore } from '@/store/useImpersonationStore';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/**
 * Hook that intercepts actions when shadowban simulation is active.
 * When in 'as_banned_user' mode, actions appear to succeed but are not persisted.
 * When in 'as_external_viewer' mode, the admin validates that content is hidden.
 */
export function useShadowbanInterceptor() {
  const simulatedShadowban = useImpersonationStore((s) => s.simulatedShadowban);
  const targetUser = useImpersonationStore((s) => s.targetUser);
  
  const isSimulatingAsBannedUser = simulatedShadowban === 'as_banned_user';
  const isSimulatingAsExternalViewer = simulatedShadowban === 'as_external_viewer';
  const isSimulating = isSimulatingAsBannedUser || isSimulatingAsExternalViewer;
  
  // Show persistent toast when in external viewer mode
  useEffect(() => {
    if (isSimulatingAsExternalViewer && targetUser) {
      const toastId = toast.info(
        `🔍 Validação Shadowban: Verificando se conteúdo de @${targetUser.username || targetUser.name} está oculto`,
        {
          duration: Infinity,
          id: 'shadowban-validation',
        }
      );
      
      return () => {
        toast.dismiss(toastId);
      };
    }
  }, [isSimulatingAsExternalViewer, targetUser]);
  
  // Show discreet toast when simulating as banned user
  useEffect(() => {
    if (isSimulatingAsBannedUser) {
      toast.info('Modo Shadowban: Ações locais apenas', {
        duration: 3000,
        id: 'shadowban-info',
      });
    }
  }, [isSimulatingAsBannedUser]);

  /**
   * Intercepts an action when shadowban simulation is active.
   * In 'as_banned_user' mode: Simulates success without actual persistence.
   * 
   * @param action - The original async action to perform
   * @param actionType - Type of action for logging (e.g., 'post', 'like', 'comment')
   * @returns The action result or simulated success
   */
  const interceptAction = useCallback(async <T,>(
    action: () => Promise<T>,
    actionType: string
  ): Promise<{ success: boolean; simulated: boolean; data?: T }> => {
    if (isSimulatingAsBannedUser) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
      
      logger.log(`[Shadowban Sim] Action "${actionType}" intercepted - not persisted`);
      
      // Return simulated success
      return { success: true, simulated: true };
    }
    
    // Execute real action
    try {
      const result = await action();
      return { success: true, simulated: false, data: result };
    } catch (error) {
      console.error(`[Action Error] ${actionType}:`, error);
      throw error;
    }
  }, [isSimulatingAsBannedUser]);

  /**
   * Checks if content should be hidden based on shadowban simulation.
   * In 'as_external_viewer' mode, content from the impersonated user should be hidden.
   * 
   * @param authorId - The profile ID of the content author
   * @returns Whether the content should be hidden
   */
  const shouldHideContent = useCallback((authorId: string): boolean => {
    if (!isSimulatingAsExternalViewer || !targetUser) return false;
    
    // In external viewer mode, hide content from the impersonated user
    return authorId === targetUser.id;
  }, [isSimulatingAsExternalViewer, targetUser]);

  /**
   * Filter posts to simulate shadowban visibility.
   * 
   * @param posts - Array of posts to filter
   * @param authorIdField - The field name containing the author ID (default: 'user_id')
   * @returns Filtered posts
   */
  const filterShadowbannedContent = useCallback(<T extends Record<string, unknown>>(
    posts: T[],
    authorIdField: string = 'user_id'
  ): T[] => {
    if (!isSimulatingAsExternalViewer || !targetUser) return posts;
    
    return posts.filter(post => post[authorIdField] !== targetUser.id);
  }, [isSimulatingAsExternalViewer, targetUser]);

  return {
    interceptAction,
    shouldHideContent,
    filterShadowbannedContent,
    isSimulating,
    isSimulatingAsBannedUser,
    isSimulatingAsExternalViewer,
    simulatedShadowban,
  };
}

/**
 * Hook to use in mutation hooks to automatically intercept actions when shadowban is active.
 */
export function useShadowbanMutationWrapper() {
  const { isSimulatingAsBannedUser } = useShadowbanInterceptor();
  
  /**
   * Wraps a mutation function to intercept it when shadowban is simulated.
   */
  const wrapMutation = useCallback(<TVariables, TResult>(
    mutationFn: (variables: TVariables) => Promise<TResult>,
    actionType: string
  ) => {
    return async (variables: TVariables): Promise<TResult> => {
      if (isSimulatingAsBannedUser) {
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
        
        logger.log(`[Shadowban Sim] Mutation "${actionType}" intercepted - not persisted`);
        
        // Return undefined as TResult (caller should handle this)
        return undefined as TResult;
      }
      
      return mutationFn(variables);
    };
  }, [isSimulatingAsBannedUser]);
  
  return { wrapMutation, isSimulatingAsBannedUser };
}
