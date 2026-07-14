/**
 * useAdHistory — histórico de estado com undo/redo para o draft do anúncio.
 * Mantém pilha leve (máx 30 snapshots) para não pesar em celular fraco.
 */
import { useCallback, useRef, useState } from "react";

const MAX_HISTORY = 30;

export function useAdHistory<T>(initial: T) {
  const [state, setStateRaw] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const skipNext = useRef(false);

  const setState = useCallback((updater: T | ((prev: T) => T)) => {
    setStateRaw((prev) => {
      const next =
        typeof updater === "function"
          ? (updater as (p: T) => T)(prev)
          : updater;
      if (skipNext.current) {
        skipNext.current = false;
        return next;
      }
      // só registra se mudou de fato (compare shallow ref)
      if (next !== prev) {
        past.current.push(prev);
        if (past.current.length > MAX_HISTORY) past.current.shift();
        future.current = [];
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    setStateRaw((curr) => {
      const prev = past.current.pop()!;
      future.current.push(curr);
      skipNext.current = true;
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    setStateRaw((curr) => {
      const next = future.current.pop()!;
      past.current.push(curr);
      skipNext.current = true;
      return next;
    });
  }, []);

  /** Substitui estado sem empilhar (uso interno: hidratação inicial). */
  const replace = useCallback((v: T) => {
    skipNext.current = true;
    setStateRaw(v);
    past.current = [];
    future.current = [];
  }, []);

  return {
    state,
    setState,
    undo,
    redo,
    replace,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
