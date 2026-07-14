import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { isMasterUsernameVariant, MASTER_USERNAME_CANONICAL } from '@/lib/masterUsername';

interface UsernameCheckResult {
  isChecking: boolean;
  isAvailable: boolean | null; // null = not checked yet
  error: string | null;
}

/**
 * Debounced username availability checker.
 * Queries profiles table to prevent unique constraint crashes.
 */
export function useUsernameCheck(username: string, currentUserId?: string, debounceMs = 500): UsernameCheckResult {
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Reset if empty or too short
    const clean = (username || '').trim().toLowerCase();
    
    const RESERVED_USERNAMES = [
      "admin",
      "administrador",
      "adm",
      "suporte",
      "moderador",
      "oculto",
    ];

    if (!clean || clean.length < 3) {
      setIsAvailable(null);
      setError(clean.length > 0 && clean.length < 3 ? 'Mínimo 3 caracteres' : null);
      setIsChecking(false);
      return;
    }

    // Validate format
    if (!/^[a-z0-9_]+$/.test(clean)) {
      setIsAvailable(false);
      setError('Apenas letras, números e _');
      setIsChecking(false);
      return;
    }

    if (clean.length > 30) {
      setIsAvailable(false);
      setError('Máximo 30 caracteres');
      setIsChecking(false);
      return;
    }

    // Reserved keywords check
    if (isMasterUsernameVariant(clean) && clean !== MASTER_USERNAME_CANONICAL) {
      setIsAvailable(false);
      setError(`O username reservado do master é ${MASTER_USERNAME_CANONICAL}.`);
      setIsChecking(false);
      return;
    }

    if (
      RESERVED_USERNAMES.some(r => clean === r) || 
      clean.includes("administrador") || 
      clean.includes("moderador") ||
      (clean.includes("admin") && !isMasterUsernameVariant(clean))
    ) {
      setIsAvailable(false);
      setError('Este @username é reservado ou inválido.');
      setIsChecking(false);
      return;
    }


    setIsChecking(true);
    setError(null);

    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { data, error: dbErr } = await supabase
          .from('profiles')
          .select('id, user_id')
          .eq('username', clean)
          .limit(1)
          .maybeSingle();

        if (controller.signal.aborted) return;

        if (dbErr) {
          console.warn('[UsernameCheck] DB error:', dbErr.message);
          setIsAvailable(null);
          setError(null); // Don't block save on DB error
        } else if (
          data &&
          // profiles.id pode diferir de auth.users.id em contas antigas/duplicadas.
          // Considera o username como do próprio usuário se bater por id OU user_id.
          (data as any).id !== currentUserId &&
          (data as any).user_id !== currentUserId
        ) {
          setIsAvailable(false);
          setError('Username já está em uso');
        } else {
          setIsAvailable(true);
          setError(null);
        }
      } catch {
        if (!controller.signal.aborted) {
          setIsAvailable(null);
          setError(null);
        }
      } finally {
        if (!controller.signal.aborted) setIsChecking(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [username, currentUserId, debounceMs]);

  return { isChecking, isAvailable, error };
}
