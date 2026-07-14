/**
 * Centralized logger — only outputs in development.
 * Completely silent in production (tree-shaken by bundler).
 */

const IS_DEV = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => IS_DEV && console.log(...args),
  warn: (...args: unknown[]) => IS_DEV && console.warn(...args),
  error: (...args: unknown[]) => IS_DEV && console.error(...args),
  info: (...args: unknown[]) => IS_DEV && console.info(...args),
  // Always allowed: critical production errors that must never be silenced
  critical: (...args: unknown[]) => console.error('[CRITICAL]', ...args),
};
