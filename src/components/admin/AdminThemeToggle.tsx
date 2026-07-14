/**
 * AdminThemeToggle — Wrapper do sistema de tema para o painel admin.
 * Reutiliza o hook useTheme centralizado.
 */
import { ThemeToggle } from '@/components/ThemeToggle';

export function AdminThemeToggle() {
  return <ThemeToggle />;
}
